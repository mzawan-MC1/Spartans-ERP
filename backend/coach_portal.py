from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/coach", tags=["Coach Portal"])

_db = None
_get_current_user = None


def init(database, auth_func):
    global _db, _get_current_user
    _db = database
    _get_current_user = auth_func


async def _require_coach(request: Request) -> dict:
    user = await _get_current_user(request)
    if user.get("role") in ("CUSTOMER", "MEMBER"):
        raise HTTPException(403, "Access denied")
    if user.get("role") != "INSTRUCTOR":
        raise HTTPException(403, "Coach access required")
    if not user.get("location_id"):
        raise HTTPException(403, "No location assigned")
    return user


async def _get_instructor_for_user(user: dict):
    staff_id = user.get("staff_id")
    if not staff_id:
        raise HTTPException(403, "Coach profile is not linked to staff")
    inst = await _db.instructors.find_one(
        {"staff_id": staff_id, "location_id": user["location_id"], "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0},
    )
    if not inst:
        raise HTTPException(403, "Coach profile not found")
    return inst


async def _get_instructor_ids_for_user(user: dict) -> List[str]:
    staff_id = user.get("staff_id")
    if not staff_id:
        raise HTTPException(403, "Coach profile is not linked to staff")
    rows = await _db.instructors.find(
        {"staff_id": staff_id, "location_id": user["location_id"], "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "instructor_id": 1},
    ).to_list(50)
    ids = [r.get("instructor_id") for r in rows if r.get("instructor_id")]
    if not ids:
        raise HTTPException(403, "Coach profile not found")
    return ids


@router.get("/profile")
async def get_coach_profile(request: Request):
    user = await _require_coach(request)
    inst = await _get_instructor_for_user(user)
    staff = await _db.staff.find_one({"staff_id": inst.get("staff_id"), "location_id": user["location_id"]}, {"_id": 0})
    location = await _db.locations.find_one({"location_id": user["location_id"], "is_deleted": False}, {"_id": 0, "location_id": 1, "name": 1, "slug": 1})
    return {"user": {k: user.get(k) for k in ["user_id", "email", "name", "role", "location_id", "staff_id"]}, "instructor": inst, "staff": staff, "location": location}


@router.get("/disciplines")
async def get_my_supervised_disciplines(request: Request):
    user = await _require_coach(request)
    staff_id = user.get("staff_id")
    if not staff_id:
        return {"disciplines": []}
    rows = await _db.program_categories.find(
        {"location_id": user["location_id"], "supervisor_staff_id": staff_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0},
    ).sort("name", 1).to_list(200)
    return {"disciplines": rows}


@router.get("/categories")
async def get_branch_categories(request: Request, include_inactive: bool = True):
    user = await _require_coach(request)
    query = {"location_id": user["location_id"], "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    if not include_inactive:
        query["is_active"] = True
    rows = await _db.program_categories.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return {"categories": rows}


async def _require_supervisor_for_category(request: Request, category_id: str) -> dict:
    user = await _require_coach(request)
    staff_id = user.get("staff_id")
    if not staff_id:
        raise HTTPException(403, "Coach profile is not linked to staff")
    cat = await _db.program_categories.find_one(
        {"category_id": category_id, "location_id": user["location_id"], "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "supervisor_staff_id": 1},
    )
    if not cat or (cat.get("supervisor_staff_id") or "") != staff_id:
        raise HTTPException(403, "Discipline supervisor access required")
    return user


@router.get("/supervisor/programs")
async def get_supervisor_programs(request: Request, category_id: str = Query(...), include_inactive: bool = True):
    user = await _require_supervisor_for_category(request, category_id)
    query = {"location_id": user["location_id"], "category_id": category_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    if not include_inactive:
        query["is_active"] = True
    programs = await _db.programs.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return {"programs": programs}


@router.get("/supervisor/schedules")
async def get_supervisor_schedules(request: Request, category_id: str = Query(...), include_inactive: bool = True):
    user = await _require_supervisor_for_category(request, category_id)
    progs = await _db.programs.find(
        {"location_id": user["location_id"], "category_id": category_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "program_id": 1, "name": 1},
    ).to_list(2000)
    program_ids = [p.get("program_id") for p in progs if p.get("program_id")]
    program_name_by_id = {p.get("program_id"): p.get("name") for p in progs if p.get("program_id")}
    if not program_ids:
        return {"schedules": []}
    query = {"location_id": user["location_id"], "program_id": {"$in": program_ids}, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    if not include_inactive:
        query["is_active"] = True
    schedules = await _db.class_schedules.find(query, {"_id": 0}).sort([("day_of_week", 1), ("start_time", 1)]).to_list(1000)
    for s in schedules:
        pid = s.get("program_id")
        if pid and pid in program_name_by_id:
            s["program_name"] = program_name_by_id[pid]
    return {"schedules": schedules}


@router.get("/supervisor/coaches")
async def get_supervisor_coaches(request: Request, category_id: str = Query(...)):
    user = await _require_supervisor_for_category(request, category_id)
    progs = await _db.programs.find(
        {"location_id": user["location_id"], "category_id": category_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "program_id": 1},
    ).to_list(2000)
    program_ids = [p.get("program_id") for p in progs if p.get("program_id")]
    if not program_ids:
        return {"coaches": []}
    schedules = await _db.class_schedules.find(
        {"location_id": user["location_id"], "program_id": {"$in": program_ids}, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "instructor_ids": 1, "instructor_id": 1},
    ).to_list(2000)
    instructor_ids = set()
    for s in schedules:
        ids = s.get("instructor_ids") or ([s.get("instructor_id")] if s.get("instructor_id") else [])
        for i in ids:
            if i:
                instructor_ids.add(i)
    if not instructor_ids:
        return {"coaches": []}
    coaches = await _db.instructors.find(
        {"location_id": user["location_id"], "instructor_id": {"$in": list(instructor_ids)}, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0},
    ).sort("full_name", 1).to_list(500)
    return {"coaches": coaches}


@router.get("/schedule")
async def get_my_schedule(request: Request, include_inactive: bool = False):
    user = await _require_coach(request)
    instructor_ids = await _get_instructor_ids_for_user(user)
    instructor_keys = [*instructor_ids, user.get("staff_id")]
    instructor_keys = [k for k in instructor_keys if k]
    query = {
        "location_id": user["location_id"],
        "$and": [
            {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            {"$or": [{"instructor_id": {"$in": instructor_keys}}, {"instructor_ids": {"$in": instructor_keys}}]},
        ],
    }
    if not include_inactive:
        query["is_active"] = True
    rows = await _db.class_schedules.find(query, {"_id": 0}).sort([("day_of_week", 1), ("start_time", 1)]).to_list(500)
    program_ids = list({r.get("program_id") for r in rows if r.get("program_id")})
    if program_ids:
        progs = await _db.programs.find(
            {"location_id": user["location_id"], "program_id": {"$in": program_ids}},
            {"_id": 0, "program_id": 1, "name": 1},
        ).to_list(2000)
        program_name_by_id = {p.get("program_id"): p.get("name") for p in progs if p.get("program_id")}
        for r in rows:
            pid = r.get("program_id")
            if pid and pid in program_name_by_id:
                r["program_name"] = program_name_by_id[pid]
    return {"schedules": rows}


@router.get("/sessions")
async def get_my_sessions(
    request: Request,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    user = await _require_coach(request)
    instructor_ids = await _get_instructor_ids_for_user(user)
    instructor_keys = [*instructor_ids, user.get("staff_id")]
    instructor_keys = [k for k in instructor_keys if k]
    query = {"location_id": user["location_id"], "instructor_id": {"$in": instructor_keys}}
    if date_from or date_to:
        dt_q = {}
        if date_from:
            dt_q["$gte"] = date_from
        if date_to:
            dt_q["$lte"] = date_to
        query["start_date_time"] = dt_q
    rows = await _db.class_sessions.find(query, {"_id": 0}).sort("start_date_time", 1).limit(500).to_list(500)
    program_ids = list({r.get("program_id") for r in rows if r.get("program_id")})
    if program_ids:
        progs = await _db.programs.find(
            {"location_id": user["location_id"], "program_id": {"$in": program_ids}},
            {"_id": 0, "program_id": 1, "name": 1},
        ).to_list(2000)
        program_name_by_id = {p.get("program_id"): p.get("name") for p in progs if p.get("program_id")}
        for r in rows:
            pid = r.get("program_id")
            if pid and pid in program_name_by_id:
                r["program_name"] = program_name_by_id[pid]
    return {"sessions": rows}


@router.get("/sessions/{session_id}/roster")
async def get_session_roster(session_id: str, request: Request):
    user = await _require_coach(request)
    instructor_ids = await _get_instructor_ids_for_user(user)
    session = await _db.class_sessions.find_one({"session_id": session_id, "location_id": user["location_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    if session.get("instructor_id") not in set([*instructor_ids, user.get("staff_id")]):
        raise HTTPException(403, "Not allowed for this session")

    bookings = await _db.bookings.find(
        {"session_id": session_id, "status": {"$in": ["BOOKED", "booked"]}},
        {"_id": 0, "customer_id": 1},
    ).to_list(500)
    customer_ids = [b.get("customer_id") for b in bookings if b.get("customer_id")]
    customers = []
    if customer_ids:
        customers = await _db.users.find(
            {"user_id": {"$in": customer_ids}, "location_id": user["location_id"]},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "phone": 1},
        ).to_list(500)

    existing = await _db.attendance_records.find(
        {"location_id": user["location_id"], "session_id": session_id},
        {"_id": 0, "customer_id": 1, "status": 1},
    ).to_list(500)
    return {"session": session, "customers": customers, "attendance": existing}


class CoachAttendanceEntry(BaseModel):
    customer_id: str
    status: str = Field(..., pattern="^(present|absent|late)$")


class CoachAttendanceBulk(BaseModel):
    session_id: str
    records: List[CoachAttendanceEntry]


@router.post("/attendance")
async def save_my_attendance(data: CoachAttendanceBulk, request: Request):
    user = await _require_coach(request)
    instructor_ids = await _get_instructor_ids_for_user(user)
    session = await _db.class_sessions.find_one({"session_id": data.session_id, "location_id": user["location_id"]}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found")
    if session.get("instructor_id") not in set([*instructor_ids, user.get("staff_id")]):
        raise HTTPException(403, "Not allowed for this session")

    now = datetime.now(timezone.utc).isoformat()
    attendance_dt = session.get("start_date_time")
    program_id = session.get("program_id")

    for rec in data.records:
        query = {"location_id": user["location_id"], "session_id": data.session_id, "customer_id": rec.customer_id}
        existing = await _db.attendance_records.find_one(query, {"_id": 0, "record_id": 1})
        if existing:
            await _db.attendance_records.update_one(
                {"record_id": existing["record_id"]},
                {"$set": {"status": rec.status, "updated_at": now, "check_in_method": "coachManual"}},
            )
        else:
            await _db.attendance_records.insert_one({
                "record_id": f"att_{uuid.uuid4().hex[:12]}",
                "location_id": user["location_id"],
                "customer_id": rec.customer_id,
                "program_id": program_id,
                "session_id": data.session_id,
                "attendance_date_time": attendance_dt,
                "status": rec.status,
                "check_in_method": "coachManual",
                "created_at": now,
                "updated_at": now,
            })
    return {"ok": True}


@router.get("/performance")
async def get_my_performance(
    request: Request,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    user = await _require_coach(request)
    inst = await _get_instructor_for_user(user)
    query = {"location_id": user["location_id"], "instructor_id": inst["instructor_id"]}
    if date_from or date_to:
        dt_q = {}
        if date_from:
            dt_q["$gte"] = date_from
        if date_to:
            dt_q["$lte"] = date_to + "T23:59:59"
        query["start_date_time"] = dt_q
    sessions = await _db.class_sessions.find(query, {"_id": 0, "session_id": 1}).to_list(2000)
    session_ids = [s["session_id"] for s in sessions if s.get("session_id")]
    if not session_ids:
        return {"sessions": 0, "present": 0, "late": 0, "absent": 0}
    agg = await _db.attendance_records.aggregate([
        {"$match": {"location_id": user["location_id"], "session_id": {"$in": session_ids}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(None)
    counts = {a["_id"]: a["count"] for a in agg if a.get("_id")}
    return {
        "sessions": len(session_ids),
        "present": counts.get("present", 0),
        "late": counts.get("late", 0),
        "absent": counts.get("absent", 0),
    }

