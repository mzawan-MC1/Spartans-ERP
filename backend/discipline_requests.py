from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid

from rbac import check_permission

router = APIRouter(tags=["Discipline Requests"])

_db = None
_get_current_user = None


def init(database, auth_func):
    global _db, _get_current_user
    _db = database
    _get_current_user = auth_func


async def _get_location_context(user: dict, request: Request) -> str:
    if user.get("role") in ("OWNER", "OWNER_FULL"):
        location_id = request.query_params.get("location_id")
        if not location_id:
            raise HTTPException(400, "location_id is required")
        owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
        loc = await _db.locations.find_one({"location_id": location_id, "owner_id": owner_id, "is_deleted": False})
        if not loc:
            raise HTTPException(403, "Access denied to this location")
        return location_id
    if user.get("location_id"):
        return user["location_id"]
    raise HTTPException(403, "Insufficient permissions")


async def _require_manager_approver(request: Request) -> dict:
    user = await _get_current_user(request)
    if user.get("role") in ("CUSTOMER", "MEMBER"):
        raise HTTPException(403, "Access denied")
    if not await check_permission(user, "manager.approve_discipline_requests"):
        if not await check_permission(user, "manager.manage_programs") and not await check_permission(user, "manager.manage_schedules"):
            raise HTTPException(403, "Missing permission: manager.approve_discipline_requests")
    return user


async def _require_coach_user(request: Request) -> dict:
    user = await _get_current_user(request)
    if user.get("role") == "MEMBER" or user.get("role") == "CUSTOMER":
        raise HTTPException(403, "Access denied")
    if user.get("role") not in ("INSTRUCTOR", "LOCATION_MANAGER", "OWNER", "OWNER_FULL"):
        raise HTTPException(403, "Coach access required")
    return user


async def _is_category_supervisor(*, user: dict, location_id: str, category_id: str) -> bool:
    staff_id = user.get("staff_id")
    if not staff_id:
        return False
    cat = await _db.program_categories.find_one(
        {"category_id": category_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "supervisor_staff_id": 1},
    )
    if not cat:
        return False
    return (cat.get("supervisor_staff_id") or "") == staff_id


class DisciplineRequestCreate(BaseModel):
    category_id: Optional[str] = None
    request_type: str = Field(..., pattern="^(PROGRAM_CREATE|PROGRAM_UPDATE|SCHEDULE_CREATE|SCHEDULE_UPDATE|SCHEDULE_DELETE|COACH_SCHEDULE_UPDATE|LEAVE_REQUEST|OTHER_REQUEST)$")
    payload: Dict[str, Any] = Field(default_factory=dict)
    target: str = Field("manager", pattern="^(manager|supervisor|both)$")
    note: str = ""


class DisciplineRequestAction(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    decision_note: str = ""


class SupervisorDecision(BaseModel):
    action: str = Field(..., pattern="^(approve|reject)$")
    decision_note: str = ""


async def _apply_request(doc: dict, *, location_id: str, approved_by_user: dict):
    now = datetime.now(timezone.utc).isoformat()
    rt = doc.get("request_type")
    payload = doc.get("payload") or {}

    if rt == "PROGRAM_CREATE":
        category_id = doc.get("category_id")
        if not category_id:
            raise HTTPException(400, "category_id is required")
        cat = await _db.program_categories.find_one(
            {"category_id": category_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0, "is_active": 1},
        )
        if not cat:
            raise HTTPException(400, "Invalid category for this location")
        if not cat.get("is_active", True):
            raise HTTPException(400, "Cannot add program to inactive category")

        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "Program name is required")
        prog_id = f"prog_{uuid.uuid4().hex[:12]}"
        program_doc = {
            "program_id": prog_id,
            "location_id": location_id,
            "category_id": category_id,
            "name": name,
            "description": payload.get("description", "") or "",
            "capacity": int(payload.get("capacity", 20) or 20),
            "difficulty_level": payload.get("difficulty_level", "beginner") or "beginner",
            "is_active": bool(payload.get("is_active", True)),
            "deleted_at": None,
            "created_at": now,
            "updated_at": now,
        }
        await _db.programs.insert_one(program_doc)
        return {"applied_entity": "program", "applied_id": prog_id}

    if rt == "PROGRAM_UPDATE":
        program_id = payload.get("program_id")
        if not program_id:
            raise HTTPException(400, "program_id is required")
        program = await _db.programs.find_one(
            {"program_id": program_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0},
        )
        if not program:
            raise HTTPException(404, "Program not found")
        updates = {}
        for k in ("name", "description", "capacity", "difficulty_level", "is_active"):
            if k in payload and payload[k] is not None:
                updates[k] = payload[k]
        if "capacity" in updates:
            updates["capacity"] = int(updates["capacity"])
        if updates.get("name") is not None:
            updates["name"] = str(updates["name"]).strip()
            if not updates["name"]:
                raise HTTPException(400, "Program name is required")
        if not updates:
            raise HTTPException(400, "No updates provided")
        updates["updated_at"] = now
        await _db.programs.update_one({"program_id": program_id, "location_id": location_id}, {"$set": updates})
        return {"applied_entity": "program", "applied_id": program_id}

    if rt in ("SCHEDULE_CREATE",):
        category_id = doc.get("category_id")
        if not category_id:
            raise HTTPException(400, "category_id is required")
        program_id = payload.get("program_id")
        if not program_id:
            raise HTTPException(400, "program_id is required")
        prog = await _db.programs.find_one(
            {"program_id": program_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0, "category_id": 1, "is_active": 1},
        )
        if not prog or prog.get("category_id") != category_id:
            raise HTTPException(400, "Program must belong to the selected discipline")
        if not prog.get("is_active", True):
            raise HTTPException(400, "Cannot schedule an inactive program")

        instructor_ids = payload.get("instructor_ids") or []
        if not isinstance(instructor_ids, list):
            raise HTTPException(400, "instructor_ids must be a list")
        instructor_ids = [i for i in instructor_ids if i]
        if not instructor_ids:
            raise HTTPException(400, "At least one instructor is required")
        instructors = await _db.instructors.find(
            {"instructor_id": {"$in": instructor_ids}, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0, "instructor_id": 1},
        ).to_list(200)
        found = {i.get("instructor_id") for i in instructors}
        if len(found) != len(set(instructor_ids)):
            raise HTTPException(400, "Invalid instructor for this location")

        schedule_id = f"sch_{uuid.uuid4().hex[:12]}"
        day_of_week = payload.get("day_of_week")
        start_time = payload.get("start_time")
        end_time = payload.get("end_time")
        if day_of_week is None or start_time is None or end_time is None:
            raise HTTPException(400, "day_of_week, start_time, end_time are required")
        schedule_doc = {
            "schedule_id": schedule_id,
            "location_id": location_id,
            "program_id": program_id,
            "instructor_ids": instructor_ids,
            "instructor_id": instructor_ids[0],
            "day_of_week": int(day_of_week),
            "start_time": str(start_time),
            "end_time": str(end_time),
            "room": payload.get("room", "") or "",
            "capacity_override": payload.get("capacity_override"),
            "is_active": bool(payload.get("is_active", True)),
            "deleted_at": None,
            "created_at": now,
            "updated_at": now,
        }
        await _db.class_schedules.insert_one(schedule_doc)
        return {"applied_entity": "schedule", "applied_id": schedule_id}

    if rt in ("SCHEDULE_UPDATE", "COACH_SCHEDULE_UPDATE"):
        schedule_id = payload.get("schedule_id")
        if not schedule_id:
            raise HTTPException(400, "schedule_id is required")
        sch = await _db.class_schedules.find_one(
            {"schedule_id": schedule_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0},
        )
        if not sch:
            raise HTTPException(404, "Schedule not found")

        updates = {}
        for k in ("day_of_week", "start_time", "end_time", "room", "capacity_override", "is_active"):
            if k in payload and payload[k] is not None:
                updates[k] = payload[k]

        if "instructor_ids" in payload and payload["instructor_ids"] is not None:
            instructor_ids = payload.get("instructor_ids") or []
            if not isinstance(instructor_ids, list):
                raise HTTPException(400, "instructor_ids must be a list")
            instructor_ids = [i for i in instructor_ids if i]
            if not instructor_ids:
                raise HTTPException(400, "At least one instructor is required")
            instructors = await _db.instructors.find(
                {"instructor_id": {"$in": instructor_ids}, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
                {"_id": 0, "instructor_id": 1},
            ).to_list(200)
            found = {i.get("instructor_id") for i in instructors}
            if len(found) != len(set(instructor_ids)):
                raise HTTPException(400, "Invalid instructor for this location")
            updates["instructor_ids"] = instructor_ids
            updates["instructor_id"] = instructor_ids[0]

        if "day_of_week" in updates:
            updates["day_of_week"] = int(updates["day_of_week"])
        if not updates:
            raise HTTPException(400, "No updates provided")
        updates["updated_at"] = now
        await _db.class_schedules.update_one({"schedule_id": schedule_id, "location_id": location_id}, {"$set": updates})
        return {"applied_entity": "schedule", "applied_id": schedule_id}

    if rt == "SCHEDULE_DELETE":
        schedule_id = payload.get("schedule_id")
        if not schedule_id:
            raise HTTPException(400, "schedule_id is required")
        sch = await _db.class_schedules.find_one(
            {"schedule_id": schedule_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0},
        )
        if not sch:
            raise HTTPException(404, "Schedule not found")
        await _db.class_schedules.update_one(
            {"schedule_id": schedule_id, "location_id": location_id},
            {"$set": {"deleted_at": now, "updated_at": now}},
        )
        return {"applied_entity": "schedule", "applied_id": schedule_id}

    raise HTTPException(400, "Unsupported request type")


@router.post("/discipline/requests", status_code=201)
async def create_discipline_request(data: DisciplineRequestCreate, request: Request):
    user = await _require_coach_user(request)
    lid = await _get_location_context(user, request)

    if data.request_type in {"PROGRAM_CREATE", "PROGRAM_UPDATE", "SCHEDULE_CREATE", "SCHEDULE_UPDATE", "SCHEDULE_DELETE"}:
        if not data.category_id:
            raise HTTPException(400, "category_id is required")
        if not await _is_category_supervisor(user=user, location_id=lid, category_id=data.category_id):
            raise HTTPException(403, "Discipline supervisor access required")

    if data.request_type == "COACH_SCHEDULE_UPDATE":
        is_supervisor = False
        if data.category_id:
            is_supervisor = await _is_category_supervisor(user=user, location_id=lid, category_id=data.category_id)
        if not is_supervisor:
            if user.get("role") != "INSTRUCTOR" or not user.get("staff_id"):
                raise HTTPException(403, "Coach access required")
            inst = await _db.instructors.find_one(
                {"staff_id": user["staff_id"], "location_id": lid, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
                {"_id": 0, "instructor_id": 1},
            )
            if not inst:
                raise HTTPException(403, "Coach profile not found")
            schedule_id = (data.payload or {}).get("schedule_id")
            if not schedule_id:
                raise HTTPException(400, "schedule_id is required")
            sch = await _db.class_schedules.find_one(
                {"schedule_id": schedule_id, "location_id": lid, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
                {"_id": 0, "program_id": 1, "instructor_ids": 1, "instructor_id": 1},
            )
            if not sch:
                raise HTTPException(404, "Schedule not found")
            instructor_ids = sch.get("instructor_ids") or ([sch.get("instructor_id")] if sch.get("instructor_id") else [])
            if inst["instructor_id"] not in instructor_ids:
                raise HTTPException(403, "Not allowed to request changes for this schedule")
            if not data.category_id:
                prog = await _db.programs.find_one({"program_id": sch.get("program_id"), "location_id": lid}, {"_id": 0, "category_id": 1})
                data.category_id = (prog or {}).get("category_id")

    if data.request_type in {"LEAVE_REQUEST", "OTHER_REQUEST"}:
        if data.target in {"supervisor", "both"}:
            if not data.category_id:
                raise HTTPException(400, "category_id is required")
            cat = await _db.program_categories.find_one(
                {"category_id": data.category_id, "location_id": lid, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
                {"_id": 0, "supervisor_staff_id": 1},
            )
            if not cat or not cat.get("supervisor_staff_id"):
                raise HTTPException(400, "No supervisor assigned for this discipline")

    if data.target in {"supervisor", "both"}:
        if not data.category_id:
            raise HTTPException(400, "category_id is required")
        cat = await _db.program_categories.find_one(
            {"category_id": data.category_id, "location_id": lid, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"_id": 0, "supervisor_staff_id": 1},
        )
        if not cat or not cat.get("supervisor_staff_id"):
            raise HTTPException(400, "No supervisor assigned for this discipline")

    req_id = f"dreq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "request_id": req_id,
        "location_id": lid,
        "category_id": data.category_id,
        "request_type": data.request_type,
        "payload": data.payload,
        "target": data.target,
        "note": data.note,
        "status": "submitted",
        "requested_by_user_id": user.get("user_id"),
        "requested_by_staff_id": user.get("staff_id"),
        "reviewed_by_user_id": None,
        "reviewed_at": None,
        "decision_note": None,
        "applied_at": None,
        "applied_result": None,
        "supervisor_status": "submitted" if data.target in {"supervisor", "both"} else None,
        "supervisor_by_user_id": None,
        "supervisor_at": None,
        "supervisor_note": None,
        "created_at": now,
        "updated_at": now,
    }
    await _db.discipline_change_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/discipline/requests/my")
async def list_my_discipline_requests(request: Request, status: Optional[str] = None):
    user = await _require_coach_user(request)
    lid = await _get_location_context(user, request)
    query = {"location_id": lid, "requested_by_user_id": user.get("user_id")}
    if status:
        query["status"] = status
    rows = await _db.discipline_change_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return {"requests": rows}


@router.get("/discipline/requests")
async def list_discipline_requests(
    request: Request,
    status: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
):
    user = await _require_manager_approver(request)
    lid = await _get_location_context(user, request)
    query: Dict[str, Any] = {"location_id": lid}
    if status:
        query["status"] = status
    if category_id:
        query["category_id"] = category_id
    rows = await _db.discipline_change_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return {"requests": rows}


@router.patch("/discipline/requests/{request_id}")
async def act_on_discipline_request(request_id: str, data: DisciplineRequestAction, request: Request):
    user = await _require_manager_approver(request)
    lid = await _get_location_context(user, request)

    doc = await _db.discipline_change_requests.find_one({"request_id": request_id, "location_id": lid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if doc.get("status") != "submitted":
        raise HTTPException(400, "Request already processed")

    now = datetime.now(timezone.utc).isoformat()

    if doc.get("target") == "supervisor":
        raise HTTPException(400, "Supervisor-handled request")

    if doc.get("target") == "both" and doc.get("supervisor_status") != "approved":
        raise HTTPException(400, "Supervisor approval required")

    if data.action == "reject":
        await _db.discipline_change_requests.update_one(
            {"request_id": request_id, "location_id": lid},
            {"$set": {
                "status": "rejected",
                "reviewed_by_user_id": user.get("user_id"),
                "reviewed_at": now,
                "decision_note": data.decision_note,
                "updated_at": now,
            }},
        )
        updated = await _db.discipline_change_requests.find_one({"request_id": request_id, "location_id": lid}, {"_id": 0})
        return updated

    applied_result = _apply_request(doc, location_id=lid, approved_by_user=user)
    if hasattr(applied_result, "__await__"):
        applied_result = await applied_result

    await _db.discipline_change_requests.update_one(
        {"request_id": request_id, "location_id": lid},
        {"$set": {
            "status": "approved",
            "reviewed_by_user_id": user.get("user_id"),
            "reviewed_at": now,
            "decision_note": data.decision_note,
            "applied_at": now,
            "applied_result": applied_result,
            "updated_at": now,
        }},
    )
    updated = await _db.discipline_change_requests.find_one({"request_id": request_id, "location_id": lid}, {"_id": 0})
    return updated


@router.get("/discipline/requests/inbox")
async def list_supervisor_inbox(
    request: Request,
    status: Optional[str] = Query("submitted"),
    category_id: Optional[str] = Query(None),
):
    user = await _require_coach_user(request)
    lid = await _get_location_context(user, request)
    staff_id = user.get("staff_id")
    if user.get("role") != "INSTRUCTOR" or not staff_id:
        raise HTTPException(403, "Coach access required")

    cats = await _db.program_categories.find(
        {"location_id": lid, "supervisor_staff_id": staff_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "category_id": 1},
    ).to_list(500)
    allowed_cat_ids = [c.get("category_id") for c in cats if c.get("category_id")]
    if not allowed_cat_ids:
        return {"requests": []}

    query: Dict[str, Any] = {
        "location_id": lid,
        "target": {"$in": ["supervisor", "both"]},
        "category_id": {"$in": allowed_cat_ids},
    }
    if status:
        if status == "submitted":
            query["status"] = "submitted"
            query["supervisor_status"] = "submitted"
        else:
            query["status"] = status
    if category_id:
        query["category_id"] = category_id
    rows = await _db.discipline_change_requests.find(query, {"_id": 0}).sort("created_at", -1).limit(500).to_list(500)
    return {"requests": rows}


@router.patch("/discipline/requests/{request_id}/supervisor")
async def supervisor_decide(request_id: str, data: SupervisorDecision, request: Request):
    user = await _require_coach_user(request)
    lid = await _get_location_context(user, request)
    staff_id = user.get("staff_id")
    if user.get("role") != "INSTRUCTOR" or not staff_id:
        raise HTTPException(403, "Coach access required")

    doc = await _db.discipline_change_requests.find_one({"request_id": request_id, "location_id": lid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Request not found")
    if doc.get("target") not in ("supervisor", "both"):
        raise HTTPException(400, "Not a supervisor-targeted request")
    if doc.get("status") != "submitted":
        raise HTTPException(400, "Request already processed")
    if doc.get("supervisor_status") != "submitted":
        raise HTTPException(400, "Supervisor already processed this request")

    cat_id = doc.get("category_id")
    if not cat_id:
        raise HTTPException(400, "category_id is required")
    if not await _is_category_supervisor(user=user, location_id=lid, category_id=cat_id):
        raise HTTPException(403, "Discipline supervisor access required")

    now = datetime.now(timezone.utc).isoformat()
    if data.action == "reject":
        await _db.discipline_change_requests.update_one(
            {"request_id": request_id, "location_id": lid},
            {"$set": {
                "status": "rejected",
                "supervisor_status": "rejected",
                "supervisor_by_user_id": user.get("user_id"),
                "supervisor_at": now,
                "supervisor_note": data.decision_note,
                "reviewed_by_user_id": user.get("user_id"),
                "reviewed_at": now,
                "decision_note": data.decision_note,
                "updated_at": now,
            }},
        )
        return await _db.discipline_change_requests.find_one({"request_id": request_id, "location_id": lid}, {"_id": 0})

    if doc.get("target") == "supervisor":
        await _db.discipline_change_requests.update_one(
            {"request_id": request_id, "location_id": lid},
            {"$set": {
                "status": "approved",
                "supervisor_status": "approved",
                "supervisor_by_user_id": user.get("user_id"),
                "supervisor_at": now,
                "supervisor_note": data.decision_note,
                "reviewed_by_user_id": user.get("user_id"),
                "reviewed_at": now,
                "decision_note": data.decision_note,
                "updated_at": now,
            }},
        )
        return await _db.discipline_change_requests.find_one({"request_id": request_id, "location_id": lid}, {"_id": 0})

    await _db.discipline_change_requests.update_one(
        {"request_id": request_id, "location_id": lid},
        {"$set": {
            "supervisor_status": "approved",
            "supervisor_by_user_id": user.get("user_id"),
            "supervisor_at": now,
            "supervisor_note": data.decision_note,
            "updated_at": now,
        }},
    )
    return await _db.discipline_change_requests.find_one({"request_id": request_id, "location_id": lid}, {"_id": 0})


@router.get("/discipline/performance")
async def get_discipline_performance(
    request: Request,
    category_id: str = Query(...),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    user = await _require_coach_user(request)
    lid = await _get_location_context(user, request)

    if not await check_permission(user, "manager.view_reports_location") and not await check_permission(user, "manager.approve_discipline_requests"):
        if not await _is_category_supervisor(user=user, location_id=lid, category_id=category_id):
            raise HTTPException(403, "Access denied")

    programs = await _db.programs.find(
        {"location_id": lid, "category_id": category_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "program_id": 1},
    ).to_list(1000)
    program_ids = [p.get("program_id") for p in programs if p.get("program_id")]
    if not program_ids:
        return {"programs": 0, "sessions": 0, "present": 0, "late": 0, "absent": 0}

    sess_query: Dict[str, Any] = {"location_id": lid, "program_id": {"$in": program_ids}}
    if date_from or date_to:
        dt_q = {}
        if date_from:
            dt_q["$gte"] = date_from
        if date_to:
            dt_q["$lte"] = date_to + "T23:59:59"
        sess_query["start_date_time"] = dt_q
    sessions = await _db.class_sessions.find(sess_query, {"_id": 0, "session_id": 1}).to_list(5000)
    session_ids = [s.get("session_id") for s in sessions if s.get("session_id")]
    if not session_ids:
        return {"programs": len(program_ids), "sessions": 0, "present": 0, "late": 0, "absent": 0}

    agg = await _db.attendance_records.aggregate([
        {"$match": {"location_id": lid, "session_id": {"$in": session_ids}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(None)
    counts = {a["_id"]: a["count"] for a in agg if a.get("_id")}
    return {
        "programs": len(program_ids),
        "sessions": len(session_ids),
        "present": counts.get("present", 0),
        "late": counts.get("late", 0),
        "absent": counts.get("absent", 0),
    }

