from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta, date
import random

router = APIRouter()
_db = None
_get_current_user = None


def init(database, auth_func):
    global _db, _get_current_user
    _db = database
    _get_current_user = auth_func


# ─── Permission Helper ────────────────────────────────────────────

async def get_user_permissions(user: dict) -> set:
    """Get effective permissions for a user based on their admin roles"""
    if user.get("role") == "CUSTOMER":
        return set()
    admin_role_ids = user.get("admin_role_ids", [])
    if not admin_role_ids:
        return set()
    roles = await _db.roles.find(
        {"role_id": {"$in": admin_role_ids}, "is_active": True},
        {"_id": 0, "permissions": 1}
    ).to_list(100)
    permissions = set()
    for role in roles:
        permissions.update(role.get("permissions", []))
    return permissions


async def check_permission(user: dict, permission: str) -> bool:
    """Check if user has specific permission"""
    # Owner with manage_all permission bypasses checks
    if user.get("role") == "OWNER":
        return True
    permissions = await get_user_permissions(user)
    return permission in permissions


# ─── Location Context Helper ──────────────────────────────────────

async def get_location_context(user: dict, request: Request) -> str:
    if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
        location_id = request.query_params.get("location_id")
        if not location_id:
            # For GET requests that support all locations, we might want to return None or a list,
            # but currently it's strictly single-location.
            raise HTTPException(400, "location_id query param required for owner")
        owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
        if not owner_id:
            raise HTTPException(403, "Access denied to this location")
        loc = await _db.locations.find_one(
            {"location_id": location_id, "owner_id": owner_id, "is_deleted": False}
        )
        if not loc:
            raise HTTPException(403, "Access denied to this location")
        return location_id
    elif user.get("location_id"):
        return user["location_id"]
    raise HTTPException(403, "Insufficient permissions")


async def require_manager_or_owner(request: Request, permission: str = None):
    """Require either Manager or Owner role with optional permission check"""
    user = await _get_current_user(request)
    if user.get("role") == "CUSTOMER" or user.get("role") == "MEMBER":
        raise HTTPException(403, "Manager or Owner access required")
    if permission and not await check_permission(user, permission):
        raise HTTPException(403, f"Missing permission: {permission}")
    return user


# ─── Section 2 Pydantic Models ────────────────────────────────────

class ProgramCategoryCreate(BaseModel):
    name: str
    description: str = ""
    age_group: str = ""
    skill_level: str = "all"

class ProgramCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    age_group: Optional[str] = None
    skill_level: Optional[str] = None
    is_active: Optional[bool] = None
    supervisor_staff_id: Optional[str] = None

class ProgramCreate(BaseModel):
    category_id: str
    name: str
    description: str = ""
    capacity: int = 20
    difficulty_level: str = "beginner"

class ProgramUpdate(BaseModel):
    category_id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    capacity: Optional[int] = None
    difficulty_level: Optional[str] = None
    is_active: Optional[bool] = None
    capacity: Optional[int] = None
    difficulty_level: Optional[str] = None
    is_active: Optional[bool] = None

class InstructorCreate(BaseModel):
    full_name: str
    phone: str = ""
    email: str = ""
    bio: str = ""
    specialties: str = ""
    staff_id: Optional[str] = None  # Link to staff record

class InstructorUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    bio: Optional[str] = None
    specialties: Optional[str] = None
    is_active: Optional[bool] = None
    staff_id: Optional[str] = None  # Link to staff record

class ScheduleCreate(BaseModel):
    program_id: str
    instructor_id: Optional[str] = None  # Deprecated - use instructor_ids
    instructor_ids: Optional[List[str]] = None  # Support multiple instructors
    day_of_week: int
    start_time: str
    end_time: str
    room: str = ""
    capacity_override: Optional[int] = None

class ScheduleUpdate(BaseModel):
    program_id: Optional[str] = None
    instructor_id: Optional[str] = None  # Deprecated - use instructor_ids
    instructor_ids: Optional[List[str]] = None  # Support multiple instructors
    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    room: Optional[str] = None
    capacity_override: Optional[int] = None
    is_active: Optional[bool] = None

class SessionCreate(BaseModel):
    program_id: str
    instructor_id: str
    schedule_id: Optional[str] = None
    start_date_time: str
    end_date_time: str
    room: str = ""
    capacity: int = 20
    status: str = "planned"

class SessionUpdate(BaseModel):
    program_id: Optional[str] = None
    instructor_id: Optional[str] = None
    start_date_time: Optional[str] = None
    end_date_time: Optional[str] = None
    room: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[str] = None

class AttendanceEntry(BaseModel):
    customer_id: str
    status: str

class AttendanceBulkCreate(BaseModel):
    session_id: str
    records: List[AttendanceEntry]


# ─── Program Categories CRUD ─────────────────────────────────────

@router.post("/program-categories", status_code=201)
async def create_category(data: ProgramCategoryCreate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    cat_id = f"cat_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "category_id": cat_id, "location_id": lid, "name": data.name,
        "description": data.description, "age_group": data.age_group,
        "skill_level": data.skill_level, "is_active": True, "deleted_at": None,
        "created_at": now, "updated_at": now
    }
    await _db.program_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/program-categories")
async def list_categories(request: Request, is_active: Optional[bool] = None, include_deleted: bool = False):
    """
    List categories for admin view.
    - By default returns non-deleted items (both active and inactive)
    - Use is_active=true/false to filter by status
    - Use include_deleted=true to see deleted items
    """
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    query = {"location_id": lid}
    
    # By default, exclude deleted items
    if not include_deleted:
        query["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    
    if is_active is not None:
        query["is_active"] = is_active
    
    return await _db.program_categories.find(query, {"_id": 0}).to_list(200)

@router.patch("/program-categories/{category_id}")
async def update_category(category_id: str, data: ProgramCategoryUpdate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    existing = await _db.program_categories.find_one({
        "category_id": category_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Category not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    if "supervisor_staff_id" in updates:
        sup_id = updates.get("supervisor_staff_id")
        if sup_id:
            staff = await _db.staff.find_one(
                {"staff_id": sup_id, "location_id": lid, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
                {"_id": 0, "staff_id": 1, "role": 1},
            )
            if not staff:
                raise HTTPException(400, "Invalid supervisor for this location")
            if "INSTRUCTOR" not in (staff.get("role") or "").upper():
                raise HTTPException(400, "Supervisor must be an instructor/coach")
    
    # Cascading: If category is deactivated, mark programs as having inactive parent
    # NOTE: We do NOT cascade deactivation anymore - just flag the relationship
    
    await _db.program_categories.update_one({"category_id": category_id}, {"$set": updates})
    return await _db.program_categories.find_one({"category_id": category_id}, {"_id": 0})

@router.delete("/program-categories/{category_id}")
async def delete_category(category_id: str, request: Request):
    """Soft delete - sets deleted_at timestamp. Record can be restored."""
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    existing = await _db.program_categories.find_one({
        "category_id": category_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Category not found")
    now = datetime.now(timezone.utc).isoformat()
    # Soft delete - set deleted_at timestamp
    await _db.program_categories.update_one(
        {"category_id": category_id}, 
        {"$set": {"deleted_at": now, "updated_at": now}}
    )
    return {"message": "Category deleted"}

@router.post("/program-categories/{category_id}/restore")
async def restore_category(category_id: str, request: Request):
    """Restore a soft-deleted category"""
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    existing = await _db.program_categories.find_one({
        "category_id": category_id, "location_id": lid, "deleted_at": {"$ne": None}
    })
    if not existing:
        raise HTTPException(404, "Deleted category not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.program_categories.update_one(
        {"category_id": category_id}, 
        {"$set": {"deleted_at": None, "updated_at": now}}
    )
    return await _db.program_categories.find_one({"category_id": category_id}, {"_id": 0})


# ─── Programs CRUD ────────────────────────────────────────────────

@router.post("/programs", status_code=201)
async def create_program(data: ProgramCreate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    cat = await _db.program_categories.find_one({
        "category_id": data.category_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not cat:
        raise HTTPException(400, "Invalid category for this location")
    if not cat.get("is_active", True):
        raise HTTPException(400, "Cannot add program to inactive category")
    prog_id = f"prog_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "program_id": prog_id, "location_id": lid, "category_id": data.category_id,
        "name": data.name, "description": data.description, "capacity": data.capacity,
        "difficulty_level": data.difficulty_level, "is_active": True, "deleted_at": None,
        "created_at": now, "updated_at": now
    }
    await _db.programs.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/programs")
async def list_programs(request: Request, category_id: Optional[str] = None, 
                        is_active: Optional[bool] = None, include_deleted: bool = False):
    """
    List programs for admin view.
    - By default returns non-deleted items (both active and inactive)
    - Use is_active=true/false to filter by status
    - Use include_deleted=true to see deleted items
    """
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    query = {"location_id": lid}
    
    if not include_deleted:
        query["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    
    if category_id:
        query["category_id"] = category_id
    if is_active is not None:
        query["is_active"] = is_active
    
    return await _db.programs.find(query, {"_id": 0}).to_list(200)

@router.get("/programs/{program_id}")
async def get_program(program_id: str, request: Request):
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    doc = await _db.programs.find_one({
        "program_id": program_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    }, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Program not found")
    return doc

@router.patch("/programs/{program_id}")
async def update_program(program_id: str, data: ProgramUpdate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    existing = await _db.programs.find_one({
        "program_id": program_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Program not found")
    if data.category_id:
        cat = await _db.program_categories.find_one({
            "category_id": data.category_id, "location_id": lid,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        if not cat:
            raise HTTPException(400, "Invalid category")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.programs.update_one({"program_id": program_id}, {"$set": updates})
    return await _db.programs.find_one({"program_id": program_id}, {"_id": 0})

@router.delete("/programs/{program_id}")
async def delete_program(program_id: str, request: Request):
    """Soft delete - sets deleted_at timestamp. Record can be restored."""
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    existing = await _db.programs.find_one({
        "program_id": program_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Program not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.programs.update_one(
        {"program_id": program_id}, 
        {"$set": {"deleted_at": now, "updated_at": now}}
    )
    return {"message": "Program deleted"}

@router.post("/programs/{program_id}/restore")
async def restore_program(program_id: str, request: Request):
    """Restore a soft-deleted program"""
    user = await require_manager_or_owner(request, "manager.manage_programs")
    lid = await get_location_context(user, request)
    existing = await _db.programs.find_one({
        "program_id": program_id, "location_id": lid, "deleted_at": {"$ne": None}
    })
    if not existing:
        raise HTTPException(404, "Deleted program not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.programs.update_one(
        {"program_id": program_id}, 
        {"$set": {"deleted_at": None, "updated_at": now}}
    )
    return await _db.programs.find_one({"program_id": program_id}, {"_id": 0})


# ─── Instructors CRUD ─────────────────────────────────────────────

@router.post("/instructors", status_code=201)
async def create_instructor(data: InstructorCreate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_instructors")
    lid = await get_location_context(user, request)
    inst_id = f"inst_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "instructor_id": inst_id, "location_id": lid, "full_name": data.full_name,
        "phone": data.phone, "email": data.email, "bio": data.bio,
        "specialties": data.specialties, "staff_id": data.staff_id,
        "is_active": True, "deleted_at": None,
        "created_at": now, "updated_at": now
    }
    await _db.instructors.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/instructors")
async def list_instructors(request: Request, is_active: Optional[bool] = None, include_deleted: bool = False):
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    
    match_stage = {"location_id": lid}
    if not include_deleted:
        match_stage["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    if is_active is not None:
        match_stage["is_active"] = is_active

    pipeline = [
        {"$match": match_stage},
        {"$lookup": {
            "from": "staff",
            "localField": "staff_id",
            "foreignField": "staff_id",
            "as": "staff_info"
        }},
        {"$unwind": {
            "path": "$staff_info",
            "preserveNullAndEmptyArrays": True
        }},
        {"$addFields": {
            "profile_image_path": "$staff_info.profile_image_path"
        }},
        {"$project": {
            "staff_info": 0,
            "_id": 0
        }}
    ]
    
    return await _db.instructors.aggregate(pipeline).to_list(200)

@router.patch("/instructors/{instructor_id}")
async def update_instructor(instructor_id: str, data: InstructorUpdate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_instructors")
    lid = await get_location_context(user, request)
    existing = await _db.instructors.find_one({
        "instructor_id": instructor_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Instructor not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.instructors.update_one({"instructor_id": instructor_id}, {"$set": updates})
    return await _db.instructors.find_one({"instructor_id": instructor_id}, {"_id": 0})

@router.delete("/instructors/{instructor_id}")
async def delete_instructor(instructor_id: str, request: Request):
    """Soft delete instructor"""
    user = await require_manager_or_owner(request, "manager.manage_instructors")
    lid = await get_location_context(user, request)
    existing = await _db.instructors.find_one({
        "instructor_id": instructor_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Instructor not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.instructors.update_one(
        {"instructor_id": instructor_id}, 
        {"$set": {"deleted_at": now, "updated_at": now}}
    )
    return {"message": "Instructor deleted"}

@router.post("/instructors/{instructor_id}/restore")
async def restore_instructor(instructor_id: str, request: Request):
    """Restore a soft-deleted instructor"""
    user = await require_manager_or_owner(request, "manager.manage_instructors")
    lid = await get_location_context(user, request)
    existing = await _db.instructors.find_one({
        "instructor_id": instructor_id, "location_id": lid, "deleted_at": {"$ne": None}
    })
    if not existing:
        raise HTTPException(404, "Deleted instructor not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.instructors.update_one(
        {"instructor_id": instructor_id}, 
        {"$set": {"deleted_at": None, "updated_at": now}}
    )
    return await _db.instructors.find_one({"instructor_id": instructor_id}, {"_id": 0})


@router.post("/sync-instructors-from-staff")
async def sync_instructors_from_staff(request: Request, clean_orphans: bool = False):
    """
    Sync instructors from staff records.
    Creates/updates instructor records for all staff with role=INSTRUCTOR.
    Links them via staff_id field.
    
    If clean_orphans=true, removes instructors that have no linked staff_id.
    """
    user = await _get_current_user(request)
    if user["role"] != "OWNER":
        raise HTTPException(403, "Only owners can sync instructors")
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Get all staff with role=INSTRUCTOR (non-deleted)
    instructor_staff = await _db.staff.find({
        "role": "INSTRUCTOR",
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    }, {"_id": 0}).to_list(500)
    
    created = 0
    updated = 0
    skipped = 0
    orphans_removed = 0
    
    # Build a set of staff_ids for quick lookup
    staff_ids = {s["staff_id"] for s in instructor_staff}
    
    for staff in instructor_staff:
        staff_id = staff["staff_id"]
        location_id = staff["location_id"]
        full_name = f"{staff['first_name']} {staff['last_name']}".strip()
        
        # Check if instructor already linked to this staff (including deleted)
        existing = await _db.instructors.find_one({
            "staff_id": staff_id, "location_id": location_id
        })
        
        if existing:
            # Update existing instructor
            await _db.instructors.update_one(
                {"instructor_id": existing["instructor_id"]},
                {"$set": {
                    "full_name": full_name,
                    "phone": staff.get("phone", ""),
                    "email": staff.get("email", ""),
                    "is_active": staff.get("is_active", True),
                    "deleted_at": None,  # Clear deleted_at if staff is active
                    "updated_at": now
                }}
            )
            updated += 1
        else:
            # Check if instructor exists by name (for migration)
            existing_by_name = await _db.instructors.find_one({
                "location_id": location_id,
                "$or": [
                    {"full_name": {"$regex": f"^Coach {staff['first_name']}$", "$options": "i"}},
                    {"full_name": {"$regex": f"^{staff['first_name']}\\s", "$options": "i"}},
                    {"full_name": full_name}
                ]
            })
            
            if existing_by_name:
                # Link existing instructor to staff
                await _db.instructors.update_one(
                    {"instructor_id": existing_by_name["instructor_id"]},
                    {"$set": {
                        "staff_id": staff_id,
                        "full_name": full_name,
                        "phone": staff.get("phone", ""),
                        "email": staff.get("email", ""),
                        "is_active": staff.get("is_active", True),
                        "deleted_at": None,  # Clear deleted_at if staff is active
                        "updated_at": now
                    }}
                )
                updated += 1
            else:
                # Create new instructor
                inst_id = f"inst_{uuid.uuid4().hex[:12]}"
                doc = {
                    "instructor_id": inst_id,
                    "staff_id": staff_id,
                    "location_id": location_id,
                    "full_name": full_name,
                    "phone": staff.get("phone", ""),
                    "email": staff.get("email", ""),
                    "bio": "",
                    "specialties": "",
                    "is_active": staff.get("is_active", True),
                    "deleted_at": None,
                    "created_at": now,
                    "updated_at": now
                }
                await _db.instructors.insert_one(doc)
                created += 1
    
    # Also sync deleted status - deactivate instructors whose staff are deleted
    deleted_staff = await _db.staff.find({
        "role": "INSTRUCTOR",
        "deleted_at": {"$ne": None}
    }, {"_id": 0, "staff_id": 1}).to_list(500)
    
    for staff in deleted_staff:
        await _db.instructors.update_many(
            {"staff_id": staff["staff_id"]},
            {"$set": {"is_active": False, "updated_at": now}}
        )
    
    # Clean up orphan instructors (those without staff_id)
    if clean_orphans:
        result = await _db.instructors.delete_many({
            "$or": [
                {"staff_id": None},
                {"staff_id": {"$exists": False}}
            ]
        })
        orphans_removed = result.deleted_count
    
    return {
        "message": "Sync complete",
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "orphans_removed": orphans_removed,
        "total_staff_instructors": len(instructor_staff)
    }


# ─── Class Schedules CRUD ─────────────────────────────────────────

@router.post("/class-schedules", status_code=201)
async def create_schedule(data: ScheduleCreate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    prog = await _db.programs.find_one({
        "program_id": data.program_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not prog:
        raise HTTPException(400, "Invalid program for this location")
    if not prog.get("is_active", True):
        raise HTTPException(400, "Cannot create schedule for inactive program")
    
    # Support both single instructor_id and multiple instructor_ids
    instructor_ids = data.instructor_ids or ([data.instructor_id] if data.instructor_id else [])
    if not instructor_ids:
        raise HTTPException(400, "At least one instructor is required")
    
    # Validate all instructors
    for inst_id in instructor_ids:
        inst = await _db.instructors.find_one({
            "instructor_id": inst_id, "location_id": lid,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        if not inst:
            raise HTTPException(400, f"Invalid instructor {inst_id} for this location")
    
    sched_id = f"sched_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "schedule_id": sched_id, "location_id": lid, "program_id": data.program_id,
        "instructor_ids": instructor_ids,
        "instructor_id": instructor_ids[0] if instructor_ids else None,  # Backward compatibility
        "day_of_week": data.day_of_week,
        "start_time": data.start_time, "end_time": data.end_time,
        "room": data.room, "capacity_override": data.capacity_override,
        "is_active": True, "deleted_at": None, "created_at": now, "updated_at": now
    }
    await _db.class_schedules.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/class-schedules")
async def list_schedules(request: Request, program_id: Optional[str] = None,
                         instructor_id: Optional[str] = None, day_of_week: Optional[int] = None,
                         is_active: Optional[bool] = None, include_deleted: bool = False):
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    query = {"location_id": lid}
    if not include_deleted:
        query["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    if program_id:
        query["program_id"] = program_id
    if instructor_id:
        # Support both old instructor_id field and new instructor_ids array
        query["$or"] = [
            {"instructor_id": instructor_id},
            {"instructor_ids": instructor_id}
        ]
        # Preserve the deleted_at filter if it was set
        if not include_deleted:
            query = {
                "$and": [
                    {"location_id": lid},
                    {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
                    {"$or": [{"instructor_id": instructor_id}, {"instructor_ids": instructor_id}]}
                ]
            }
            if program_id:
                query["$and"].append({"program_id": program_id})
    if day_of_week is not None:
        query["day_of_week"] = day_of_week
    if is_active is not None:
        query["is_active"] = is_active
    return await _db.class_schedules.find(query, {"_id": 0}).to_list(200)

@router.patch("/class-schedules/{schedule_id}")
async def update_schedule(schedule_id: str, data: ScheduleUpdate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    existing = await _db.class_schedules.find_one({
        "schedule_id": schedule_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Schedule not found")
    
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Handle instructor_ids update
    if "instructor_ids" in updates and updates["instructor_ids"]:
        # Validate all instructors
        for inst_id in updates["instructor_ids"]:
            inst = await _db.instructors.find_one({
                "instructor_id": inst_id, "location_id": lid,
                "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
            })
            if not inst:
                raise HTTPException(400, f"Invalid instructor {inst_id} for this location")
        # Keep backward compatibility
        updates["instructor_id"] = updates["instructor_ids"][0]
    elif "instructor_id" in updates and updates["instructor_id"]:
        # Single instructor update - also update instructor_ids
        updates["instructor_ids"] = [updates["instructor_id"]]
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.class_schedules.update_one({"schedule_id": schedule_id}, {"$set": updates})
    return await _db.class_schedules.find_one({"schedule_id": schedule_id}, {"_id": 0})

@router.delete("/class-schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, request: Request):
    """Soft delete schedule"""
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    existing = await _db.class_schedules.find_one({
        "schedule_id": schedule_id, "location_id": lid,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Schedule not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.class_schedules.update_one(
        {"schedule_id": schedule_id}, 
        {"$set": {"deleted_at": now, "updated_at": now}}
    )
    return {"message": "Schedule deleted"}

@router.post("/class-schedules/{schedule_id}/restore")
async def restore_schedule(schedule_id: str, request: Request):
    """Restore a soft-deleted schedule"""
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    existing = await _db.class_schedules.find_one({
        "schedule_id": schedule_id, "location_id": lid, "deleted_at": {"$ne": None}
    })
    if not existing:
        raise HTTPException(404, "Deleted schedule not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.class_schedules.update_one(
        {"schedule_id": schedule_id}, 
        {"$set": {"deleted_at": None, "updated_at": now}}
    )
    return await _db.class_schedules.find_one({"schedule_id": schedule_id}, {"_id": 0})

@router.post("/class-schedules/{schedule_id}/generate-sessions")
async def generate_sessions(schedule_id: str, request: Request, weeks: int = 8):
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    sched = await _db.class_schedules.find_one({"schedule_id": schedule_id, "location_id": lid}, {"_id": 0})
    if not sched:
        raise HTTPException(404, "Schedule not found")
    if not sched.get("is_active", True):
        raise HTTPException(400, "Cannot generate sessions for inactive schedule")
    count = await _generate_sessions_from_schedule(sched, weeks)
    return {"message": f"Generated {count} sessions", "sessions_created": count}


async def _generate_sessions_from_schedule(sched, weeks=8):
    today = date.today()
    target_day = sched["day_of_week"]
    current_weekday = today.weekday()
    days_ahead = target_day - current_weekday
    if days_ahead < 0:
        days_ahead += 7
    next_date = today + timedelta(days=days_ahead)
    created = 0
    now = datetime.now(timezone.utc).isoformat()
    for week in range(weeks):
        session_date = next_date + timedelta(weeks=week)
        start_dt = f"{session_date.isoformat()}T{sched['start_time']}:00"
        end_dt = f"{session_date.isoformat()}T{sched['end_time']}:00"
        existing = await _db.class_sessions.find_one({"schedule_id": sched["schedule_id"], "start_date_time": start_dt})
        if existing:
            continue
        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        doc = {
            "session_id": session_id, "location_id": sched["location_id"],
            "program_id": sched["program_id"], "instructor_id": sched["instructor_id"],
            "schedule_id": sched["schedule_id"], "start_date_time": start_dt,
            "end_date_time": end_dt, "room": sched.get("room", ""),
            "capacity": sched.get("capacity_override") or 20,
            "status": "planned" if session_date >= today else "completed",
            "created_at": now, "updated_at": now
        }
        await _db.class_sessions.insert_one(doc)
        created += 1
    return created


# ─── Class Sessions CRUD ──────────────────────────────────────────

@router.post("/class-sessions", status_code=201)
async def create_session(data: SessionCreate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    session_id = f"sess_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "session_id": session_id, "location_id": lid,
        "program_id": data.program_id, "instructor_id": data.instructor_id,
        "schedule_id": data.schedule_id, "start_date_time": data.start_date_time,
        "end_date_time": data.end_date_time, "room": data.room,
        "capacity": data.capacity, "status": data.status,
        "created_at": now, "updated_at": now
    }
    await _db.class_sessions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/class-sessions")
async def list_sessions(request: Request, program_id: Optional[str] = None,
                        instructor_id: Optional[str] = None,
                        date_from: Optional[str] = None, date_to: Optional[str] = None,
                        status: Optional[str] = None):
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    query = {"location_id": lid}
    if program_id:
        query["program_id"] = program_id
    if instructor_id:
        query["instructor_id"] = instructor_id
    if status:
        query["status"] = status
    if date_from:
        query["start_date_time"] = {"$gte": date_from}
    if date_to:
        query.setdefault("start_date_time", {})
        if isinstance(query["start_date_time"], dict):
            query["start_date_time"]["$lte"] = date_to + "T23:59:59"
        else:
            query["start_date_time"] = {"$gte": query["start_date_time"], "$lte": date_to + "T23:59:59"}
    sessions = await _db.class_sessions.find(query, {"_id": 0}).sort("start_date_time", 1).to_list(500)
    return sessions

@router.patch("/class-sessions/{session_id}")
async def update_session(session_id: str, data: SessionUpdate, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    existing = await _db.class_sessions.find_one({"session_id": session_id, "location_id": lid})
    if not existing:
        raise HTTPException(404, "Session not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.class_sessions.update_one({"session_id": session_id}, {"$set": updates})
    return await _db.class_sessions.find_one({"session_id": session_id}, {"_id": 0})

@router.delete("/class-sessions/{session_id}")
async def delete_session(session_id: str, request: Request):
    user = await require_manager_or_owner(request, "manager.manage_schedules")
    lid = await get_location_context(user, request)
    existing = await _db.class_sessions.find_one({"session_id": session_id, "location_id": lid})
    if not existing:
        raise HTTPException(404, "Session not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.class_sessions.update_one({"session_id": session_id}, {"$set": {"status": "cancelled", "updated_at": now}})
    return {"message": "Session cancelled"}


# ─── Attendance ───────────────────────────────────────────────────

@router.post("/attendance", status_code=201)
async def save_attendance(data: AttendanceBulkCreate, request: Request):
    user = await require_manager_or_owner(request, "manager.record_attendance")
    lid = await get_location_context(user, request)
    session = await _db.class_sessions.find_one({"session_id": data.session_id, "location_id": lid})
    if not session:
        raise HTTPException(400, "Invalid session for this location")
        
    now = datetime.now(timezone.utc).isoformat()
    created = 0
    
    # We should optionally check if the customer has access to the program, 
    # but since this is manager manual entry, we assume the manager has verified or is overriding.
    
    for entry in data.records:
        existing = await _db.attendance_records.find_one({
            "session_id": data.session_id, "customer_id": entry.customer_id
        })
        if existing:
            await _db.attendance_records.update_one(
                {"record_id": existing["record_id"]},
                {"$set": {"status": entry.status, "updated_at": now}}
            )
        else:
            record_id = f"att_{uuid.uuid4().hex[:12]}"
            doc = {
                "record_id": record_id, "location_id": lid,
                "customer_id": entry.customer_id, "program_id": session["program_id"],
                "session_id": data.session_id,
                "attendance_date_time": session["start_date_time"],
                "status": entry.status, "check_in_method": "managerManual",
                "created_at": now, "updated_at": now
            }
            await _db.attendance_records.insert_one(doc)
            created += 1
    return {"message": "Attendance saved", "records_created": created, "records_updated": len(data.records) - created}

@router.get("/attendance")
async def list_attendance(request: Request, session_id: Optional[str] = None,
                          program_id: Optional[str] = None, customer_id: Optional[str] = None,
                          date_from: Optional[str] = None, date_to: Optional[str] = None):
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    query = {"location_id": lid}
    if session_id:
        query["session_id"] = session_id
    if program_id:
        query["program_id"] = program_id
    if customer_id:
        query["customer_id"] = customer_id
    if date_from:
        query["attendance_date_time"] = {"$gte": date_from}
    if date_to:
        query.setdefault("attendance_date_time", {})
        if isinstance(query["attendance_date_time"], dict):
            query["attendance_date_time"]["$lte"] = date_to + "T23:59:59"
        else:
            query["attendance_date_time"] = {"$gte": query["attendance_date_time"], "$lte": date_to + "T23:59:59"}
    return await _db.attendance_records.find(query, {"_id": 0}).sort("attendance_date_time", -1).to_list(500)

@router.get("/attendance/summary")
async def attendance_summary(request: Request):
    user = await _get_current_user(request)
    lid = await get_location_context(user, request)
    total = await _db.attendance_records.count_documents({"location_id": lid})
    present = await _db.attendance_records.count_documents({"location_id": lid, "status": "present"})
    absent = await _db.attendance_records.count_documents({"location_id": lid, "status": "absent"})
    late = await _db.attendance_records.count_documents({"location_id": lid, "status": "late"})
    programs = await _db.programs.find({"location_id": lid, "is_active": True}, {"_id": 0, "program_id": 1, "name": 1}).to_list(50)
    per_program = []
    for p in programs:
        count = await _db.attendance_records.count_documents({"location_id": lid, "program_id": p["program_id"]})
        present_count = await _db.attendance_records.count_documents({"location_id": lid, "program_id": p["program_id"], "status": "present"})
        per_program.append({"program_id": p["program_id"], "name": p["name"], "total": count, "present": present_count})
    return {"total": total, "present": present, "absent": absent, "late": late, "per_program": per_program}


# ─── Manager Dashboard Stats ─────────────────────────────────────

@router.get("/manager/stats")
async def manager_stats(request: Request):
    user = await _get_current_user(request)
    if user.get("role") == "CUSTOMER" or user.get("role") == "MEMBER":
        raise HTTPException(403, "Staff access required")
    lid = await get_location_context(user, request)
    total_programs = await _db.programs.count_documents({"location_id": lid, "is_active": True})
    active_categories = await _db.program_categories.count_documents({"location_id": lid, "is_active": True})
    active_instructors = await _db.instructors.count_documents({"location_id": lid, "is_active": True})
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    classes_this_week = await _db.class_sessions.count_documents({
        "location_id": lid,
        "start_date_time": {"$gte": week_start.isoformat(), "$lte": week_end.isoformat() + "T23:59:59"},
        "status": {"$ne": "cancelled"}
    })
    # Count active members from the members collection (not users with CUSTOMER role)
    total_customers = await _db.members.count_documents({
        "location_id": lid, 
        "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    return {
        "total_programs": total_programs, "active_categories": active_categories,
        "active_instructors": active_instructors, "classes_this_week": classes_this_week,
        "total_customers": total_customers
    }


# ─── Owner Location Overview ─────────────────────────────────────

@router.get("/locations/{location_id}/overview")
async def location_overview(location_id: str, request: Request):
    user = await _get_current_user(request)
    if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
        loc = await _db.locations.find_one({"location_id": location_id, "owner_id": user["user_id"], "is_deleted": False})
        if not loc:
            raise HTTPException(403, "Access denied")
    elif user.get("location_id"):
        manager_locs = user.get("manager_location_ids", [])
        if not manager_locs:
            manager_locs = [user.get("location_id")]
        if location_id not in manager_locs:
            raise HTTPException(403, "Access denied")
    else:
        raise HTTPException(403, "Access denied")
    
    # Count active, non-deleted items
    base_filter = {"location_id": location_id, "is_active": True, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    categories = await _db.program_categories.count_documents(base_filter)
    programs = await _db.programs.count_documents(base_filter)
    instructors = await _db.instructors.count_documents(base_filter)
    
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    upcoming = await _db.class_sessions.count_documents({
        "location_id": location_id,
        "start_date_time": {"$gte": week_start.isoformat(), "$lte": week_end.isoformat() + "T23:59:59"},
        "status": {"$ne": "cancelled"}
    })
    total_attendance = await _db.attendance_records.count_documents({"location_id": location_id})
    present_count = await _db.attendance_records.count_documents({"location_id": location_id, "status": "present"})
    return {
        "categories": categories, "programs": programs, "instructors": instructors,
        "upcoming_sessions": upcoming, "total_attendance": total_attendance,
        "attendance_rate": round(present_count / total_attendance * 100, 1) if total_attendance > 0 else 0
    }


# ─── Seed Programs ────────────────────────────────────────────────

@router.post("/seed-programs")
async def seed_programs():
    existing = await _db.program_categories.find_one({})
    if existing:
        return {"message": "Programs already seeded"}
    owner = await _db.users.find_one({"email": "owner@spartans.com"}, {"_id": 0})
    if not owner:
        raise HTTPException(400, "Run /api/seed first to create base data")
    locations = await _db.locations.find({"owner_id": owner["user_id"], "is_deleted": False}, {"_id": 0}).to_list(10)
    if not locations:
        raise HTTPException(400, "No locations found")
    now = datetime.now(timezone.utc).isoformat()

    cat_templates = [
        {"name": "Kids BJJ", "description": "Brazilian Jiu-Jitsu for children", "age_group": "5-12", "skill_level": "beginner"},
        {"name": "Women's Kickboxing", "description": "Kickboxing & self-defense for women", "age_group": "Adults", "skill_level": "all"},
        {"name": "Men's MMA", "description": "Mixed martial arts training", "age_group": "Adults", "skill_level": "intermediate"},
        {"name": "CrossFit", "description": "High-intensity functional training", "age_group": "All", "skill_level": "all"},
    ]
    prog_templates = {
        "Kids BJJ": [("Kids White Belt (5-8)", 15, "beginner"), ("Kids Junior (9-12)", 15, "intermediate")],
        "Women's Kickboxing": [("Kickboxing Fundamentals", 20, "beginner"), ("Self-Defense Workshop", 15, "all")],
        "Men's MMA": [("MMA Basics", 20, "beginner"), ("Advanced Sparring", 12, "advanced")],
        "CrossFit": [("Morning WOD", 25, "all"), ("Evening WOD", 25, "all")],
    }
    inst_per_loc = [
        [("Coach Mahmoud", "BJJ, Wrestling"), ("Coach Lina", "Kickboxing, Self-Defense"), ("Coach Faisal", "MMA, CrossFit")],
        [("Coach Rania", "Kickboxing, Muay Thai"), ("Coach Yousef", "BJJ, MMA"), ("Coach Nadia", "CrossFit, Strength")],
        [("Coach Tariq", "MMA, Boxing"), ("Coach Salma", "Kickboxing, Fitness"), ("Coach Bilal", "BJJ, CrossFit")],
        [("Coach Zara", "Muay Thai, Kickboxing"), ("Coach Imran", "BJJ, Wrestling"), ("Coach Huda", "CrossFit, Conditioning")],
    ]
    sched_templates = {
        "Kids BJJ": [(0, "16:00", "17:00", "Dojo A"), (2, "16:00", "17:00", "Dojo A")],
        "Women's Kickboxing": [(1, "09:00", "10:00", "Studio B"), (3, "09:00", "10:00", "Studio B")],
        "Men's MMA": [(0, "18:00", "19:30", "Dojo A"), (2, "18:00", "19:30", "Dojo A"), (4, "18:00", "19:30", "Dojo A")],
        "CrossFit": [(0, "06:00", "07:00", "Open Area"), (2, "06:00", "07:00", "Open Area"), (4, "06:00", "07:00", "Open Area")],
    }

    totals = {"categories": 0, "programs": 0, "instructors": 0, "schedules": 0, "sessions": 0, "attendance": 0}

    for loc_idx, loc in enumerate(locations):
        lid = loc["location_id"]
        cat_ids = {}
        for ct in cat_templates:
            cat_id = f"cat_{uuid.uuid4().hex[:12]}"
            doc = {"category_id": cat_id, "location_id": lid, **ct, "is_active": True, "created_at": now, "updated_at": now}
            await _db.program_categories.insert_one(doc)
            cat_ids[ct["name"]] = cat_id
            totals["categories"] += 1

        inst_ids = []
        for name, specs in inst_per_loc[loc_idx % len(inst_per_loc)]:
            inst_id = f"inst_{uuid.uuid4().hex[:12]}"
            slug = name.lower().replace("coach ", "")
            doc = {
                "instructor_id": inst_id, "location_id": lid, "full_name": name,
                "phone": f"+971-50-{random.randint(100,999)}-{random.randint(1000,9999)}",
                "email": f"{slug}@spartans.ae", "bio": f"Experienced {specs} instructor",
                "specialties": specs, "is_active": True, "created_at": now, "updated_at": now
            }
            await _db.instructors.insert_one(doc)
            inst_ids.append(inst_id)
            totals["instructors"] += 1

        sched_docs = []
        for cat_name, progs in prog_templates.items():
            cat_id = cat_ids[cat_name]
            scheds = sched_templates.get(cat_name, [])
            for pi, (pname, pcap, pdiff) in enumerate(progs):
                prog_id = f"prog_{uuid.uuid4().hex[:12]}"
                doc = {
                    "program_id": prog_id, "location_id": lid, "category_id": cat_id,
                    "name": pname, "description": f"{pname} - {cat_name}",
                    "capacity": pcap, "difficulty_level": pdiff, "is_active": True,
                    "created_at": now, "updated_at": now
                }
                await _db.programs.insert_one(doc)
                totals["programs"] += 1
                if pi == 0:
                    inst_idx = {"Kids BJJ": 0, "Women's Kickboxing": 1, "Men's MMA": 2, "CrossFit": 2}.get(cat_name, 0)
                    for day, st, et, room in scheds:
                        sched_id = f"sched_{uuid.uuid4().hex[:12]}"
                        sdoc = {
                            "schedule_id": sched_id, "location_id": lid, "program_id": prog_id,
                            "instructor_id": inst_ids[inst_idx % len(inst_ids)],
                            "day_of_week": day, "start_time": st, "end_time": et,
                            "room": room, "capacity_override": None, "is_active": True,
                            "created_at": now, "updated_at": now
                        }
                        await _db.class_schedules.insert_one(sdoc)
                        sched_docs.append(sdoc)
                        totals["schedules"] += 1

        for sched in sched_docs:
            count = await _generate_sessions_from_schedule(sched, weeks=8)
            totals["sessions"] += count

        # Also create past sessions (last 2 weeks) for attendance data
        for sched in sched_docs:
            target_day = sched["day_of_week"]
            today_date = date.today()
            for weeks_back in range(1, 3):
                past_date = today_date - timedelta(weeks=weeks_back)
                diff = target_day - past_date.weekday()
                if diff > 0:
                    diff -= 7
                session_date = past_date + timedelta(days=diff)
                start_dt = f"{session_date.isoformat()}T{sched['start_time']}:00"
                end_dt = f"{session_date.isoformat()}T{sched['end_time']}:00"
                existing = await _db.class_sessions.find_one({"schedule_id": sched["schedule_id"], "start_date_time": start_dt})
                if existing:
                    continue
                session_id = f"sess_{uuid.uuid4().hex[:12]}"
                doc = {
                    "session_id": session_id, "location_id": lid, "program_id": sched["program_id"],
                    "instructor_id": sched["instructor_id"], "schedule_id": sched["schedule_id"],
                    "start_date_time": start_dt, "end_date_time": end_dt,
                    "room": sched.get("room", ""), "capacity": sched.get("capacity_override") or 20,
                    "status": "completed", "created_at": now, "updated_at": now
                }
                await _db.class_sessions.insert_one(doc)
                totals["sessions"] += 1

        customers = await _db.users.find({"location_id": lid, "role": "CUSTOMER", "is_active": True}, {"_id": 0}).to_list(50)
        past_sessions = await _db.class_sessions.find({"location_id": lid, "status": "completed"}, {"_id": 0}).to_list(10)
        for session in past_sessions[:3]:
            for cust in customers:
                status = random.choice(["present", "present", "present", "absent", "late"])
                record_id = f"att_{uuid.uuid4().hex[:12]}"
                doc = {
                    "record_id": record_id, "location_id": lid, "customer_id": cust["user_id"],
                    "program_id": session["program_id"], "session_id": session["session_id"],
                    "attendance_date_time": session["start_date_time"], "status": status,
                    "check_in_method": "managerManual", "created_at": now, "updated_at": now
                }
                await _db.attendance_records.insert_one(doc)
                totals["attendance"] += 1

    return {"message": "Programs seeded successfully", **totals}
