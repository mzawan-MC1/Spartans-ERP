from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta, date
import random

import membership_status

router = APIRouter(prefix="/customer")
_db = None
_get_current_user = None


def init(database, auth_func):
    global _db, _get_current_user
    _db = database
    _get_current_user = auth_func


async def _require_customer(request: Request) -> dict:
    user = await _get_current_user(request)
    if user["role"] != "CUSTOMER":
        raise HTTPException(403, "Customer access only")
    return user


def _get_active_location(user: dict) -> str:
    return user.get("active_location_id") or user.get("location_id")


# ─── Models ───────────────────────────────────────────────────────

class ProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    date_of_birth: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    preferred_programs: Optional[List[str]] = None
    profile_image_url: Optional[str] = None

class LocationSwitch(BaseModel):
    location_id: str
    set_as_primary: bool = False

class BookingCreate(BaseModel):
    session_id: str


# ─── Locations ────────────────────────────────────────────────────

@router.get("/locations")
async def customer_locations(request: Request):
    await _require_customer(request)
    locs = await _db.locations.find({"is_deleted": False, "status": "active"}, {"_id": 0, "location_id": 1, "name": 1, "city": 1, "address": 1}).to_list(50)
    return locs


# ─── Dashboard ────────────────────────────────────────────────────

@router.get("/dashboard")
async def customer_dashboard(request: Request):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    if not lid:
        return {"needs_location": True}
    cid = user["user_id"]
    now_iso = datetime.now(timezone.utc).isoformat()
    month_start = date.today().replace(day=1).isoformat()

    import asyncio
    upcoming_bookings, attended_this_month, total_attended = await asyncio.gather(
        _db.bookings.find(
            {"customer_id": cid, "location_id": lid, "status": "BOOKED",
             "session_start": {"$gte": now_iso}},
            {"_id": 0}
        ).sort("session_start", 1).to_list(50),
        _db.attendance_records.count_documents(
            {"customer_id": cid, "location_id": lid, "status": "present",
             "attendance_date_time": {"$gte": month_start}}
        ),
        _db.attendance_records.count_documents(
            {"customer_id": cid, "location_id": lid, "status": "present"}
        ),
    )

    # Enrich next 3 upcoming with session/program details
    next_3 = []
    sample = upcoming_bookings[:3]
    if sample:
        session_ids = [b.get("session_id") for b in sample if b.get("session_id")]
        sessions = await _db.class_sessions.find({"session_id": {"$in": session_ids}}, {"_id": 0}).to_list(len(session_ids))
        sessions_by_id = {s.get("session_id"): s for s in sessions if s.get("session_id")}

        program_ids = list({(b.get("program_id") or sessions_by_id.get(b.get("session_id"), {}).get("program_id")) for b in sample if (b.get("program_id") or sessions_by_id.get(b.get("session_id"), {}).get("program_id"))})
        instructor_ids = list({sessions_by_id.get(b.get("session_id"), {}).get("instructor_id") for b in sample if sessions_by_id.get(b.get("session_id"), {}).get("instructor_id")})

        programs_task = _db.programs.find({"program_id": {"$in": program_ids}}, {"_id": 0, "program_id": 1, "name": 1}).to_list(len(program_ids)) if program_ids else asyncio.sleep(0, result=[])
        instructors_task = _db.instructors.find({"instructor_id": {"$in": instructor_ids}}, {"_id": 0, "instructor_id": 1, "full_name": 1}).to_list(len(instructor_ids)) if instructor_ids else asyncio.sleep(0, result=[])
        programs, instructors = await asyncio.gather(programs_task, instructors_task)

        programs_by_id = {p.get("program_id"): p for p in programs if p.get("program_id")}
        instructors_by_id = {i.get("instructor_id"): i for i in instructors if i.get("instructor_id")}

        for b in sample:
            session = sessions_by_id.get(b.get("session_id")) or {}
            pid = b.get("program_id") or session.get("program_id") or ""
            prog = programs_by_id.get(pid)
            inst = instructors_by_id.get(session.get("instructor_id") or "")
            next_3.append({
                **b,
                "program_name": prog.get("name") if prog else "Unknown",
                "instructor_name": inst.get("full_name") if inst else "TBD",
                "room": session.get("room", "") if session else "",
            })

    return {
        "needs_location": False,
        "upcoming_bookings_count": len(upcoming_bookings),
        "attended_this_month": attended_this_month,
        "total_attended": total_attended,
        "next_bookings": next_3
    }


# ─── Profile ──────────────────────────────────────────────────────

@router.get("/me")
async def customer_profile(request: Request):
    user = await _require_customer(request)
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return safe

@router.patch("/me")
async def update_profile(data: ProfileUpdate, request: Request):
    user = await _require_customer(request)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    updated = await _db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return updated

@router.patch("/location")
async def switch_location(data: LocationSwitch, request: Request):
    user = await _require_customer(request)
    loc = await _db.locations.find_one({"location_id": data.location_id, "is_deleted": False, "status": "active"})
    if not loc:
        raise HTTPException(404, "Location not found or inactive")
    update_fields = {"active_location_id": data.location_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    if data.set_as_primary or not user.get("location_id"):
        update_fields["location_id"] = data.location_id
    await _db.users.update_one({"user_id": user["user_id"]}, {"$set": update_fields})
    updated = await _db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return updated


# ─── Programs (Read-Only) ────────────────────────────────────────

@router.get("/program-categories")
async def customer_categories(request: Request):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    if not lid:
        raise HTTPException(400, "No active location")
    return await _db.program_categories.find({"location_id": lid, "is_active": True}, {"_id": 0}).to_list(50)

@router.get("/programs")
async def customer_programs(request: Request, category_id: Optional[str] = None):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    if not lid:
        raise HTTPException(400, "No active location")
    query = {"location_id": lid, "is_active": True}
    if category_id:
        query["category_id"] = category_id
        
    # Apply program filtering based on user's membership
    active_membership = await _db.memberships.find_one({
        "member_id": user.get("member_id", ""),
        "status": "active"
    })
    
    allowed_programs = None
            
    if allowed_programs is not None:
        query["program_id"] = {"$in": allowed_programs}
        
    programs = await _db.programs.find(query, {"_id": 0}).to_list(100)
    # Enrich with schedule info and instructor
    for p in programs:
        scheds = await _db.class_schedules.find(
            {"program_id": p["program_id"], "location_id": lid, "is_active": True}, {"_id": 0}
        ).to_list(20)
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        p["schedule_summary"] = ", ".join(
            [f"{day_names[s['day_of_week']]} {s['start_time']}-{s['end_time']}" for s in scheds[:4]]
        )
        if scheds:
            inst = await _db.instructors.find_one({"instructor_id": scheds[0].get("instructor_id", "")}, {"_id": 0, "full_name": 1})
            p["instructor_name"] = inst["full_name"] if inst else "TBD"
        else:
            p["instructor_name"] = "TBD"
        cat = await _db.program_categories.find_one({"category_id": p.get("category_id", "")}, {"_id": 0, "name": 1})
        p["category_name"] = cat["name"] if cat else ""
    return programs


# ─── Class Sessions ──────────────────────────────────────────────

@router.get("/class-sessions")
async def customer_sessions(request: Request, start_date: Optional[str] = None,
                            end_date: Optional[str] = None, program_id: Optional[str] = None):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    if not lid:
        raise HTTPException(400, "No active location")
    cid = user["user_id"]

    if not start_date:
        start_date = date.today().isoformat()
    if not end_date:
        end_date = (date.today() + timedelta(weeks=2)).isoformat()

    query = {"location_id": lid, "status": {"$ne": "cancelled"},
             "start_date_time": {"$gte": start_date, "$lte": end_date + "T23:59:59"}}
    if program_id:
        query["program_id"] = program_id
        
    # Apply program filtering based on user's membership
    active_membership = await _db.memberships.find_one({
        "member_id": user.get("member_id", ""),
        "status": "active"
    })
    
    allowed_programs = None
    
    if allowed_programs is not None:
        if program_id and program_id not in allowed_programs:
            return [] # User requested a program they don't have access to
        if not program_id:
            query["program_id"] = {"$in": allowed_programs}

    sessions = await _db.class_sessions.find(query, {"_id": 0}).sort("start_date_time", 1).to_list(200)

    # Enrich with program, instructor, booking info
    for s in sessions:
        prog = await _db.programs.find_one({"program_id": s.get("program_id", "")}, {"_id": 0, "name": 1})
        inst = await _db.instructors.find_one({"instructor_id": s.get("instructor_id", "")}, {"_id": 0, "full_name": 1})
        booked_count = await _db.bookings.count_documents({"session_id": s["session_id"], "status": "BOOKED"})
        my_booking = await _db.bookings.find_one({"session_id": s["session_id"], "customer_id": cid, "status": "BOOKED"}, {"_id": 0})
        s["program_name"] = prog["name"] if prog else "Unknown"
        s["instructor_name"] = inst["full_name"] if inst else "TBD"
        s["booked_count"] = booked_count
        s["is_booked"] = my_booking is not None
        s["my_booking_id"] = my_booking["booking_id"] if my_booking else None

    return sessions


# ─── Bookings ─────────────────────────────────────────────────────

@router.post("/bookings", status_code=201)
async def create_booking(data: BookingCreate, request: Request):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    cid = user["user_id"]

    session = await _db.class_sessions.find_one({"session_id": data.session_id, "location_id": lid}, {"_id": 0})
    if not session:
        raise HTTPException(404, "Session not found at your location")
    if session.get("status") == "cancelled":
        raise HTTPException(400, "Session is cancelled")
    if session["start_date_time"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(400, "Cannot book a past session")

    member_id = user.get("member_id", "")
    if not member_id:
        raise HTTPException(403, "Active membership required to book sessions")

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    memberships = await _db.memberships.find(
        {"member_id": member_id, "location_id": lid, "status": {"$ne": "cancelled"}},
        {"_id": 0},
    ).sort("end_date", -1).limit(10).to_list(10)

    if not memberships:
        raise HTTPException(403, "Active membership required to book sessions")

    membership_ids = [m.get("membership_id") for m in memberships if m.get("membership_id")]
    payments_by_membership = {}
    if membership_ids:
        payment_agg = await _db.payments.aggregate([
            {"$match": {"location_id": lid, "membership_id": {"$in": membership_ids}}},
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": "$membership_id",
                "latest_status": {"$first": "$status"},
                "has_success": {"$max": {"$cond": [{"$in": ["$status", list(membership_status.SUCCESS_PAYMENT_STATUSES)]}, 1, 0]}},
            }},
        ]).to_list(None)
        payments_by_membership = {p["_id"]: p for p in payment_agg if p.get("_id")}

    active_membership = None
    for m in memberships:
        pay_info = payments_by_membership.get(m.get("membership_id")) or {}
        effective_status = membership_status.compute_effective_membership_status(
            m,
            now=now_dt,
            has_success_payment=bool(pay_info.get("has_success")),
            latest_payment_status=pay_info.get("latest_status"),
        )
        if effective_status and effective_status != (m.get("status") or ""):
            await _db.memberships.update_one(
                {"membership_id": m.get("membership_id"), "location_id": lid},
                {"$set": {"status": effective_status, "updated_at": now_iso}},
            )
            m["status"] = effective_status
        if effective_status == "active":
            active_membership = m
            break

    if not active_membership:
        raise HTTPException(403, "Active membership required to book sessions")
    
    existing = await _db.bookings.find_one({"session_id": data.session_id, "customer_id": cid, "status": "BOOKED"})
    if existing:
        raise HTTPException(400, "Already booked for this session")

    booking_id = f"bk_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "booking_id": booking_id, "location_id": lid, "customer_id": cid,
        "session_id": data.session_id, "program_id": session.get("program_id", ""),
        "session_start": session["start_date_time"], "session_end": session["end_date_time"],
        "status": "BOOKED", "created_at": now, "cancelled_at": None, "notes": ""
    }
    await _db.bookings.insert_one(doc)
    doc.pop("_id", None)

    prog = await _db.programs.find_one({"program_id": session.get("program_id", "")}, {"_id": 0, "name": 1})
    doc["program_name"] = prog["name"] if prog else "Unknown"
    return doc

@router.get("/bookings")
async def list_bookings(request: Request, status: Optional[str] = None,
                        from_date: Optional[str] = None, to_date: Optional[str] = None):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    cid = user["user_id"]
    query = {"customer_id": cid, "location_id": lid}
    if status:
        query["status"] = status
    if from_date:
        query["session_start"] = {"$gte": from_date}
    if to_date:
        query.setdefault("session_start", {})
        if isinstance(query["session_start"], dict):
            query["session_start"]["$lte"] = to_date + "T23:59:59"
    bookings = await _db.bookings.find(query, {"_id": 0}).sort("session_start", 1).to_list(200)
    for b in bookings:
        prog = await _db.programs.find_one({"program_id": b.get("program_id", "")}, {"_id": 0, "name": 1})
        session = await _db.class_sessions.find_one({"session_id": b.get("session_id", "")}, {"_id": 0})
        inst = await _db.instructors.find_one({"instructor_id": session.get("instructor_id", "")}, {"_id": 0, "full_name": 1}) if session else None
        b["program_name"] = prog["name"] if prog else "Unknown"
        b["instructor_name"] = inst["full_name"] if inst else "TBD"
        b["room"] = session.get("room", "") if session else ""
    return bookings

@router.get("/bookings/upcoming")
async def upcoming_bookings(request: Request):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    cid = user["user_id"]
    now_iso = datetime.now(timezone.utc).isoformat()
    bookings = await _db.bookings.find(
        {"customer_id": cid, "location_id": lid, "status": "BOOKED", "session_start": {"$gte": now_iso}},
        {"_id": 0}
    ).sort("session_start", 1).to_list(50)
    for b in bookings:
        prog = await _db.programs.find_one({"program_id": b.get("program_id", "")}, {"_id": 0, "name": 1})
        session = await _db.class_sessions.find_one({"session_id": b.get("session_id", "")}, {"_id": 0})
        inst = await _db.instructors.find_one({"instructor_id": session.get("instructor_id", "")}, {"_id": 0, "full_name": 1}) if session else None
        b["program_name"] = prog["name"] if prog else "Unknown"
        b["instructor_name"] = inst["full_name"] if inst else "TBD"
        b["room"] = session.get("room", "") if session else ""
    return bookings

@router.patch("/bookings/{booking_id}/cancel")
async def cancel_booking(booking_id: str, request: Request):
    user = await _require_customer(request)
    cid = user["user_id"]
    booking = await _db.bookings.find_one({"booking_id": booking_id, "customer_id": cid}, {"_id": 0})
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking["status"] != "BOOKED":
        raise HTTPException(400, f"Cannot cancel a {booking['status']} booking")
    if booking["session_start"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(400, "Cannot cancel a past session")
    now = datetime.now(timezone.utc).isoformat()
    await _db.bookings.update_one({"booking_id": booking_id}, {"$set": {"status": "CANCELLED", "cancelled_at": now, "updated_at": now}})
    return {"message": "Booking cancelled", "booking_id": booking_id}


# ─── Attendance ───────────────────────────────────────────────────

@router.get("/attendance")
async def customer_attendance(request: Request, from_date: Optional[str] = None, to_date: Optional[str] = None):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    cid = user["user_id"]
    query = {"customer_id": cid, "location_id": lid}
    if not from_date:
        from_date = (date.today() - timedelta(days=90)).isoformat()
    query["attendance_date_time"] = {"$gte": from_date}
    if to_date:
        query["attendance_date_time"]["$lte"] = to_date + "T23:59:59"
    records = await _db.attendance_records.find(query, {"_id": 0}).sort("attendance_date_time", -1).to_list(200)
    program_ids = list({r.get("program_id") for r in records if r.get("program_id")})
    programs_by_id = {}
    if program_ids:
        programs = await _db.programs.find(
            {"program_id": {"$in": program_ids}},
            {"_id": 0, "program_id": 1, "name": 1},
        ).to_list(len(program_ids))
        programs_by_id = {p.get("program_id"): p for p in programs if p.get("program_id")}

    for r in records:
        prog = programs_by_id.get(r.get("program_id"))
        r["program_name"] = prog.get("name") if prog else "Unknown"
    return records

@router.get("/attendance/summary")
async def customer_attendance_summary(request: Request):
    user = await _require_customer(request)
    lid = _get_active_location(user)
    cid = user["user_id"]
    import asyncio
    month_start = date.today().replace(day=1).isoformat()
    total, this_month, programs = await asyncio.gather(
        _db.attendance_records.count_documents({"customer_id": cid, "location_id": lid, "status": "present"}),
        _db.attendance_records.count_documents(
            {"customer_id": cid, "location_id": lid, "status": "present", "attendance_date_time": {"$gte": month_start}}
        ),
        _db.programs.find({"location_id": lid, "is_active": True}, {"_id": 0, "program_id": 1, "name": 1}).to_list(50),
    )

    program_ids = [p.get("program_id") for p in programs if p.get("program_id")]
    counts_by_program = {}
    if program_ids:
        agg = await _db.attendance_records.aggregate([
            {"$match": {"customer_id": cid, "location_id": lid, "status": "present", "program_id": {"$in": program_ids}}},
            {"$group": {"_id": "$program_id", "count": {"$sum": 1}}},
        ]).to_list(len(program_ids))
        counts_by_program = {a.get("_id"): int(a.get("count", 0)) for a in agg if a.get("_id")}

    per_program = []
    for p in programs:
        pid = p.get("program_id")
        count = int(counts_by_program.get(pid, 0))
        if count > 0:
            per_program.append({"program_id": pid, "name": p.get("name", ""), "count": count})

    return {"total_attended": total, "this_month": this_month, "per_program": per_program}


# ─── Seed Bookings ────────────────────────────────────────────────

@router.post("/seed-bookings")
async def seed_bookings():
    existing = await _db.bookings.find_one({})
    if existing:
        return {"message": "Bookings already seeded"}
    now = datetime.now(timezone.utc).isoformat()
    today_iso = date.today().isoformat()
    total_bookings = 0
    total_attendance = 0

    customers = await _db.users.find({"role": "CUSTOMER", "is_active": True}, {"_id": 0}).to_list(100)
    for cust in customers:
        lid = cust.get("location_id")
        if not lid:
            continue
        cid = cust["user_id"]

        # Get upcoming sessions for this location
        upcoming = await _db.class_sessions.find(
            {"location_id": lid, "status": "planned", "start_date_time": {"$gte": today_iso}},
            {"_id": 0}
        ).sort("start_date_time", 1).to_list(30)

        # Book 3-5 random upcoming sessions
        to_book = random.sample(upcoming, min(random.randint(3, 5), len(upcoming)))
        for session in to_book:
            booking_id = f"bk_{uuid.uuid4().hex[:12]}"
            doc = {
                "booking_id": booking_id, "location_id": lid, "customer_id": cid,
                "session_id": session["session_id"], "program_id": session.get("program_id", ""),
                "session_start": session["start_date_time"], "session_end": session["end_date_time"],
                "status": "BOOKED", "created_at": now, "cancelled_at": None, "notes": ""
            }
            await _db.bookings.insert_one(doc)
            total_bookings += 1

        # Create attendance for past sessions
        past = await _db.class_sessions.find(
            {"location_id": lid, "status": "completed"},
            {"_id": 0}
        ).to_list(10)
        for session in past[:4]:
            existing_att = await _db.attendance_records.find_one(
                {"customer_id": cid, "session_id": session["session_id"]}
            )
            if existing_att:
                continue
            status = random.choice(["present", "present", "present", "present", "absent", "late"])
            record_id = f"att_{uuid.uuid4().hex[:12]}"
            doc = {
                "record_id": record_id, "location_id": lid, "customer_id": cid,
                "program_id": session.get("program_id", ""), "session_id": session["session_id"],
                "attendance_date_time": session["start_date_time"], "status": status,
                "check_in_method": "managerManual", "created_at": now, "updated_at": now
            }
            await _db.attendance_records.insert_one(doc)
            total_attendance += 1

    return {"message": "Bookings seeded", "bookings_created": total_bookings, "attendance_created": total_attendance}
