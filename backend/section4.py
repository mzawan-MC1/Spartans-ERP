from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta, date
import random

router = APIRouter()
_db = None
_get_current_user = None
_pwd_context = None


def init(database, auth_func, pwd_context=None):
    global _db, _get_current_user, _pwd_context
    _db = database
    _get_current_user = auth_func
    _pwd_context = pwd_context


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
    if user.get("role") == "OWNER":
        return True
    permissions = await get_user_permissions(user)
    return permission in permissions


async def _get_hr_location(user, request):
    if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
        lid = request.query_params.get("location_id")
        if not lid:
            return None # Allow None to mean "All Locations" if the endpoint supports it
        
        owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
        loc = await _db.locations.find_one({"location_id": lid, "owner_id": owner_id, "is_deleted": False})
        if not loc:
            raise HTTPException(403, "Access denied")
        return lid
    elif user.get("location_id"):
        return user["location_id"]
    raise HTTPException(403, "Insufficient permissions")


async def _get_staff_for_hr(user: dict, request: Request, staff_id: str, *, projection: dict = None):
    proj = projection or {"_id": 0}
    lid = await _get_hr_location(user, request)
    role = user.get("role")
    if role in ("OWNER", "OWNER_FULL"):
        if lid:
            staff = await _db.staff.find_one({"staff_id": staff_id, "location_id": {"$in": [lid, None]}}, proj)
            if not staff:
                return None
            if staff.get("location_id"):
                await _require_owner_access_to_location(user, staff.get("location_id"))
            return staff
        staff = await _db.staff.find_one({"staff_id": staff_id}, proj)
        if not staff:
            return None
        if staff.get("location_id"):
            await _require_owner_access_to_location(user, staff.get("location_id"))
        return staff
    if not lid:
        return None
    return await _db.staff.find_one({"staff_id": staff_id, "location_id": lid}, proj)


async def _require_hr_access(request, permission: str = None):
    user = await _get_current_user(request)
    if user.get("role") in ("CUSTOMER", "MEMBER"):
        raise HTTPException(403, "HR access requires Admin/Manager role")
    if permission:
        role = user.get("role")
        if role == "OWNER":
            return user
        if role == "OWNER_FULL":
            from rbac import check_permission as rbac_check_permission
            mapped = None
            if permission == "manager.view_staff":
                mapped = ["owner.view_hr_all", "owner.manage_hr_all"]
            elif permission == "manager.manage_staff":
                mapped = ["owner.manage_hr_all"]
            elif permission == "manager.view_finance_location":
                mapped = ["owner.view_finance_all", "owner.manage_finance_all"]
            elif permission == "manager.manage_finance_location":
                mapped = ["owner.manage_finance_all"]

            if mapped:
                allowed = False
                for p in mapped:
                    if await rbac_check_permission(user, p):
                        allowed = True
                        break
                if not allowed:
                    raise HTTPException(403, f"Missing permission: {mapped[0]}")
                return user

        if not await check_permission(user, permission):
            raise HTTPException(403, f"Missing permission: {permission}")
    return user


async def _require_employee_self_access(request: Request, permission: str = None):
    user = await _get_current_user(request)
    role = user.get("role")
    if role in ("CUSTOMER", "MEMBER"):
        raise HTTPException(403, "Employee access denied")
    if not permission:
        return user
    if role in ("OWNER", "OWNER_FULL"):
        return user
    return user


def _parse_date(v: str) -> Optional[date]:
    s = (v or "").strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


def _days_until(d: Optional[date]) -> Optional[int]:
    if not d:
        return None
    return (d - date.today()).days


def _effective_owner_id(user: dict) -> Optional[str]:
    if user.get("role") == "OWNER":
        return user.get("user_id")
    if user.get("role") == "OWNER_FULL":
        return user.get("owner_id")
    return None


async def _owner_location_ids(user: dict) -> List[str]:
    owner_id = _effective_owner_id(user)
    if not owner_id:
        return []
    locs = await _db.locations.find({"owner_id": owner_id, "is_deleted": False}, {"_id": 0, "location_id": 1}).to_list(200)
    return [l["location_id"] for l in locs if l.get("location_id")]


async def _require_owner_access_to_location(user: dict, location_id: str):
    owner_id = _effective_owner_id(user)
    if not owner_id:
        raise HTTPException(403, "Access denied")
    loc = await _db.locations.find_one({"location_id": location_id, "owner_id": owner_id, "is_deleted": False}, {"_id": 0})
    if not loc:
        raise HTTPException(403, "Access denied")
    return loc


# ─── Models ───────────────────────────────────────────────────────

class PayStructure(BaseModel):
    type: str = "FIXED_SALARY"
    base_amount: float = 0
    currency: str = "AED"

class EmergencyContact(BaseModel):
    name: str = ""
    phone: str = ""
    relation: str = ""

class PostalAddress(BaseModel):
    line1: str = ""
    line2: str = ""
    city: str = ""
    country: str = ""

class PassportVisaSummary(BaseModel):
    passport_no: str = ""
    passport_expiry: str = ""
    visa_status: str = ""
    visa_expiry: str = ""

class TimetableEntry(BaseModel):
    day_of_week: int = Field(..., ge=0, le=6)
    start_time: str = ""
    end_time: str = ""

class StaffCreate(BaseModel):
    first_name: str
    last_name: str
    email: str = ""
    phone: str = ""
    password: Optional[str] = None
    role: str = "INSTRUCTOR"
    employee_type: str = Field(default="STAFF", pattern="^(ADMIN|MANAGER|RECEPTIONIST|STAFF|INSTRUCTOR|EXTERNAL)$")
    employment_type: str = Field(default="FULL_TIME", pattern="^(FULL_TIME|PART_TIME|CONTRACT|CONTRACTOR|EXTERNAL)$")
    employee_code: str = ""
    designation: str = ""
    department: str = ""
    reporting_staff_id: str = ""
    join_date: str = ""
    start_date: str = ""
    timetable: List[TimetableEntry] = []
    profile_image_path: Optional[str] = None
    nationality: str = ""
    dob: str = ""
    gender: str = ""
    marital_status: str = ""
    address: PostalAddress = PostalAddress()
    emergency_contact: EmergencyContact = EmergencyContact()
    passport_visa: PassportVisaSummary = PassportVisaSummary()
    notes: str = ""
    pay_structure: PayStructure = PayStructure()
    is_sales: bool = False
    sales_role: Optional[str] = None
    sales_notes: str = ""

class StaffUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    employee_type: Optional[str] = Field(default=None, pattern="^(ADMIN|MANAGER|RECEPTIONIST|STAFF|INSTRUCTOR|EXTERNAL)?$")
    employment_type: Optional[str] = Field(default=None, pattern="^(FULL_TIME|PART_TIME|CONTRACT|CONTRACTOR|EXTERNAL)?$")
    employee_code: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    reporting_staff_id: Optional[str] = None
    join_date: Optional[str] = None
    start_date: Optional[str] = None
    timetable: Optional[List[TimetableEntry]] = None
    profile_image_path: Optional[str] = None
    nationality: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[PostalAddress] = None
    emergency_contact: Optional[EmergencyContact] = None
    passport_visa: Optional[PassportVisaSummary] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None  # Use is_active instead of status
    pay_structure: Optional[PayStructure] = None
    is_sales: Optional[bool] = None
    sales_role: Optional[str] = None
    sales_notes: Optional[str] = None

class StaffSelfUpdate(BaseModel):
    phone: Optional[str] = None
    profile_image_path: Optional[str] = None
    nationality: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[PostalAddress] = None
    emergency_contact: Optional[EmergencyContact] = None

class StaffEmploymentSetupUpdate(BaseModel):
    employee_code: Optional[str] = None
    employment_type: Optional[str] = Field(default=None, pattern="^(FULL_TIME|PART_TIME|CONTRACT|CONTRACTOR|EXTERNAL)?$")
    role: Optional[str] = None
    employee_type: Optional[str] = Field(default=None, pattern="^(ADMIN|MANAGER|RECEPTIONIST|STAFF|INSTRUCTOR|EXTERNAL)?$")
    designation: Optional[str] = None
    department: Optional[str] = None
    join_date: Optional[str] = None
    start_date: Optional[str] = None
    reporting_staff_id: Optional[str] = None
    weekly_off_day: Optional[str] = None
    shift_name: Optional[str] = None
    timetable: Optional[List[TimetableEntry]] = None
    status: Optional[str] = Field(default=None, pattern="^(draft|pending_join|active|probation|permanent|on_leave|suspended|terminated|resigned|cancelled)?$")
    salary: Optional[float] = None
    currency: Optional[str] = None

class StaffDocumentCreate(BaseModel):
    document_type: str
    file_url: str
    issue_date: str = ""
    expiry_date: str = ""
    status: str = Field(default="submitted", pattern="^(not_submitted|submitted|under_review|approved|rejected|expiring_soon|expired|renewed)$")
    notes: str = ""
    notify_days_before_expiry: int = 15

class StaffAgreementCreate(BaseModel):
    agreement_type: str
    file_url: str
    start_date: str = ""
    end_date: str = ""
    status: str = Field(default="pending", pattern="^(pending|active|expired|cancelled|renewed)$")
    notes: str = ""
    notify_days_before_expiry: int = 15

class StaffRequestCreate(BaseModel):
    request_type: str = Field(..., pattern="^(leave|schedule_change|modified_timing|other|document_renewal|emergency_leave|unpaid_leave)$")
    leave_type: str = ""
    from_date: str = ""
    to_date: str = ""
    reason: str = ""
    details: Dict[str, Any] = {}

class StaffRequestAction(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|send_back|comment)$")
    comment: str = ""

class StaffProbationEvent(BaseModel):
    action: str = Field(..., pattern="^(start|extend|confirm_permanent|cancel|note)$")
    start_date: str = ""
    end_date: str = ""
    notes: str = ""

class StaffVisaRecordCreate(BaseModel):
    visa_status: str = Field(default="applied", pattern="^(applied|under_process|probation|renewal|cancel|own_visa|expired|rejected|completed)$")
    issue_date: str = ""
    expiry_date: str = ""
    sponsor_type: str = ""
    file_url: str = ""
    notes: str = ""
    notify_days_before_expiry: int = 30

class StaffAssetAssignCreate(BaseModel):
    asset_type: str
    asset_tag: str = ""
    assigned_at: str = ""
    returned_at: str = ""
    notes: str = ""

class StaffExitCaseCreate(BaseModel):
    exit_type: str = Field(..., pattern="^(resignation|termination)$")
    status: str = Field(default="draft", pattern="^(draft|submitted|approved|completed|cancelled)$")
    effective_date: str = ""
    reason: str = ""
    notes: str = ""

class StaffNoteCreate(BaseModel):
    note: str
    is_confidential: bool = False

class StaffEmploymentEventCreate(BaseModel):
    event_type: str = Field(..., pattern="^(salary_revision|promotion|transfer|disciplinary_action|note)$")
    effective_date: str = ""
    title: str = ""
    details: str = ""

class StaffAgreementUpdate(BaseModel):
    agreement_type: Optional[str] = None
    file_url: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(pending|active|expired|cancelled|renewed|replaced)?$")
    notes: Optional[str] = None

class StaffDocumentUpdate(BaseModel):
    document_type: Optional[str] = None
    file_url: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(not_submitted|submitted|under_review|approved|rejected|expiring_soon|expired|renewed)?$")
    notes: Optional[str] = None
    notify_days_before_expiry: Optional[int] = None

class StaffVisaRecordUpdate(BaseModel):
    visa_status: Optional[str] = Field(default=None, pattern="^(applied|under_process|probation|renewal|cancel|own_visa|expired|rejected|completed)?$")
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    sponsor_type: Optional[str] = None
    file_url: Optional[str] = None
    notes: Optional[str] = None
    notify_days_before_expiry: Optional[int] = None

class StaffAttendanceCreate(BaseModel):
    date: str
    status: str = Field(default="present", pattern="^(present|late|absent|off|overtime)$")
    check_in: str = ""
    check_out: str = ""
    notes: str = ""

class StaffPerformanceReportCreate(BaseModel):
    report_type: str = Field(default="work_report", pattern="^(work_report|attendance_report|task_report|task_performance|performance_report)$")
    title: str = ""
    file_url: str = ""
    notes: str = ""

class StaffWarningCreate(BaseModel):
    title: str
    date: str = ""
    severity: str = Field(default="medium", pattern="^(low|medium|high)$")
    notes: str = ""
    file_url: str = ""

class StaffAwardCreate(BaseModel):
    title: str
    date: str = ""
    category: str = ""
    notes: str = ""
    file_url: str = ""

class PayrollCreate(BaseModel):
    staff_id: str
    period_start: str
    period_end: str
    base_pay: float = 0
    variable_pay: float = 0
    bonuses: float = 0
    deductions: float = 0
    notes: str = ""

class PayrollUpdate(BaseModel):
    base_pay: Optional[float] = None
    variable_pay: Optional[float] = None
    bonuses: Optional[float] = None
    deductions: Optional[float] = None
    notes: Optional[str] = None

class PayrollStatusUpdate(BaseModel):
    status: str
    payment_date: Optional[str] = None

class ExpenseCreate(BaseModel):
    date: str
    category: str
    amount: float
    currency: str = "AED"
    description: str = ""
    notes: str = ""

class ExpenseUpdate(BaseModel):
    date: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None


# ─── Staff CRUD ───────────────────────────────────────────────────

@router.post("/staff", status_code=201)
async def create_staff(data: StaffCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    
    # Handle location_id
    if user["role"] == "LOCATION_MANAGER":
        lid = user["location_id"]
    else: # OWNER
        lid = request.query_params.get("location_id")
        if not lid:
             # Try to get from body if we add it to StaffCreate later, but for now require param or default to first location
             owner_id = _effective_owner_id(user)
             if not owner_id:
                 raise HTTPException(403, "Access denied")
             locations = await _db.locations.find({"owner_id": owner_id, "is_deleted": False}).to_list(1)
             if not locations:
                 raise HTTPException(400, "No locations found. Create a location first.")
             lid = locations[0]["location_id"]
        else:
             await _require_owner_access_to_location(user, lid)
    
    staff_id = f"staff_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Create User account if password provided
    user_id = None
    if data.password and data.email:
        email_normalized = data.email.strip().lower()
        # Check if email already used
        if await _db.users.find_one({"email": email_normalized}):
            raise HTTPException(400, "Email already in use by another user")
            
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        
        # Get owner_id
        loc = await _db.locations.find_one({"location_id": lid})
        owner_id = loc.get("owner_id") if loc else _effective_owner_id(user)
        
        user_doc = {
            "user_id": user_id,
            "email": email_normalized,
            "name": f"{data.first_name} {data.last_name}",
            "password_hash": _pwd_context.hash(data.password),
            "picture": data.profile_image_path,
            "role": data.role,
            "location_id": lid,
            "owner_id": owner_id,
            "staff_id": staff_id,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
        role_doc = await _db.roles.find_one({"code": user_doc["role"]}, {"role_id": 1})
        if role_doc:
            user_doc["admin_role_ids"] = [role_doc["role_id"]]
        else:
            user_doc["admin_role_ids"] = []
        await _db.users.insert_one(user_doc)

    doc = {
        "staff_id": staff_id, "location_id": lid,
        "user_id": user_id,
        "first_name": data.first_name, "last_name": data.last_name,
        "email": data.email.strip().lower(), "phone": data.phone, "role": data.role,
        "employment_type": data.employment_type,
        "employee_type": data.employee_type or _derive_employee_type(data.role, data.employment_type),
        "employee_code": (data.employee_code or "").strip(),
        "designation": (data.designation or "").strip(),
        "department": (data.department or "").strip(),
        "reporting_staff_id": (data.reporting_staff_id or "").strip(),
        "join_date": data.join_date or now[:10],
        "start_date": data.start_date or "",
        "timetable": [t.model_dump() for t in (data.timetable or [])],
        "weekly_off_day": "",
        "shift_name": "",
        "status": "active",
        "salary": float(data.pay_structure.base_amount or 0),
        "currency": (data.pay_structure.currency or "AED"),
        "is_active": True, "deleted_at": None,
        "profile_image_path": data.profile_image_path,
        "nationality": (data.nationality or "").strip(),
        "dob": (data.dob or "").strip(),
        "gender": (data.gender or "").strip(),
        "marital_status": (data.marital_status or "").strip(),
        "address": data.address.model_dump(),
        "emergency_contact": data.emergency_contact.model_dump(),
        "passport_visa": data.passport_visa.model_dump(),
        "notes": data.notes,
        "pay_structure": data.pay_structure.model_dump(),
        "is_sales": data.is_sales,
        "sales_role": data.sales_role,
        "sales_notes": data.sales_notes,
        "created_at": now, "updated_at": now
    }
    await _db.staff.insert_one(doc)
    doc.pop("_id", None)
    
    # Auto-create instructor record when staff role is INSTRUCTOR or role code contains INSTRUCTOR
    if "INSTRUCTOR" in data.role.upper():
        inst_id = f"inst_{uuid.uuid4().hex[:12]}"
        full_name = f"{data.first_name} {data.last_name}".strip()
        instructor_doc = {
            "instructor_id": inst_id,
            "location_id": lid,
            "staff_id": staff_id,  # Link to staff record
            "full_name": full_name,
            "phone": data.phone,
            "email": data.email,
            "bio": data.notes or "",
            "specialties": "",
            "is_active": True,
            "deleted_at": None,
            "created_at": now,
            "updated_at": now
        }
        await _db.instructors.insert_one(instructor_doc)
    
    return doc

@router.get("/staff")
async def list_staff(request: Request, is_active: Optional[bool] = None, role: Optional[str] = None, employee_type: Optional[str] = None, employment_type: Optional[str] = None, include_deleted: bool = False):
    """
    List staff for admin view.
    - By default returns non-deleted items (both active and inactive)
    - Use is_active=true/false to filter by status
    - Use include_deleted=true to see deleted items (admin-only)
    """
    user = await _require_hr_access(request, "manager.view_staff")
    lid = await _get_hr_location(user, request)
    
    if user.get("role") in ("OWNER", "OWNER_FULL"):
        effective_owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
        sync_loc_ids = [lid] if lid else await _owner_location_ids(user)
        if effective_owner_id and sync_loc_ids:
            locs = await _db.locations.find({"location_id": {"$in": sync_loc_ids}}, {"_id": 0, "location_id": 1, "default_currency": 1}).to_list(200)
            loc_currency = {l["location_id"]: l.get("default_currency", "AED") for l in locs}
            users_query = {
                "$or": [{"user_id": effective_owner_id}, {"owner_id": effective_owner_id}],
                "role": {"$in": ["OWNER", "OWNER_FULL", "LOCATION_MANAGER", "RECEPTIONIST"]},
                "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}],
            }
            admin_users = await _db.users.find(users_query, {"_id": 0}).to_list(500)
            now = datetime.now(timezone.utc).isoformat()

            for u in admin_users:
                target_lid = None
                u_role = u.get("role")

                if u_role in ("LOCATION_MANAGER", "RECEPTIONIST"):
                    target_lid = u.get("location_id") or (u.get("manager_location_ids") or [None])[0]
                    if not target_lid or target_lid not in sync_loc_ids:
                        continue
                else:
                    target_lid = None

                existing = await _db.staff.find_one({"user_id": u["user_id"]}, {"_id": 0})
                if not existing and u.get("staff_id"):
                    existing = await _db.staff.find_one({"staff_id": u["staff_id"]}, {"_id": 0})

                if existing:
                    updates = {
                        "user_id": u["user_id"],
                        "first_name": u.get("first_name", ""),
                        "last_name": u.get("last_name", ""),
                        "email": (u.get("email") or "").strip().lower(),
                        "role": u_role,
                        "is_active": u.get("is_active", True),
                        "updated_at": now,
                    }
                    if existing.get("location_id") != target_lid:
                        updates["location_id"] = target_lid
                    await _db.staff.update_one({"staff_id": existing["staff_id"]}, {"$set": updates})
                    await _db.users.update_one(
                        {"user_id": u["user_id"]},
                        {"$set": {"staff_id": existing["staff_id"], "employee_location_id": target_lid if u_role in ("OWNER", "OWNER_FULL") else u.get("employee_location_id"), "updated_at": now}},
                    )
                else:
                    staff_id = u.get("staff_id") or f"staff_{uuid.uuid4().hex[:12]}"
                    currency = loc_currency.get(target_lid, "AED")
                    join_date = (u.get("created_at") or now)[:10]
                    staff_doc = {
                        "staff_id": staff_id,
                        "location_id": target_lid,
                        "user_id": u["user_id"],
                        "first_name": u.get("first_name", ""),
                        "last_name": u.get("last_name", ""),
                        "email": (u.get("email") or "").strip().lower(),
                        "phone": "",
                        "role": u_role,
                        "employment_type": "FULL_TIME",
                        "employee_type": _derive_employee_type(u_role, "FULL_TIME"),
                        "employee_code": f"EMP-{staff_id[-4:].upper()}",
                        "designation": "",
                        "department": "",
                        "reporting_staff_id": "",
                        "join_date": join_date,
                        "start_date": "",
                        "timetable": [],
                        "weekly_off_day": "",
                        "shift_name": "",
                        "status": "active",
                        "salary": 0,
                        "currency": currency,
                        "is_active": u.get("is_active", True),
                        "deleted_at": None,
                        "profile_image_path": None,
                        "address": PostalAddress().model_dump(),
                        "emergency_contact": EmergencyContact().model_dump(),
                        "passport_visa": PassportVisaSummary().model_dump(),
                        "notes": "",
                        "pay_structure": {"type": "FIXED_SALARY", "base_amount": 0, "currency": currency},
                        "is_sales": False,
                        "sales_role": None,
                        "sales_notes": "",
                        "created_at": now,
                        "updated_at": now,
                    }
                    await _db.staff.insert_one(staff_doc)
                    await _db.users.update_one(
                        {"user_id": u["user_id"]},
                        {"$set": {"staff_id": staff_id, "employee_location_id": target_lid if u_role in ("OWNER", "OWNER_FULL") else u.get("employee_location_id"), "updated_at": now}},
                    )

    query = {}
    if lid:
        query["location_id"] = lid
    elif user.get("role") in ("OWNER", "OWNER_FULL"):
        # If owner and no location_id, show all staff for their locations
        loc_ids = await _owner_location_ids(user)
        query["location_id"] = {"$in": [*loc_ids, None]}
    
    # By default, exclude deleted items
    if not include_deleted:
        query["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    
    if is_active is not None:
        query["is_active"] = is_active
    if role:
        query["role"] = role
    if employee_type:
        query["employee_type"] = employee_type
    if employment_type:
        query["employment_type"] = employment_type
    
    return await _db.staff.find(query, {"_id": 0}).to_list(200)

@router.get("/staff/me")
async def get_my_staff_profile(request: Request):
    user = await _require_employee_self_access(request, "employee.view_own_profile")
    staff = await _ensure_staff_for_user(user, request=request)
    return {"staff": staff}


@router.patch("/staff/me")
async def update_my_staff_profile(data: StaffSelfUpdate, request: Request):
    user = await _require_employee_self_access(request, "employee.edit_own_profile")
    staff = await _ensure_staff_for_user(user, request=request)
    now = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"updated_at": now}
    allowed = {"phone", "profile_image_path", "nationality", "dob", "gender", "marital_status", "address", "emergency_contact"}
    for k, v in data.model_dump(exclude_unset=True).items():
        if k not in allowed:
            continue
        if k in ("address", "emergency_contact") and v is not None:
            if isinstance(v, dict):
                updates[k] = v
            elif hasattr(v, "model_dump"):
                updates[k] = v.model_dump()
            else:
                updates[k] = v
        else:
            updates[k] = v
    if len(updates.keys()) == 1:
        return {"staff": staff}
    await _db.staff.update_one({"staff_id": staff["staff_id"]}, {"$set": updates})
    return {"staff": await _db.staff.find_one({"staff_id": staff["staff_id"]}, {"_id": 0})}

@router.get("/staff/{staff_id}")
async def get_staff(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        loc_ids = await _owner_location_ids(user)
        doc = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": {"$in": [*loc_ids, None]},
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        }, {"_id": 0})
    else:
        doc = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": lid,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        }, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Staff not found")
    return doc

@router.patch("/staff/{staff_id}")
async def update_staff(staff_id: str, data: StaffUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        loc_ids = await _owner_location_ids(user)
        existing = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": {"$in": [*loc_ids, None]},
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        if existing:
            lid = existing.get("location_id")
    else:
        existing = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": lid,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
    if not existing:
        raise HTTPException(404, "Staff not found")
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            if k == "pay_structure":
                updates["pay_structure"] = v
            else:
                updates[k] = v
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.staff.update_one({"staff_id": staff_id}, {"$set": updates})
    
    # Update User password if provided
    if data.password:
        linked_user = await _db.users.find_one({"staff_id": staff_id})
        
        # If not linked by staff_id, try to find by email
        if not linked_user:
            email = updates.get("email") or existing.get("email")
            if email:
                email_normalized = email.strip().lower()
                linked_user = await _db.users.find_one({"email": email_normalized})

        if linked_user:
            # Update existing user
            await _db.users.update_one(
                {"user_id": linked_user["user_id"]},
                {"$set": {
                    "password_hash": _pwd_context.hash(data.password),
                    "staff_id": staff_id, # Ensure link
                    "updated_at": updates["updated_at"]
                }}
            )
            # Ensure reverse link
            if linked_user.get("user_id") != existing.get("user_id"):
                 await _db.staff.update_one({"staff_id": staff_id}, {"$set": {"user_id": linked_user["user_id"]}})
        else:
            # Create user if not exists
            email = updates.get("email") or existing.get("email")
            if email:
                email_normalized = email.strip().lower()
                # Check if email used by another user (should be covered by find_one above, but double check)
                if await _db.users.find_one({"email": email_normalized}):
                    pass # Should have been caught above, but safety first
                else:
                    user_id = f"user_{uuid.uuid4().hex[:12]}"
                    loc = await _db.locations.find_one({"location_id": lid})
                    owner_id = loc.get("owner_id") if loc else user.get("owner_id")
                    
                    user_doc = {
                        "user_id": user_id,
                        "email": email_normalized,
                        "name": f"{updates.get('first_name', existing['first_name'])} {updates.get('last_name', existing['last_name'])}",
                        "password_hash": _pwd_context.hash(data.password),
                        "picture": updates.get("profile_image_path", existing.get("profile_image_path")),
                        "role": updates.get("role", existing["role"]),
                        "location_id": lid,
                        "owner_id": owner_id,
                        "staff_id": staff_id,
                        "is_active": updates.get("is_active", existing.get("is_active", True)),
                        "created_at": updates["updated_at"],
                        "updated_at": updates["updated_at"]
                    }
                    
                    # Fetch role ID for admin_role_ids
                    role_doc = await _db.roles.find_one({"code": user_doc["role"]}, {"role_id": 1})
                    if role_doc:
                        user_doc["admin_role_ids"] = [role_doc["role_id"]]
                    else:
                        user_doc["admin_role_ids"] = []
                        
                    await _db.users.insert_one(user_doc)
                    await _db.staff.update_one({"staff_id": staff_id}, {"$set": {"user_id": user_id}})

    # Sync instructor record if staff role is/was INSTRUCTOR
    now = datetime.now(timezone.utc).isoformat()
    is_instructor_role = "INSTRUCTOR" in updates.get("role", existing.get("role", "")).upper()
    was_instructor_role = "INSTRUCTOR" in existing.get("role", "").upper()
    
    if is_instructor_role or was_instructor_role:
        instructor = await _db.instructors.find_one({"staff_id": staff_id})
        
        if is_instructor_role and not instructor:
            # Role changed TO instructor - create instructor record
            inst_id = f"inst_{uuid.uuid4().hex[:12]}"
            first_name = updates.get("first_name", existing.get("first_name", ""))
            last_name = updates.get("last_name", existing.get("last_name", ""))
            full_name = f"{first_name} {last_name}".strip()
            instructor_doc = {
                "instructor_id": inst_id,
                "location_id": lid,
                "staff_id": staff_id,
                "full_name": full_name,
                "phone": updates.get("phone", existing.get("phone", "")),
                "email": updates.get("email", existing.get("email", "")),
                "bio": "",
                "specialties": "",
                "is_active": updates.get("is_active", existing.get("is_active", True)),
                "deleted_at": None,
                "created_at": now,
                "updated_at": now
            }
            await _db.instructors.insert_one(instructor_doc)
        elif not is_instructor_role and instructor:
            # Role changed FROM instructor - deactivate instructor record
            await _db.instructors.update_one(
                {"staff_id": staff_id},
                {"$set": {"is_active": False, "updated_at": now}}
            )
        elif instructor:
            # Update instructor record to stay in sync
            inst_updates = {"updated_at": now}
            if "first_name" in updates or "last_name" in updates:
                first_name = updates.get("first_name", existing.get("first_name", ""))
                last_name = updates.get("last_name", existing.get("last_name", ""))
                inst_updates["full_name"] = f"{first_name} {last_name}".strip()
            if "phone" in updates:
                inst_updates["phone"] = updates["phone"]
            if "email" in updates:
                inst_updates["email"] = updates["email"]
            if "is_active" in updates:
                inst_updates["is_active"] = updates["is_active"]
            await _db.instructors.update_one({"staff_id": staff_id}, {"$set": inst_updates})
    
    return await _db.staff.find_one({"staff_id": staff_id}, {"_id": 0})


class StaffTransferRequest(BaseModel):
    to_location_id: str


@router.post("/staff/{staff_id}/transfer")
async def transfer_staff(staff_id: str, data: StaffTransferRequest, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    now = datetime.now(timezone.utc).isoformat()

    existing = await _db.staff.find_one({"staff_id": staff_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Staff not found")

    to_location_id = data.to_location_id
    if not to_location_id:
        raise HTTPException(400, "to_location_id is required")

    loc = await _db.locations.find_one({"location_id": to_location_id, "is_deleted": False}, {"_id": 0, "owner_id": 1})
    if not loc:
        raise HTTPException(404, "Target location not found")

    role = user.get("role")
    if role in ("OWNER", "OWNER_FULL"):
        await _require_owner_access_to_location(user, to_location_id)
    else:
        allowed = set([user.get("location_id")])
        for lid in user.get("manager_location_ids") or []:
            allowed.add(lid)
        if to_location_id not in allowed:
            raise HTTPException(403, "Access denied to target location")

    await _db.staff.update_one(
        {"staff_id": staff_id},
        {"$set": {
            "location_id": to_location_id,
            "transferred_from_location_id": existing.get("location_id"),
            "transferred_at": now,
            "updated_at": now,
        }},
    )

    await _db.users.update_many(
        {"staff_id": staff_id},
        {"$set": {"location_id": to_location_id, "updated_at": now}},
    )

    await _db.instructors.update_many(
        {"staff_id": staff_id},
        {"$set": {"location_id": to_location_id, "updated_at": now}},
    )

    return await _db.staff.find_one({"staff_id": staff_id}, {"_id": 0})

@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str, request: Request):
    """Soft delete staff - sets deleted_at timestamp. Record can be restored."""
    user = await _require_hr_access(request, "manager.manage_staff")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        loc_ids = await _owner_location_ids(user)
        existing = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": {"$in": loc_ids},
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
    else:
        existing = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": lid,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
    if not existing:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.staff.update_one(
        {"staff_id": staff_id}, 
        {"$set": {"deleted_at": now, "updated_at": now}}
    )
    
    # Also soft-delete linked instructor record if exists
    if existing.get("role") == "INSTRUCTOR":
        await _db.instructors.update_one(
            {"staff_id": staff_id},
            {"$set": {"deleted_at": now, "updated_at": now}}
        )
    
    return {"message": "Staff deleted"}

@router.post("/staff/{staff_id}/restore")
async def restore_staff(staff_id: str, request: Request):
    """Restore a soft-deleted staff member"""
    user = await _require_hr_access(request, "manager.manage_staff")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        loc_ids = await _owner_location_ids(user)
        existing = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": {"$in": loc_ids}, "deleted_at": {"$ne": None}
        })
    else:
        existing = await _db.staff.find_one({
            "staff_id": staff_id, "location_id": lid, "deleted_at": {"$ne": None}
        })
    if not existing:
        raise HTTPException(404, "Deleted staff not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.staff.update_one(
        {"staff_id": staff_id}, 
        {"$set": {"deleted_at": None, "updated_at": now}}
    )
    
    # Also restore linked instructor record if exists
    if existing.get("role") == "INSTRUCTOR":
        await _db.instructors.update_one(
            {"staff_id": staff_id},
            {"$set": {"deleted_at": None, "updated_at": now}}
        )
    
    return await _db.staff.find_one({"staff_id": staff_id}, {"_id": 0})

@router.delete("/staff/{staff_id}/permanent")
async def permanent_delete_staff(staff_id: str, request: Request):
    """Permanently delete a staff member (Owner only)"""
    user = await _get_current_user(request)
    if user["role"] != "OWNER":
        raise HTTPException(403, "Only owners can permanently delete records")
    lid = await _get_hr_location(user, request)
    if not lid:
        loc_ids = await _owner_location_ids(user)
        existing = await _db.staff.find_one({"staff_id": staff_id, "location_id": {"$in": loc_ids}})
    else:
        existing = await _db.staff.find_one({"staff_id": staff_id, "location_id": lid})
    if not existing:
        raise HTTPException(404, "Staff not found")
    await _db.staff.delete_one({"staff_id": staff_id})
    return {"message": "Staff permanently deleted"}


# ─── Payroll CRUD ─────────────────────────────────────────────────

@router.post("/payroll", status_code=201)
async def create_payroll(data: PayrollCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_finance_location")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        owner_id = _effective_owner_id(user)
        staff = await _db.staff.find_one({"staff_id": data.staff_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0})
        if not staff:
            raise HTTPException(400, "Staff not found")
        loc_ids = await _owner_location_ids(user)
        staff_lid = staff.get("location_id")
        if staff_lid is None:
            if staff.get("role") not in ("OWNER", "OWNER_FULL"):
                raise HTTPException(403, "Access denied")
            linked_user_id = staff.get("user_id")
            if not linked_user_id or not owner_id:
                raise HTTPException(403, "Access denied")
            linked_user = await _db.users.find_one({"user_id": linked_user_id}, {"_id": 0, "user_id": 1, "owner_id": 1})
            if not linked_user:
                raise HTTPException(403, "Access denied")
            if linked_user.get("user_id") != owner_id and linked_user.get("owner_id") != owner_id:
                raise HTTPException(403, "Access denied")
            lid = None
        else:
            if staff_lid not in loc_ids:
                raise HTTPException(403, "Access denied")
            lid = staff_lid
    else:
        staff = await _db.staff.find_one({"staff_id": data.staff_id, "location_id": lid}, {"_id": 0})
    if not staff:
        raise HTTPException(400, "Staff not found at this location")
    payroll_id = f"pay_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    total = data.base_pay + data.variable_pay + data.bonuses - data.deductions
    doc = {
        "payroll_id": payroll_id, "location_id": lid, "staff_id": data.staff_id,
        "period_start": data.period_start, "period_end": data.period_end,
        "pay_structure_snapshot": staff.get("pay_structure", {}),
        "base_pay": data.base_pay, "variable_pay": data.variable_pay,
        "bonuses": data.bonuses, "deductions": data.deductions,
        "total_payable": total,
        "currency": staff.get("pay_structure", {}).get("currency", "AED"),
        "status": "DRAFT", "payment_date": None, "notes": data.notes,
        "staff_name": f"{staff['first_name']} {staff['last_name']}",
        "created_at": now, "updated_at": now
    }
    if lid is None and user.get("role") in ("OWNER", "OWNER_FULL"):
        doc["owner_id"] = _effective_owner_id(user)
    await _db.payroll_records.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/payroll")
async def list_payroll(request: Request, staff_id: Optional[str] = None,
                       period_start: Optional[str] = None, period_end: Optional[str] = None,
                       status: Optional[str] = None):
    user = await _require_hr_access(request, "manager.view_finance_location")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        owner_id = _effective_owner_id(user)
        loc_ids = await _owner_location_ids(user)
        query = {
            "$or": [
                {"location_id": {"$in": loc_ids}},
                {"location_id": None, "owner_id": owner_id},
                {"location_id": {"$exists": False}, "owner_id": owner_id},
            ]
        }
    else:
        query = {"location_id": lid}
    if staff_id:
        query["staff_id"] = staff_id
    if status:
        query["status"] = status
    if period_start:
        query["period_start"] = {"$gte": period_start}
    if period_end:
        query.setdefault("period_end", {})
        if isinstance(query.get("period_end"), dict):
            query["period_end"]["$lte"] = period_end
        else:
            query["period_end"] = {"$lte": period_end}
    return await _db.payroll_records.find(query, {"_id": 0}).sort("period_start", -1).to_list(500)

@router.get("/payroll/{payroll_id}")
async def get_payroll(payroll_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_finance_location")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        owner_id = _effective_owner_id(user)
        loc_ids = await _owner_location_ids(user)
        doc = await _db.payroll_records.find_one(
            {
                "payroll_id": payroll_id,
                "$or": [
                    {"location_id": {"$in": loc_ids}},
                    {"location_id": None, "owner_id": owner_id},
                    {"location_id": {"$exists": False}, "owner_id": owner_id},
                ],
            },
            {"_id": 0}
        )
    else:
        doc = await _db.payroll_records.find_one({"payroll_id": payroll_id, "location_id": lid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Payroll record not found")
    return doc

@router.patch("/payroll/{payroll_id}")
async def update_payroll(payroll_id: str, data: PayrollUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_finance_location")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        owner_id = _effective_owner_id(user)
        loc_ids = await _owner_location_ids(user)
        existing = await _db.payroll_records.find_one(
            {
                "payroll_id": payroll_id,
                "$or": [
                    {"location_id": {"$in": loc_ids}},
                    {"location_id": None, "owner_id": owner_id},
                    {"location_id": {"$exists": False}, "owner_id": owner_id},
                ],
            },
            {"_id": 0}
        )
    else:
        existing = await _db.payroll_records.find_one({"payroll_id": payroll_id, "location_id": lid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Payroll record not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        bp = updates.get("base_pay", existing["base_pay"])
        vp = updates.get("variable_pay", existing["variable_pay"])
        bo = updates.get("bonuses", existing["bonuses"])
        de = updates.get("deductions", existing["deductions"])
        updates["total_payable"] = bp + vp + bo - de
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.payroll_records.update_one({"payroll_id": payroll_id}, {"$set": updates})
    return await _db.payroll_records.find_one({"payroll_id": payroll_id}, {"_id": 0})

@router.patch("/payroll/{payroll_id}/status")
async def update_payroll_status(payroll_id: str, data: PayrollStatusUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_finance_location")
    lid = await _get_hr_location(user, request)
    if not lid and user.get("role") in ("OWNER", "OWNER_FULL"):
        owner_id = _effective_owner_id(user)
        loc_ids = await _owner_location_ids(user)
        existing = await _db.payroll_records.find_one(
            {
                "payroll_id": payroll_id,
                "$or": [
                    {"location_id": {"$in": loc_ids}},
                    {"location_id": None, "owner_id": owner_id},
                    {"location_id": {"$exists": False}, "owner_id": owner_id},
                ],
            }
        )
    else:
        existing = await _db.payroll_records.find_one({"payroll_id": payroll_id, "location_id": lid})
    if not existing:
        raise HTTPException(404, "Payroll record not found")
    if data.status not in ("DRAFT", "APPROVED", "PAID"):
        raise HTTPException(400, "Invalid status")
    updates = {"status": data.status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if data.status == "PAID":
        updates["payment_date"] = data.payment_date or datetime.now(timezone.utc).isoformat()[:10]
    await _db.payroll_records.update_one({"payroll_id": payroll_id}, {"$set": updates})
    return await _db.payroll_records.find_one({"payroll_id": payroll_id}, {"_id": 0})


# ─── Expenses CRUD ────────────────────────────────────────────────

@router.post("/expenses", status_code=201)
async def create_expense(data: ExpenseCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_finance_location")
    lid = await _get_hr_location(user, request)
    expense_id = f"exp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "expense_id": expense_id, "location_id": lid, "date": data.date,
        "category": data.category, "amount": data.amount, "currency": data.currency,
        "description": data.description, "added_by_user_id": user["user_id"],
        "notes": data.notes, "is_deleted": False,
        "created_at": now, "updated_at": now
    }
    await _db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.get("/expenses")
async def list_expenses(request: Request, date_from: Optional[str] = None,
                        date_to: Optional[str] = None, category: Optional[str] = None):
    user = await _require_hr_access(request, "manager.view_finance_location")
    lid = await _get_hr_location(user, request)
    query = {"location_id": lid, "is_deleted": False}
    if category:
        query["category"] = category
    if date_from:
        query["date"] = {"$gte": date_from}
    if date_to:
        query.setdefault("date", {})
        if isinstance(query.get("date"), dict):
            query["date"]["$lte"] = date_to
        else:
            query["date"] = {"$lte": date_to}
    return await _db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(500)

@router.get("/expenses/{expense_id}")
async def get_expense(expense_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_finance_location")
    lid = await _get_hr_location(user, request)
    doc = await _db.expenses.find_one({"expense_id": expense_id, "location_id": lid, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Expense not found")
    return doc

@router.patch("/expenses/{expense_id}")
async def update_expense(expense_id: str, data: ExpenseUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_finance_location")
    lid = await _get_hr_location(user, request)
    existing = await _db.expenses.find_one({"expense_id": expense_id, "location_id": lid, "is_deleted": False})
    if not existing:
        raise HTTPException(404, "Expense not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.expenses.update_one({"expense_id": expense_id}, {"$set": updates})
    return await _db.expenses.find_one({"expense_id": expense_id}, {"_id": 0})

@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, request: Request):
    user = await _require_hr_access(request, "manager.manage_finance_location")
    lid = await _get_hr_location(user, request)
    existing = await _db.expenses.find_one({"expense_id": expense_id, "location_id": lid, "is_deleted": False})
    if not existing:
        raise HTTPException(404, "Expense not found")
    now = datetime.now(timezone.utc).isoformat()
    await _db.expenses.update_one({"expense_id": expense_id}, {"$set": {"is_deleted": True, "updated_at": now}})
    return {"message": "Expense deleted"}


# ─── Financial Reporting ──────────────────────────────────────────

@router.get("/finance/location-summary")
async def location_finance_summary(request: Request, period_start: Optional[str] = None, period_end: Optional[str] = None):
    user = await _require_hr_access(request, "manager.view_finance_location")
    lid = await _get_hr_location(user, request)
    if not period_start:
        period_start = date.today().replace(day=1).isoformat()
    if not period_end:
        period_end = date.today().isoformat()
    period_end_next = (date.fromisoformat(period_end) + timedelta(days=1)).isoformat()

    pay_query = {"location_id": lid, "period_start": {"$gte": period_start}, "period_end": {"$lte": period_end}}
    payroll_records = await _db.payroll_records.find(pay_query, {"_id": 0}).to_list(500)
    total_payroll = sum(r.get("total_payable", 0) for r in payroll_records)

    exp_query = {"location_id": lid, "is_deleted": False, "date": {"$gte": period_start, "$lte": period_end}}
    expenses = await _db.expenses.find(exp_query, {"_id": 0}).to_list(500)
    total_expenses = sum(e.get("amount", 0) for e in expenses)

    rev_query = {
        "location_id": lid,
        "status": {"$in": ["paid", "approved", "completed"]},
        "$or": [
            {"paid_at": {"$gte": period_start, "$lt": period_end_next}},
            {"paid_at": None, "created_at": {"$gte": period_start, "$lt": period_end_next}},
            {"paid_at": {"$exists": False}, "created_at": {"$gte": period_start, "$lt": period_end_next}},
        ],
    }
    payments = await _db.payments.find(rev_query, {"_id": 0, "amount": 1}).to_list(5000)
    total_revenue = sum(p.get("amount", 0) for p in payments)

    # Group expenses by category
    by_category = {}
    for e in expenses:
        cat = e.get("category", "MISC")
        by_category[cat] = by_category.get(cat, 0) + e.get("amount", 0)

    loc = await _db.locations.find_one({"location_id": lid}, {"_id": 0, "default_currency": 1})
    currency = loc.get("default_currency", "AED") if loc else "AED"

    return {
        "location_id": lid, "period_start": period_start, "period_end": period_end,
        "total_payroll": total_payroll, "total_expenses": total_expenses,
        "total_revenue": total_revenue, "currency": currency,
        "expenses_by_category": [{"category": k, "amount": v} for k, v in sorted(by_category.items())]
    }

@router.get("/finance/owner-summary")
async def owner_finance_summary(request: Request, period_start: Optional[str] = None, period_end: Optional[str] = None):
    user = await _get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.view_finance_all")
    elif user.get("role") != "OWNER":
        raise HTTPException(403, "Owner access only")
    if not period_start:
        period_start = date.today().replace(day=1).isoformat()
    if not period_end:
        period_end = date.today().isoformat()
    period_end_next = (date.fromisoformat(period_end) + timedelta(days=1)).isoformat()
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    if not owner_id:
        raise HTTPException(403, "Owner access only")
    locations = await _db.locations.find({"owner_id": owner_id, "is_deleted": False}, {"_id": 0}).to_list(50)
    results = []
    grand_payroll = 0
    grand_expenses = 0
    grand_revenue = 0
    for loc in locations:
        lid = loc["location_id"]
        pay_q = {"location_id": lid, "period_start": {"$gte": period_start}, "period_end": {"$lte": period_end}}
        pay_recs = await _db.payroll_records.find(pay_q, {"_id": 0, "total_payable": 1}).to_list(500)
        tp = sum(r.get("total_payable", 0) for r in pay_recs)
        exp_q = {"location_id": lid, "is_deleted": False, "date": {"$gte": period_start, "$lte": period_end}}
        exps = await _db.expenses.find(exp_q, {"_id": 0, "amount": 1}).to_list(500)
        te = sum(e.get("amount", 0) for e in exps)
        rev_q = {
            "location_id": lid,
            "status": {"$in": ["paid", "approved", "completed"]},
            "$or": [
                {"paid_at": {"$gte": period_start, "$lt": period_end_next}},
                {"paid_at": None, "created_at": {"$gte": period_start, "$lt": period_end_next}},
                {"paid_at": {"$exists": False}, "created_at": {"$gte": period_start, "$lt": period_end_next}},
            ],
        }
        pays = await _db.payments.find(rev_q, {"_id": 0, "amount": 1}).to_list(5000)
        tr = sum(p.get("amount", 0) for p in pays)
        # Count active staff (using is_active field)
        staff_count = await _db.staff.count_documents({
            "location_id": lid, 
            "is_active": True,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        grand_payroll += tp
        grand_expenses += te
        grand_revenue += tr
        results.append({
            "location_id": lid, "location_name": loc["name"], "city": loc.get("city", ""),
            "total_payroll": tp, "total_expenses": te, "total_revenue": tr,
            "net_result": tr - tp - te, "staff_count": staff_count,
            "currency": loc.get("default_currency", "AED")
        })
    return {
        "period_start": period_start, "period_end": period_end,
        "grand_total_payroll": grand_payroll, "grand_total_expenses": grand_expenses,
        "grand_total_revenue": grand_revenue,
        "locations": results
    }

@router.get("/finance/payroll-by-staff")
async def payroll_by_staff(request: Request, period_start: Optional[str] = None, period_end: Optional[str] = None):
    user = await _require_hr_access(request, "manager.view_finance_location")
    lid = await _get_hr_location(user, request)
    if not period_start:
        period_start = (date.today() - timedelta(days=90)).isoformat()
    if not period_end:
        period_end = date.today().isoformat()
    staff_list = await _db.staff.find({"location_id": lid}, {"_id": 0}).to_list(200)
    result = []
    for s in staff_list:
        recs = await _db.payroll_records.find(
            {"staff_id": s["staff_id"], "location_id": lid,
             "period_start": {"$gte": period_start}, "period_end": {"$lte": period_end}},
            {"_id": 0}
        ).to_list(50)
        total = sum(r.get("total_payable", 0) for r in recs)
        avg = total / len(recs) if recs else 0
        result.append({
            "staff_id": s["staff_id"], "name": f"{s['first_name']} {s['last_name']}",
            "role": s["role"], "status": s["status"],
            "total_payable": total, "periods": len(recs), "avg_per_period": round(avg, 2)
        })
    return result


def _split_name(full_name: str):
    s = (full_name or "").strip()
    if not s:
        return "", ""
    parts = s.split()
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])

def _derive_employee_type(role: str, employment_type: str = "") -> str:
    r = (role or "").upper()
    e = (employment_type or "").upper()
    if e == "EXTERNAL":
        return "EXTERNAL"
    if r in ("OWNER", "OWNER_FULL"):
        return "ADMIN"
    if "INSTRUCTOR" in r:
        return "INSTRUCTOR"
    if "RECEPTIONIST" in r:
        return "RECEPTIONIST"
    if "MANAGER" in r or r in ("ADMIN",):
        return "MANAGER"
    return "STAFF"


async def _ensure_staff_for_user(user: dict, *, request: Request):
    staff_id = user.get("staff_id")
    now = datetime.now(timezone.utc).isoformat()
    if staff_id:
        staff = await _db.staff.find_one({"staff_id": staff_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0})
        if staff:
            if not staff.get("employee_code"):
                code = f"EMP-{staff_id[-4:].upper()}"
                await _db.staff.update_one({"staff_id": staff_id}, {"$set": {"employee_code": code, "updated_at": now}})
                staff["employee_code"] = code
            return staff

    if user.get("role") in ("CUSTOMER", "MEMBER"):
        raise HTTPException(403, "Access denied")

    existing_by_user = await _db.staff.find_one(
        {"user_id": user.get("user_id"), "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0}
    )
    if existing_by_user:
        if not existing_by_user.get("employee_code"):
            code = f"EMP-{existing_by_user['staff_id'][-4:].upper()}"
            await _db.staff.update_one({"staff_id": existing_by_user["staff_id"]}, {"$set": {"employee_code": code, "updated_at": now}})
            existing_by_user["employee_code"] = code
        if not existing_by_user.get("employee_type"):
            et = _derive_employee_type(existing_by_user.get("role") or user.get("role") or "STAFF", existing_by_user.get("employment_type") or "")
            await _db.staff.update_one({"staff_id": existing_by_user["staff_id"]}, {"$set": {"employee_type": et, "updated_at": now}})
            existing_by_user["employee_type"] = et
        await _db.users.update_one({"user_id": user.get("user_id")}, {"$set": {"staff_id": existing_by_user["staff_id"], "updated_at": now}})
        return existing_by_user

    first_name, last_name = _split_name(user.get("name") or "")
    email = (user.get("email") or "").strip().lower()
    lid = user.get("location_id")
    if user.get("role") in ("OWNER", "OWNER_FULL"):
        lid = None

    staff_id = f"staff_{uuid.uuid4().hex[:12]}"
    code = f"EMP-{staff_id[-4:].upper()}"
    doc = {
        "staff_id": staff_id,
        "location_id": lid,
        "user_id": user.get("user_id"),
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "phone": "",
        "role": user.get("role") or "STAFF",
        "employment_type": "FULL_TIME",
        "employee_type": _derive_employee_type(user.get("role") or "STAFF", "FULL_TIME"),
        "employee_code": code,
        "designation": "",
        "department": "",
        "reporting_staff_id": "",
        "join_date": now[:10],
        "start_date": "",
        "timetable": [],
        "weekly_off_day": "",
        "shift_name": "",
        "status": "active",
        "salary": 0,
        "currency": "AED",
        "is_active": True,
        "deleted_at": None,
        "profile_image_path": user.get("picture"),
        "nationality": "",
        "dob": "",
        "gender": "",
        "marital_status": "",
        "address": PostalAddress().model_dump(),
        "emergency_contact": EmergencyContact().model_dump(),
        "passport_visa": PassportVisaSummary().model_dump(),
        "notes": "",
        "pay_structure": PayStructure().model_dump(),
        "is_sales": False,
        "sales_role": None,
        "sales_notes": "",
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff.insert_one(doc)
    await _db.users.update_one({"user_id": user.get("user_id")}, {"$set": {"staff_id": staff_id, "updated_at": now}})
    return doc


@router.get("/staff/{staff_id}/master")
async def get_staff_master_profile(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")

    await _refresh_expiry_states_for_staff(staff_id, staff.get("location_id"))
    docs = await _db.staff_documents.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    agreements = await _db.staff_agreements.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    probation = await _db.staff_probation.find_one({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0})
    requests = await _db.staff_requests.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    visas = await _db.staff_visas.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    assets = await _db.staff_assets.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    exit_cases = await _db.staff_exits.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(50)
    notes = await _db.staff_notes.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    employment_events = await _db.staff_employment_events.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    audit_logs = await _db.staff_audit_logs.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)

    return {
        "staff": staff,
        "documents": docs,
        "agreements": agreements,
        "probation": probation,
        "requests": requests,
        "visas": visas,
        "assets": assets,
        "exit_cases": exit_cases,
        "notes": notes,
        "employment_events": employment_events,
        "audit_logs": audit_logs,
    }


@router.patch("/staff/{staff_id}/employment-setup")
async def update_staff_employment_setup(staff_id: str, data: StaffEmploymentSetupUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    existing = await _get_staff_for_hr(user, request, staff_id)
    if not existing:
        raise HTTPException(404, "Staff not found")

    now = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"updated_at": now}
    for k, v in data.model_dump(exclude_unset=True).items():
        if k in ("salary", "currency") and v is None:
            continue
        updates[k] = v
    if "status" in updates:
        status = (updates.get("status") or "").lower()
        inactive_statuses = {"terminated", "resigned", "cancelled"}
        updates["is_active"] = status not in inactive_statuses
    changed_fields = []
    for k, v in updates.items():
        if k == "updated_at":
            continue
        if existing.get(k) != v:
            changed_fields.append(k)
    await _db.staff.update_one({"staff_id": staff_id}, {"$set": updates})
    if changed_fields:
        lines = []
        for k in changed_fields:
            lines.append(f"{k}: {existing.get(k, '')} -> {updates.get(k, '')}")
        ev_id = f"stfev_{uuid.uuid4().hex[:12]}"
        await _db.staff_employment_events.insert_one({
            "staff_employment_event_id": ev_id,
            "staff_id": staff_id,
            "location_id": existing.get("location_id"),
            "event_type": "employment_setup_update",
            "effective_date": now[:10],
            "title": "Employment setup updated",
            "details": "\n".join(lines),
            "created_by_user_id": user.get("user_id"),
            "created_at": now,
            "updated_at": now,
        })
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": existing.get("location_id"),
        "action": "employment_setup_update",
        "changed_fields": changed_fields,
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    return await _db.staff.find_one({"staff_id": staff_id}, {"_id": 0})


@router.post("/staff/{staff_id}/documents", status_code=201)
async def create_staff_document(staff_id: str, data: StaffDocumentCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    doc_id = f"stfdoc_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_document_id": doc_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        **data.model_dump(),
        "history": [{"action": "created", "comment": "", "actor_user_id": user.get("user_id"), "at": now}],
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff_documents.insert_one(doc)
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "document_created",
        "changed_fields": list(data.model_dump().keys()),
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/documents")
async def list_staff_documents(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    await _refresh_expiry_states_for_staff(staff_id, staff.get("location_id"))
    docs = await _db.staff_documents.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"documents": docs}


@router.patch("/staff/{staff_id}/documents/{staff_document_id}")
async def update_staff_document(staff_id: str, staff_document_id: str, data: StaffDocumentUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    existing = await _db.staff_documents.find_one({"staff_document_id": staff_document_id, "staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Document not found")
    now = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"updated_at": now}
    for k, v in data.model_dump(exclude_unset=True).items():
        updates[k] = v
    entry = {"action": "updated", "comment": "", "actor_user_id": user.get("user_id"), "at": now}
    await _db.staff_documents.update_one({"staff_document_id": staff_document_id}, {"$set": updates, "$push": {"history": entry}})
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "document_updated",
        "changed_fields": list(updates.keys()),
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    return await _db.staff_documents.find_one({"staff_document_id": staff_document_id}, {"_id": 0})


@router.post("/staff/{staff_id}/agreements", status_code=201)
async def create_staff_agreement(staff_id: str, data: StaffAgreementCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    agreement_id = f"stfagr_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_agreement_id": agreement_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        **data.model_dump(),
        "history": [{"action": "created", "comment": "", "actor_user_id": user.get("user_id"), "at": now}],
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff_agreements.insert_one(doc)
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "agreement_created",
        "changed_fields": list(data.model_dump().keys()),
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/agreements")
async def list_staff_agreements(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rows = await _db.staff_agreements.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"agreements": rows}


@router.patch("/staff/{staff_id}/agreements/{staff_agreement_id}")
async def update_staff_agreement(staff_id: str, staff_agreement_id: str, data: StaffAgreementUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    existing = await _db.staff_agreements.find_one({"staff_agreement_id": staff_agreement_id, "staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Agreement not found")
    now = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"updated_at": now}
    for k, v in data.model_dump(exclude_unset=True).items():
        updates[k] = v
    entry = {"action": "updated", "comment": "", "actor_user_id": user.get("user_id"), "at": now}
    await _db.staff_agreements.update_one({"staff_agreement_id": staff_agreement_id}, {"$set": updates, "$push": {"history": entry}})
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "agreement_updated",
        "changed_fields": list(updates.keys()),
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    return await _db.staff_agreements.find_one({"staff_agreement_id": staff_agreement_id}, {"_id": 0})


@router.post("/staff/me/requests", status_code=201)
async def create_my_staff_request(data: StaffRequestCreate, request: Request):
    user = await _require_employee_self_access(request, "employee.create_requests")
    staff = await _ensure_staff_for_user(user, request=request)
    now = datetime.now(timezone.utc).isoformat()
    req_id = f"stfreq_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_request_id": req_id,
        "staff_id": staff["staff_id"],
        "location_id": staff.get("location_id"),
        "request_type": data.request_type,
        "leave_type": data.leave_type,
        "from_date": data.from_date,
        "to_date": data.to_date,
        "reason": data.reason,
        "details": data.details or {},
        "status": "submitted",
        "history": [{"action": "submitted", "comment": "", "actor_user_id": user.get("user_id"), "at": now}],
        "created_by_user_id": user.get("user_id"),
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff_requests.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/staff/me/requests")
async def list_my_staff_requests(request: Request):
    user = await _require_employee_self_access(request, "employee.view_own_profile")
    staff = await _ensure_staff_for_user(user, request=request)
    rows = await _db.staff_requests.find({"staff_id": staff["staff_id"], "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"requests": rows}


@router.get("/staff/requests/inbox")
async def list_staff_requests_inbox(request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    lid = await _get_hr_location(user, request)
    q = {"location_id": lid}
    if user.get("role") in ("OWNER", "OWNER_FULL") and lid is None:
        loc_ids = await _owner_location_ids(user)
        q = {"location_id": {"$in": [*loc_ids, None]}}
    rows = await _db.staff_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"requests": rows}


@router.patch("/staff/requests/{staff_request_id}")
async def act_on_staff_request(staff_request_id: str, data: StaffRequestAction, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    lid = await _get_hr_location(user, request)
    q = {"staff_request_id": staff_request_id, "location_id": lid}
    if user.get("role") in ("OWNER", "OWNER_FULL") and lid is None:
        loc_ids = await _owner_location_ids(user)
        q = {"staff_request_id": staff_request_id, "location_id": {"$in": [*loc_ids, None]}}
    existing = await _db.staff_requests.find_one(q, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Request not found")
    now = datetime.now(timezone.utc).isoformat()
    next_status = existing.get("status")
    if data.action == "approve":
        next_status = "approved"
    elif data.action == "reject":
        next_status = "rejected"
    elif data.action == "send_back":
        next_status = "needs_changes"
    entry = {
        "action": data.action,
        "comment": data.comment,
        "actor_user_id": user.get("user_id"),
        "at": now,
    }
    await _db.staff_requests.update_one(
        {"staff_request_id": staff_request_id},
        {"$set": {"status": next_status, "updated_at": now}, "$push": {"history": entry}},
    )
    return await _db.staff_requests.find_one({"staff_request_id": staff_request_id}, {"_id": 0})


@router.post("/staff/{staff_id}/probation/event", status_code=201)
async def add_staff_probation_event(staff_id: str, data: StaffProbationEvent, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    entry = {**data.model_dump(), "actor_user_id": user.get("user_id"), "at": now}
    existing = await _db.staff_probation.find_one({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0})
    if not existing:
        base = {
            "staff_id": staff_id,
            "location_id": staff.get("location_id"),
            "status": "draft",
            "start_date": "",
            "end_date": "",
            "history": [],
            "created_at": now,
            "updated_at": now,
        }
        await _db.staff_probation.insert_one(base)
        existing = base

    updates: Dict[str, Any] = {"updated_at": now}
    if data.action == "start":
        updates["status"] = "active"
        if data.start_date:
            updates["start_date"] = data.start_date
        if data.end_date:
            updates["end_date"] = data.end_date
        await _db.staff.update_one({"staff_id": staff_id}, {"$set": {"status": "probation", "is_active": True, "updated_at": now}})
    elif data.action == "extend":
        updates["status"] = existing.get("status") or "active"
        if data.end_date:
            updates["end_date"] = data.end_date
    elif data.action == "confirm_permanent":
        updates["status"] = "completed"
        await _db.staff.update_one({"staff_id": staff_id}, {"$set": {"status": "permanent", "is_active": True, "updated_at": now}})
    elif data.action == "cancel":
        updates["status"] = "cancelled"
    await _db.staff_probation.update_one(
        {"staff_id": staff_id, "location_id": staff.get("location_id")},
        {"$set": updates, "$push": {"history": entry}},
    )
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": f"probation_{data.action}",
        "changed_fields": list(updates.keys()),
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    return await _db.staff_probation.find_one({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0})


@router.get("/staff/{staff_id}/probation")
async def get_staff_probation(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    doc = await _db.staff_probation.find_one({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0})
    return {"probation": doc}


@router.post("/staff/{staff_id}/visa", status_code=201)
async def create_staff_visa_record(staff_id: str, data: StaffVisaRecordCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    visa_id = f"stfvisa_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_visa_id": visa_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        **data.model_dump(),
        "history": [{"action": "created", "comment": "", "actor_user_id": user.get("user_id"), "at": now}],
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff_visas.insert_one(doc)
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "visa_add",
        "changed_fields": ["staff_visa_id"],
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/visa")
async def list_staff_visa_records(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    await _refresh_expiry_states_for_staff(staff_id, staff.get("location_id"))
    rows = await _db.staff_visas.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"visas": rows}


@router.patch("/staff/{staff_id}/visa/{staff_visa_id}")
async def update_staff_visa_record(staff_id: str, staff_visa_id: str, data: StaffVisaRecordUpdate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    existing = await _db.staff_visas.find_one({"staff_visa_id": staff_visa_id, "staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Visa record not found")
    now = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"updated_at": now}
    for k, v in data.model_dump(exclude_unset=True).items():
        updates[k] = v
    entry = {"action": "updated", "comment": "", "actor_user_id": user.get("user_id"), "at": now}
    await _db.staff_visas.update_one({"staff_visa_id": staff_visa_id}, {"$set": updates, "$push": {"history": entry}})
    return await _db.staff_visas.find_one({"staff_visa_id": staff_visa_id}, {"_id": 0})


@router.post("/staff/{staff_id}/assets", status_code=201)
async def assign_staff_asset(staff_id: str, data: StaffAssetAssignCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    asset_id = f"stfast_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_asset_id": asset_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        **data.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff_assets.insert_one(doc)
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "asset_assign",
        "changed_fields": ["staff_asset_id"],
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/assets")
async def list_staff_assets(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rows = await _db.staff_assets.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"assets": rows}


@router.post("/staff/{staff_id}/exit", status_code=201)
async def create_staff_exit_case(staff_id: str, data: StaffExitCaseCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    case_id = f"stfexit_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_exit_id": case_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        **data.model_dump(),
        "handover_checklist": [],
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff_exits.insert_one(doc)
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "exit_case_create",
        "changed_fields": ["staff_exit_id"],
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/exit")
async def list_staff_exit_cases(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rows = await _db.staff_exits.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"exit_cases": rows}


@router.post("/staff/{staff_id}/notes", status_code=201)
async def add_staff_note(staff_id: str, data: StaffNoteCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    note_id = f"stfnote_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_note_id": note_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "note": data.note,
        "is_confidential": bool(data.is_confidential),
        "created_by_user_id": user.get("user_id"),
        "created_at": now,
    }
    await _db.staff_notes.insert_one(doc)
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "note_add",
        "changed_fields": ["staff_note_id"],
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/notes")
async def list_staff_notes(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    can_manage = False
    if user.get("role") in ("OWNER", "OWNER_FULL"):
        can_manage = True
    else:
        from rbac import check_permission as rbac_check_permission
        can_manage = await rbac_check_permission(user, "manager.manage_staff")
    q = {"staff_id": staff_id, "location_id": staff.get("location_id")}
    if not can_manage:
        q["is_confidential"] = {"$ne": True}
    rows = await _db.staff_notes.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"notes": rows}


@router.post("/staff/{staff_id}/employment-event", status_code=201)
async def add_staff_employment_event(staff_id: str, data: StaffEmploymentEventCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    event_id = f"stfevt_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_employment_event_id": event_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        **data.model_dump(),
        "created_by_user_id": user.get("user_id"),
        "created_at": now,
    }
    await _db.staff_employment_events.insert_one(doc)
    await _db.staff_audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        "action": "employment_event_add",
        "changed_fields": ["staff_employment_event_id"],
        "actor_user_id": user.get("user_id"),
        "created_at": now,
    })
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/employment-events")
async def list_staff_employment_events(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rows = await _db.staff_employment_events.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"events": rows}


async def _refresh_expiry_states_for_staff(staff_id: str, location_id: Optional[str]):
    now_iso = datetime.now(timezone.utc).isoformat()

    docs = await _db.staff_documents.find({"staff_id": staff_id, "location_id": location_id}, {"_id": 0, "staff_document_id": 1, "expiry_date": 1, "notify_days_before_expiry": 1, "status": 1}).to_list(500)
    for d in docs:
        exp = _parse_date(d.get("expiry_date") or "")
        days = _days_until(exp)
        if days is None:
            continue
        next_status = d.get("status") or "submitted"
        if days < 0:
            next_status = "expired"
        else:
            notify_days = int(d.get("notify_days_before_expiry") or 15)
            if days <= notify_days:
                next_status = "expiring_soon"
        if next_status != d.get("status"):
            await _db.staff_documents.update_one({"staff_document_id": d.get("staff_document_id")}, {"$set": {"status": next_status, "updated_at": now_iso}})

    visas = await _db.staff_visas.find({"staff_id": staff_id, "location_id": location_id}, {"_id": 0, "staff_visa_id": 1, "expiry_date": 1, "notify_days_before_expiry": 1, "expiry_state": 1}).to_list(200)
    for v in visas:
        exp = _parse_date(v.get("expiry_date") or "")
        days = _days_until(exp)
        if days is None:
            continue
        next_state = v.get("expiry_state") or ""
        if days < 0:
            next_state = "expired"
        else:
            notify_days = int(v.get("notify_days_before_expiry") or 30)
            if days <= notify_days:
                next_state = "expiring_soon"
            else:
                next_state = ""
        if next_state != (v.get("expiry_state") or ""):
            await _db.staff_visas.update_one({"staff_visa_id": v.get("staff_visa_id")}, {"$set": {"expiry_state": next_state, "updated_at": now_iso}})

    agreements = await _db.staff_agreements.find({"staff_id": staff_id, "location_id": location_id}, {"_id": 0, "staff_agreement_id": 1, "end_date": 1, "notify_days_before_expiry": 1, "expiry_state": 1, "status": 1}).to_list(200)
    for a in agreements:
        exp = _parse_date(a.get("end_date") or "")
        days = _days_until(exp)
        if days is None:
            continue
        next_state = a.get("expiry_state") or ""
        next_status = a.get("status") or "pending"
        if days < 0:
            next_state = "expired"
            if next_status in ("pending", "active"):
                next_status = "expired"
        else:
            notify_days = int(a.get("notify_days_before_expiry") or 15)
            if days <= notify_days:
                next_state = "expiring_soon"
            else:
                next_state = ""
        sets: Dict[str, Any] = {}
        if next_state != (a.get("expiry_state") or ""):
            sets["expiry_state"] = next_state
        if next_status != (a.get("status") or "pending"):
            sets["status"] = next_status
        if sets:
            sets["updated_at"] = now_iso
            await _db.staff_agreements.update_one({"staff_agreement_id": a.get("staff_agreement_id")}, {"$set": sets})


@router.get("/staff/me/attendance")
async def list_my_attendance(request: Request, from_date: Optional[str] = None, to_date: Optional[str] = None):
    user = await _require_employee_self_access(request, "employee.view_own_profile")
    staff = await _ensure_staff_for_user(user, request=request)
    q: Dict[str, Any] = {"staff_id": staff["staff_id"], "location_id": staff.get("location_id")}
    if from_date or to_date:
        rng: Dict[str, Any] = {}
        if from_date:
            rng["$gte"] = from_date[:10]
        if to_date:
            rng["$lte"] = to_date[:10]
        q["date"] = rng
    rows = await _db.staff_attendance_records.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    summary: Dict[str, int] = {"present": 0, "late": 0, "absent": 0, "off": 0, "overtime": 0}
    for r in rows:
        k = r.get("status")
        if k in summary:
            summary[k] += 1
    return {"attendance": rows, "summary": summary, "timetable": staff.get("timetable") or [], "shift_name": staff.get("shift_name") or "", "weekly_off_day": staff.get("weekly_off_day") or ""}


@router.get("/staff/{staff_id}/attendance")
async def list_staff_attendance(staff_id: str, request: Request, from_date: Optional[str] = None, to_date: Optional[str] = None):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    q: Dict[str, Any] = {"staff_id": staff_id, "location_id": staff.get("location_id")}
    if from_date or to_date:
        rng: Dict[str, Any] = {}
        if from_date:
            rng["$gte"] = from_date[:10]
        if to_date:
            rng["$lte"] = to_date[:10]
        q["date"] = rng
    rows = await _db.staff_attendance_records.find(q, {"_id": 0}).sort("date", -1).to_list(500)
    return {"attendance": rows}


@router.post("/staff/{staff_id}/attendance", status_code=201)
async def create_staff_attendance(staff_id: str, data: StaffAttendanceCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    att_id = f"stfatt_{uuid.uuid4().hex[:12]}"
    doc = {
        "staff_attendance_id": att_id,
        "staff_id": staff_id,
        "location_id": staff.get("location_id"),
        **data.model_dump(),
        "created_by_user_id": user.get("user_id"),
        "created_at": now,
        "updated_at": now,
    }
    await _db.staff_attendance_records.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/staff/me/performance")
async def get_my_performance_dashboard(request: Request):
    user = await _require_employee_self_access(request, "employee.view_own_performance")
    staff = await _ensure_staff_for_user(user, request=request)
    staff_id = staff["staff_id"]
    location_id = staff.get("location_id")
    reports = await _db.staff_performance_reports.find({"staff_id": staff_id, "location_id": location_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    warnings = await _db.staff_warnings.find({"staff_id": staff_id, "location_id": location_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    awards = await _db.staff_awards.find({"staff_id": staff_id, "location_id": location_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    notes = await _db.staff_notes.find({"staff_id": staff_id, "location_id": location_id, "is_confidential": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    attendance_rows = await _db.staff_attendance_records.find({"staff_id": staff_id, "location_id": location_id}, {"_id": 0, "status": 1}).to_list(1000)
    att_summary: Dict[str, int] = {"present": 0, "late": 0, "absent": 0, "off": 0, "overtime": 0}
    for r in attendance_rows:
        k = r.get("status")
        if k in att_summary:
            att_summary[k] += 1
    return {"reports": reports, "warnings": warnings, "awards": awards, "notes": notes, "attendance_summary": att_summary}


@router.post("/staff/{staff_id}/performance/reports", status_code=201)
async def add_staff_performance_report(staff_id: str, data: StaffPerformanceReportCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    report_id = f"stfrep_{uuid.uuid4().hex[:12]}"
    doc = {"staff_performance_report_id": report_id, "staff_id": staff_id, "location_id": staff.get("location_id"), **data.model_dump(), "created_by_user_id": user.get("user_id"), "created_at": now}
    await _db.staff_performance_reports.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/performance/reports")
async def list_staff_performance_reports(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rows = await _db.staff_performance_reports.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"reports": rows}


@router.post("/staff/{staff_id}/performance/warnings", status_code=201)
async def add_staff_warning(staff_id: str, data: StaffWarningCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    warn_id = f"stfwarn_{uuid.uuid4().hex[:12]}"
    doc = {"staff_warning_id": warn_id, "staff_id": staff_id, "location_id": staff.get("location_id"), **data.model_dump(), "created_by_user_id": user.get("user_id"), "created_at": now}
    await _db.staff_warnings.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/performance/warnings")
async def list_staff_warnings(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rows = await _db.staff_warnings.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"warnings": rows}


@router.post("/staff/{staff_id}/performance/awards", status_code=201)
async def add_staff_award(staff_id: str, data: StaffAwardCreate, request: Request):
    user = await _require_hr_access(request, "manager.manage_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    now = datetime.now(timezone.utc).isoformat()
    award_id = f"stfawd_{uuid.uuid4().hex[:12]}"
    doc = {"staff_award_id": award_id, "staff_id": staff_id, "location_id": staff.get("location_id"), **data.model_dump(), "created_by_user_id": user.get("user_id"), "created_at": now}
    await _db.staff_awards.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/staff/{staff_id}/performance/awards")
async def list_staff_awards(staff_id: str, request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    staff = await _get_staff_for_hr(user, request, staff_id)
    if not staff:
        raise HTTPException(404, "Staff not found")
    rows = await _db.staff_awards.find({"staff_id": staff_id, "location_id": staff.get("location_id")}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"awards": rows}


@router.get("/staff/me/notifications")
async def get_my_staff_notifications(request: Request):
    user = await _require_employee_self_access(request, "employee.view_own_profile")
    staff = await _ensure_staff_for_user(user, request=request)
    staff_id = staff["staff_id"]
    location_id = staff.get("location_id")
    await _refresh_expiry_states_for_staff(staff_id, location_id)
    docs = await _db.staff_documents.find({"staff_id": staff_id, "location_id": location_id, "status": {"$in": ["expiring_soon", "expired"]}}, {"_id": 0}).sort("expiry_date", 1).to_list(200)
    visas = await _db.staff_visas.find({"staff_id": staff_id, "location_id": location_id, "expiry_state": {"$in": ["expiring_soon", "expired"]}}, {"_id": 0}).sort("expiry_date", 1).to_list(200)
    agreements = await _db.staff_agreements.find({"staff_id": staff_id, "location_id": location_id, "expiry_state": {"$in": ["expiring_soon", "expired"]}}, {"_id": 0}).sort("end_date", 1).to_list(200)

    probation = await _db.staff_probation.find_one({"staff_id": staff_id, "location_id": location_id}, {"_id": 0, "status": 1, "end_date": 1, "start_date": 1})
    probation_alert = None
    if probation and probation.get("status") in ("active", "draft") and probation.get("end_date"):
        end_dt = _parse_date(probation.get("end_date") or "")
        days = _days_until(end_dt)
        if days is not None and days <= 7:
            probation_alert = {"status": probation.get("status") or "", "start_date": probation.get("start_date") or "", "end_date": probation.get("end_date") or "", "days_left": days}

    return {"documents": docs, "visas": visas, "agreements": agreements, "probation": probation_alert}


@router.get("/staff/notifications/inbox")
async def get_staff_notifications_inbox(request: Request):
    user = await _require_hr_access(request, "manager.view_staff")
    lid = await _get_hr_location(user, request)
    loc_ids: List[Optional[str]] = [lid]
    if user.get("role") in ("OWNER", "OWNER_FULL") and lid is None:
        loc_ids = [*await _owner_location_ids(user), None]
    docs = await _db.staff_documents.find({"location_id": {"$in": loc_ids}, "status": "expiring_soon"}, {"_id": 0}).sort("expiry_date", 1).to_list(500)
    visas = await _db.staff_visas.find({"location_id": {"$in": loc_ids}, "expiry_state": "expiring_soon"}, {"_id": 0}).sort("expiry_date", 1).to_list(500)
    now_iso = datetime.now(timezone.utc).isoformat()

    agreements_raw = await _db.staff_agreements.find({"location_id": {"$in": loc_ids}, "end_date": {"$ne": ""}}, {"_id": 0}).sort("end_date", 1).to_list(500)
    agreements = []
    for a in agreements_raw:
        exp = _parse_date(a.get("end_date") or "")
        days = _days_until(exp)
        if days is None:
            continue
        notify_days = int(a.get("notify_days_before_expiry") or 15)
        next_state = "expired" if days < 0 else ("expiring_soon" if days <= notify_days else "")
        if next_state != (a.get("expiry_state") or ""):
            await _db.staff_agreements.update_one({"staff_agreement_id": a.get("staff_agreement_id")}, {"$set": {"expiry_state": next_state, "updated_at": now_iso}})
            a["expiry_state"] = next_state
        if a.get("expiry_state") == "expiring_soon":
            a["days_left"] = days
            agreements.append(a)

    probation_raw = await _db.staff_probation.find({"location_id": {"$in": loc_ids}, "end_date": {"$ne": ""}, "status": {"$in": ["active", "draft"]}}, {"_id": 0}).to_list(500)
    probation_endings = []
    staff_ids = []
    for p in probation_raw:
        end_dt = _parse_date(p.get("end_date") or "")
        days = _days_until(end_dt)
        if days is None:
            continue
        if days <= 7:
            p["days_left"] = days
            probation_endings.append(p)
            staff_ids.append(p.get("staff_id"))
    staff_map = {}
    if staff_ids:
        staff_rows = await _db.staff.find({"staff_id": {"$in": staff_ids}}, {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1, "employee_code": 1, "role": 1, "location_id": 1}).to_list(500)
        for s in staff_rows:
            staff_map[s["staff_id"]] = s
    for p in probation_endings:
        s = staff_map.get(p.get("staff_id"))
        if s:
            p["staff"] = s

    return {"documents": docs, "visas": visas, "agreements": agreements, "probation_endings": probation_endings}


# ─── Owner HR Overview ────────────────────────────────────────────

@router.get("/hr/owner-overview")
async def owner_hr_overview(request: Request):
    user = await _get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.view_hr_all")
    elif user.get("role") != "OWNER":
        raise HTTPException(403, "Owner access only")
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    if not owner_id:
        raise HTTPException(403, "Owner access only")
    locations = await _db.locations.find({"owner_id": owner_id, "is_deleted": False}, {"_id": 0}).to_list(50)
    month_start = date.today().replace(day=1).isoformat()
    results = []
    total_staff = 0
    total_instructors = 0
    for loc in locations:
        lid = loc["location_id"]
        # Count active staff (using is_active field and excluding deleted)
        base_query = {"location_id": lid, "is_active": True, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
        sc = await _db.staff.count_documents(base_query)
        ic = await _db.staff.count_documents({**base_query, "role": "INSTRUCTOR"})
        new_this_month = await _db.staff.count_documents({"location_id": lid, "created_at": {"$gte": month_start}})
        last_payroll = await _db.payroll_records.find_one({"location_id": lid}, {"_id": 0, "period_end": 1, "status": 1},
                                                           sort=[("period_end", -1)])
        total_staff += sc
        total_instructors += ic
        results.append({
            "location_id": lid, "location_name": loc["name"], "city": loc.get("city", ""),
            "staff_count": sc, "active_instructors": ic, "new_this_month": new_this_month,
            "last_payroll_period": last_payroll.get("period_end", "—") if last_payroll else "—",
            "last_payroll_status": last_payroll.get("status", "—") if last_payroll else "—"
        })
    return {"total_staff": total_staff, "total_instructors": total_instructors, "locations": results}


@router.get("/hr/owners")
async def owner_hr_owners(request: Request, is_active: Optional[bool] = None, include_deleted: bool = False):
    user = await _get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.view_hr_all")
    elif user.get("role") != "OWNER":
        raise HTTPException(403, "Owner access only")
    owner_id = _effective_owner_id(user)
    if not owner_id:
        raise HTTPException(403, "Owner access only")
    query = {
        "$or": [
            {"user_id": owner_id},
            {"owner_id": owner_id, "role": {"$in": ["OWNER_FULL", "LOCATION_MANAGER", "RECEPTIONIST"]}},
        ]
    }
    if include_deleted:
        query["deleted_at"] = {"$ne": None}
    else:
        query["$and"] = [{"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}]
        if is_active is not None:
            query["is_active"] = is_active

    owners = await _db.users.find(
        query,
        {"_id": 0, "user_id": 1, "email": 1, "name": 1, "role": 1, "is_active": 1, "deleted_at": 1, "picture": 1, "admin_role_ids": 1, "staff_id": 1, "location_id": 1, "manager_location_ids": 1, "employee_location_id": 1, "created_at": 1}
    ).to_list(200)
    all_role_ids = set()
    for o in owners:
        if o.get("admin_role_ids"):
            all_role_ids.update(o["admin_role_ids"])
    roles_map = {}
    if all_role_ids:
        roles = await _db.roles.find(
            {"role_id": {"$in": list(all_role_ids)}, "is_active": True},
            {"_id": 0, "role_id": 1, "name": 1, "code": 1},
        ).to_list(200)
        roles_map = {r["role_id"]: {"role_id": r["role_id"], "name": r.get("name"), "code": r.get("code")} for r in roles}
    for o in owners:
        rids = o.get("admin_role_ids") or []
        o["admin_roles"] = [roles_map[rid] for rid in rids if rid in roles_map]

    owner_loc_ids = await _owner_location_ids(user)
    first_owner_loc = owner_loc_ids[0] if owner_loc_ids else None
    locs = await _db.locations.find({"location_id": {"$in": owner_loc_ids}}, {"_id": 0, "location_id": 1, "default_currency": 1}).to_list(200) if owner_loc_ids else []
    loc_currency = {l["location_id"]: l.get("default_currency", "AED") for l in locs}
    now = datetime.now(timezone.utc).isoformat()

    for o in owners:
        o_role = o.get("role")
        if o.get("deleted_at"):
            o["employee"] = None
            continue
        target_lid = None
        if o_role in ("LOCATION_MANAGER", "RECEPTIONIST"):
            target_lid = o.get("location_id") or (o.get("manager_location_ids") or [None])[0]
        else:
            target_lid = None

        staff_doc = await _db.staff.find_one({"user_id": o["user_id"]}, {"_id": 0})
        if not staff_doc and o.get("staff_id"):
            staff_doc = await _db.staff.find_one({"staff_id": o["staff_id"]}, {"_id": 0})

        if staff_doc and o_role in ("OWNER", "OWNER_FULL") and staff_doc.get("location_id") is not None:
            await _db.staff.update_one({"staff_id": staff_doc["staff_id"]}, {"$set": {"location_id": None, "updated_at": now}})
            await _db.users.update_one(
                {"user_id": o["user_id"]},
                {"$set": {"employee_location_id": None, "updated_at": now}},
            )
            staff_doc["location_id"] = None
            o["employee_location_id"] = None

        if not staff_doc and (target_lid or o_role in ("OWNER", "OWNER_FULL")):
            staff_id = o.get("staff_id") or f"staff_{uuid.uuid4().hex[:12]}"
            currency = loc_currency.get(target_lid, "AED")
            join_date = (o.get("created_at") or now)[:10]
            staff_doc = {
                "staff_id": staff_id,
                "location_id": target_lid,
                "user_id": o["user_id"],
                "first_name": "",
                "last_name": "",
                "email": (o.get("email") or "").strip().lower(),
                "phone": "",
                "role": o_role,
                "employment_type": "FULL_TIME",
                "join_date": join_date,
                "is_active": o.get("is_active", True),
                "deleted_at": None,
                "profile_image_path": None,
                "notes": "",
                "pay_structure": {"type": "FIXED_SALARY", "base_amount": 0, "currency": currency},
                "is_sales": False,
                "sales_role": None,
                "sales_notes": "",
                "created_at": now,
                "updated_at": now,
            }
            await _db.staff.insert_one(staff_doc)
            await _db.users.update_one(
                {"user_id": o["user_id"]},
                {"$set": {"staff_id": staff_id, "employee_location_id": target_lid if o_role in ("OWNER", "OWNER_FULL") else o.get("employee_location_id"), "updated_at": now}},
            )
            o["staff_id"] = staff_id
            if o_role in ("OWNER", "OWNER_FULL"):
                o["employee_location_id"] = target_lid

        if staff_doc:
            o["employee"] = {
                "staff_id": staff_doc.get("staff_id"),
                "location_id": staff_doc.get("location_id"),
                "employment_type": staff_doc.get("employment_type"),
                "join_date": staff_doc.get("join_date"),
                "pay_structure": staff_doc.get("pay_structure"),
                "is_active": staff_doc.get("is_active"),
                "deleted_at": staff_doc.get("deleted_at"),
                "role": staff_doc.get("role"),
            }
        else:
            o["employee"] = None

    return {"owners": owners}


# ─── Seed HR Data ─────────────────────────────────────────────────

@router.post("/seed-hr")
async def seed_hr():
    existing = await _db.staff.find_one({})
    if existing:
        return {"message": "HR data already seeded"}
    owner = await _db.users.find_one({"email": "owner@spartans.com"}, {"_id": 0})
    if not owner:
        raise HTTPException(400, "Run /api/seed first")
    locations = await _db.locations.find({"owner_id": owner["user_id"], "is_deleted": False}, {"_id": 0}).to_list(10)
    now = datetime.now(timezone.utc).isoformat()
    today = date.today()

    staff_templates = [
        [("Mahmoud", "Al Farsi", "INSTRUCTOR", "FULL_TIME", 5000), ("Lina", "Hassan", "INSTRUCTOR", "FULL_TIME", 4500),
         ("Yara", "Khalid", "RECEPTIONIST", "FULL_TIME", 3000), ("Ali", "Nasser", "MANAGER_ASSISTANT", "PART_TIME", 2000)],
        [("Rania", "Bakr", "INSTRUCTOR", "FULL_TIME", 5000), ("Yousef", "Amin", "INSTRUCTOR", "FULL_TIME", 4800),
         ("Nadia", "Saeed", "RECEPTIONIST", "FULL_TIME", 3200), ("Hisham", "Qureshi", "ADMIN", "FULL_TIME", 3500)],
        [("Tariq", "Mansour", "INSTRUCTOR", "FULL_TIME", 4500), ("Salma", "Farouk", "INSTRUCTOR", "PART_TIME", 3000),
         ("Bilal", "Mahmoud", "RECEPTIONIST", "FULL_TIME", 2800)],
        [("Zara", "Sheikh", "INSTRUCTOR", "FULL_TIME", 5500), ("Imran", "Ali", "INSTRUCTOR", "FULL_TIME", 5000),
         ("Huda", "Bakri", "RECEPTIONIST", "FULL_TIME", 3000), ("Omar", "Zaidi", "ADMIN", "FULL_TIME", 4000)],
    ]

    expense_categories = ["RENT", "UTILITIES", "MARKETING", "EQUIPMENT", "MAINTENANCE", "MISC"]

    totals = {"staff": 0, "payroll": 0, "expenses": 0}

    for loc_idx, loc in enumerate(locations):
        lid = loc["location_id"]
        templates = staff_templates[loc_idx % len(staff_templates)]
        staff_ids = []

        for fn, ln, role, emp_type, salary in templates:
            staff_id = f"staff_{uuid.uuid4().hex[:12]}"
            join = (today - timedelta(days=random.randint(60, 400))).isoformat()
            doc = {
                "staff_id": staff_id, "location_id": lid,
                "first_name": fn, "last_name": ln,
                "email": f"{fn.lower()}.{ln.lower()}@spartans.ae", "phone": f"+971-50-{random.randint(100,999)}-{random.randint(1000,9999)}",
                "role": role, "employment_type": emp_type, "join_date": join,
                "is_active": True, "deleted_at": None,
                "profile_image_path": None, "notes": "",
                "pay_structure": {"type": "FIXED_SALARY", "base_amount": salary, "currency": "AED"},
                "created_at": now, "updated_at": now
            }
            await _db.staff.insert_one(doc)
            staff_ids.append((staff_id, fn, ln, salary))
            totals["staff"] += 1

        # Payroll for last 3 months
        for months_back in range(3):
            m = today.month - months_back
            y = today.year
            if m <= 0:
                m += 12
                y -= 1
            ps = date(y, m, 1).isoformat()
            import calendar
            last_day = calendar.monthrange(y, m)[1]
            pe = date(y, m, last_day).isoformat()
            statuses = ["PAID", "PAID", "DRAFT"]
            for sid, fn, ln, salary in staff_ids:
                payroll_id = f"pay_{uuid.uuid4().hex[:12]}"
                bonus = random.choice([0, 0, 0, 200, 500])
                deduction = random.choice([0, 0, 100])
                total = salary + bonus - deduction
                doc = {
                    "payroll_id": payroll_id, "location_id": lid, "staff_id": sid,
                    "period_start": ps, "period_end": pe,
                    "pay_structure_snapshot": {"type": "FIXED_SALARY", "base_amount": salary, "currency": "AED"},
                    "base_pay": salary, "variable_pay": 0, "bonuses": bonus, "deductions": deduction,
                    "total_payable": total, "currency": "AED",
                    "status": statuses[months_back], "payment_date": pe if statuses[months_back] == "PAID" else None,
                    "notes": "", "staff_name": f"{fn} {ln}",
                    "created_at": now, "updated_at": now
                }
                await _db.payroll_records.insert_one(doc)
                totals["payroll"] += 1

        # Expenses for last 3 months
        for months_back in range(3):
            m = today.month - months_back
            y = today.year
            if m <= 0:
                m += 12
                y -= 1
            for _ in range(random.randint(4, 8)):
                day = random.randint(1, 28)
                d = date(y, m, day).isoformat()
                cat = random.choice(expense_categories)
                amounts = {"RENT": random.randint(8000, 15000), "UTILITIES": random.randint(500, 2000),
                           "MARKETING": random.randint(1000, 5000), "EQUIPMENT": random.randint(500, 8000),
                           "MAINTENANCE": random.randint(200, 3000), "MISC": random.randint(100, 1000)}
                expense_id = f"exp_{uuid.uuid4().hex[:12]}"
                doc = {
                    "expense_id": expense_id, "location_id": lid, "date": d,
                    "category": cat, "amount": amounts[cat], "currency": "AED",
                    "description": f"{cat.title()} expense", "added_by_user_id": owner["user_id"],
                    "notes": "", "is_deleted": False,
                    "created_at": now, "updated_at": now
                }
                await _db.expenses.insert_one(doc)
                totals["expenses"] += 1

    return {"message": "HR data seeded", **totals}



# ─── Migration: Update existing data to new schema ────────────────

@router.post("/migrate-staff-schema")
async def migrate_staff_schema():
    """
    Migration endpoint to update existing staff records from status field to is_active/deleted_at.
    Run once to migrate existing data.
    """
    # Update all staff with status=ACTIVE to is_active=true
    result_active = await _db.staff.update_many(
        {"status": "ACTIVE", "is_active": {"$exists": False}},
        {"$set": {"is_active": True, "deleted_at": None}}
    )
    
    # Update all staff with status=INACTIVE to is_active=false
    result_inactive = await _db.staff.update_many(
        {"status": "INACTIVE", "is_active": {"$exists": False}},
        {"$set": {"is_active": False, "deleted_at": None}}
    )
    
    # Update any staff without status or is_active to is_active=true
    result_default = await _db.staff.update_many(
        {"is_active": {"$exists": False}},
        {"$set": {"is_active": True, "deleted_at": None}}
    )
    
    return {
        "message": "Migration complete",
        "active_migrated": result_active.modified_count,
        "inactive_migrated": result_inactive.modified_count,
        "default_migrated": result_default.modified_count
    }
