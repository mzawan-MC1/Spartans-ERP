"""
User Management Module - Owner Control Panel
Provides CRUD operations for managing users (Owners, Managers, Customers)
SECURITY: Only OWNER role can access these endpoints to create admin-level users.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import logging
import bcrypt as bcrypt_lib

class CustomPwdContext:
    def hash(self, password: str) -> str:
        salt = bcrypt_lib.gensalt()
        return bcrypt_lib.hashpw(password.encode('utf-8'), salt).decode('utf-8')
        
    def verify(self, plain_password: str, hashed_password: str) -> bool:
        try:
            return bcrypt_lib.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except (ValueError, TypeError):
            return False

router = APIRouter(prefix="/admin/users", tags=["User Management"])

# Security logger for audit trail
security_logger = logging.getLogger("security_audit")
logger = logging.getLogger(__name__)

# Will be initialized from server.py
db = None
get_current_user = None
pwd_context = CustomPwdContext()

def init(database, auth_func):
    global db, get_current_user
    db = database
    get_current_user = auth_func


# ─── Pydantic Models ───────────────────────────────────────────────

class EmployeePayStructure(BaseModel):
    type: str = "FIXED_SALARY"
    base_amount: float = 0
    currency: str = "AED"


class EmployeeProfile(BaseModel):
    employee_location_id: Optional[str] = None
    employment_type: str = "FULL_TIME"
    join_date: str = ""
    phone: str = ""
    pay_structure: EmployeePayStructure = EmployeePayStructure()


class UserCreateRequest(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: str
    password: str = Field(..., min_length=6)
    role: str = Field(..., pattern="^(OWNER|LOCATION_MANAGER|RECEPTIONIST)$")
    manager_location_ids: Optional[List[str]] = None
    admin_role_ids: Optional[List[str]] = None  # NEW: Admin role IDs for RBAC
    employee: Optional[EmployeeProfile] = None


class UserUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = None
    manager_location_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None
    admin_role_ids: Optional[List[str]] = None  # NEW: Admin role IDs for RBAC
    employee: Optional[EmployeeProfile] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6)


class UserResponse(BaseModel):
    user_id: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    name: str  # Computed from first_name + last_name or existing name
    role: str
    is_active: bool
    deleted_at: Optional[str] = None  # NEW: Soft delete timestamp
    location_id: Optional[str] = None
    manager_location_ids: Optional[List[str]] = None
    owner_id: Optional[str] = None
    picture: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    staff_id: Optional[str] = None
    employee_location_id: Optional[str] = None


# ─── Helper Functions ──────────────────────────────────────────────

def format_user_response(user: dict) -> dict:
    """Format user document for API response"""
    # Handle name - either use first_name/last_name or fall back to name
    first_name = user.get("first_name", "")
    last_name = user.get("last_name", "")
    if first_name or last_name:
        name = f"{first_name} {last_name}".strip()
    else:
        name = user.get("name", "")
    
    return {
        "user_id": user.get("user_id"),
        "email": user.get("email"),
        "first_name": first_name,
        "last_name": last_name,
        "name": name,
        "role": user.get("role"),
        "is_active": user.get("is_active", True),
        "deleted_at": user.get("deleted_at"),  # NEW: Include deleted_at
        "location_id": user.get("location_id"),
        "manager_location_ids": user.get("manager_location_ids", []),
        "admin_role_ids": user.get("admin_role_ids", []),  # NEW: Include admin role IDs
        "owner_id": user.get("owner_id"),
        "picture": user.get("picture"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
        "staff_id": user.get("staff_id"),
        "employee_location_id": user.get("employee_location_id"),
    }


async def _ensure_employee_staff(user_doc: dict, owner_id: str, employee: Optional[EmployeeProfile]) -> Optional[dict]:
    role = user_doc.get("role")
    if role not in ("OWNER", "OWNER_FULL", "LOCATION_MANAGER", "RECEPTIONIST"):
        return None

    now = datetime.now(timezone.utc).isoformat()
    location_id = None
    is_admin = role in ("OWNER", "OWNER_FULL")

    if role in ("LOCATION_MANAGER", "RECEPTIONIST"):
        location_id = user_doc.get("location_id") or (user_doc.get("manager_location_ids") or [None])[0]
    elif is_admin:
        location_id = None
    else:
        if employee and employee.employee_location_id:
            location_id = employee.employee_location_id
        if not location_id:
            first_loc = await db.locations.find_one({"owner_id": owner_id, "is_deleted": False}, {"_id": 0, "location_id": 1, "default_currency": 1})
            location_id = first_loc.get("location_id") if first_loc else None

    if role in ("LOCATION_MANAGER", "RECEPTIONIST"):
        if not location_id:
            return None
        loc = await db.locations.find_one({"location_id": location_id, "owner_id": owner_id, "is_deleted": False}, {"_id": 0, "default_currency": 1})
        if not loc:
            return None
        default_currency = loc.get("default_currency", "AED")
    else:
        default_currency = "AED"

    email_normalized = (user_doc.get("email") or "").strip().lower()

    existing = await db.staff.find_one({"user_id": user_doc["user_id"]}, {"_id": 0})
    if not existing and user_doc.get("staff_id"):
        existing = await db.staff.find_one({"staff_id": user_doc["staff_id"]}, {"_id": 0})
    if not existing and email_normalized:
        if is_admin:
            existing = await db.staff.find_one({"email": email_normalized}, {"_id": 0})
        else:
            existing = await db.staff.find_one({"email": email_normalized, "location_id": location_id}, {"_id": 0})

    pay_structure = {"type": "FIXED_SALARY", "base_amount": 0, "currency": default_currency}
    employment_type = "FULL_TIME"
    join_date = (user_doc.get("created_at") or "")[:10]
    phone = ""

    if employee:
        pay_structure = {
            "type": employee.pay_structure.type or "FIXED_SALARY",
            "base_amount": float(employee.pay_structure.base_amount or 0),
            "currency": employee.pay_structure.currency or default_currency,
        }
        employment_type = employee.employment_type or "FULL_TIME"
        join_date = employee.join_date or join_date
        phone = employee.phone or ""

    if existing:
        updates = {
            "user_id": user_doc["user_id"],
            "first_name": user_doc.get("first_name", ""),
            "last_name": user_doc.get("last_name", ""),
            "email": email_normalized,
            "role": role,
            "is_active": user_doc.get("is_active", True),
            "updated_at": now,
        }
        if phone:
            updates["phone"] = phone
        if employee:
            updates["pay_structure"] = pay_structure
            updates["employment_type"] = employment_type
            updates["join_date"] = join_date
        if existing.get("location_id") != location_id:
            updates["location_id"] = location_id

        await db.staff.update_one({"staff_id": existing["staff_id"]}, {"$set": updates})
        staff_doc = await db.staff.find_one({"staff_id": existing["staff_id"]}, {"_id": 0})
        staff_id = existing["staff_id"]
    else:
        staff_id = f"staff_{uuid.uuid4().hex[:12]}"
        staff_doc = {
            "staff_id": staff_id,
            "location_id": location_id,
            "user_id": user_doc["user_id"],
            "first_name": user_doc.get("first_name", ""),
            "last_name": user_doc.get("last_name", ""),
            "email": email_normalized,
            "phone": phone,
            "role": role,
            "employment_type": employment_type,
            "join_date": join_date or now[:10],
            "is_active": user_doc.get("is_active", True),
            "deleted_at": None,
            "profile_image_path": None,
            "notes": "",
            "pay_structure": pay_structure,
            "is_sales": False,
            "sales_role": None,
            "sales_notes": "",
            "created_at": now,
            "updated_at": now,
        }
        await db.staff.insert_one(staff_doc)

    user_updates = {"staff_id": staff_id, "updated_at": now}
    if is_admin:
        user_updates["employee_location_id"] = None
    await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": user_updates})
    staff_doc["staff_id"] = staff_id
    staff_doc["location_id"] = location_id
    return staff_doc


async def require_owner(request: Request, permission: Optional[str] = None) -> dict:
    """
    Require OWNER role for access.
    SECURITY: Logs unauthorized access attempts for audit trail.
    """
    user = await get_current_user(request)
    if user["role"] not in ("OWNER", "OWNER_FULL"):
        client_ip = request.client.host if request.client else "unknown"
        security_logger.warning(
            f"SECURITY_ALERT: Unauthorized admin access attempt | "
            f"IP: {client_ip} | User: {user.get('email')} | Role: {user.get('role')} | "
            f"Path: {request.url.path}"
        )
        # Generic error message - don't reveal authorization details
        raise HTTPException(status_code=403, detail="Access denied")
    if user.get("role") == "OWNER":
        return user

    if permission:
        admin_role_ids = user.get("admin_role_ids", [])
        if not admin_role_ids:
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        roles = await db.roles.find(
            {"role_id": {"$in": admin_role_ids}, "is_active": True},
            {"_id": 0, "permissions": 1},
        ).to_list(100)
        permissions = set()
        for r in roles:
            permissions.update(r.get("permissions", []))
        if permission not in permissions:
            raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
        user["permissions"] = permissions
    return user


# ─── API Endpoints ─────────────────────────────────────────────────

@router.get("")
async def list_users(
    request: Request,
    role: Optional[str] = None,
    roles: Optional[str] = None,
    location_id: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    include_deleted: bool = False,
    page: int = 1,
    limit: int = 50
):
    """
    List all users with optional filters.
    - role: Filter by OWNER, LOCATION_MANAGER, or CUSTOMER
    - roles: Comma-separated list of roles to include (e.g. OWNER,OWNER_FULL,LOCATION_MANAGER)
    - location_id: Filter by assigned location (for managers/customers)
    - is_active: Filter by active status
    - include_deleted: Show soft-deleted users (admin-only)
    """
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_many(
        {
            "role": "OWNER",
            "user_id": {"$ne": effective_owner_id},
            "$or": [{"owner_id": None}, {"owner_id": {"$exists": False}}, {"owner_id": effective_owner_id}],
        },
        {"$set": {"role": "OWNER_FULL", "owner_id": effective_owner_id, "updated_at": now}},
    )
    
    # Build query - start with owner scope
    base_or = [
        {"owner_id": effective_owner_id},
        {"user_id": effective_owner_id},
        {"user_id": owner["user_id"]},
    ]
    
    # By default, exclude deleted users
    deleted_filter = {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    if include_deleted:
        deleted_filter = {}  # Show all, including deleted
    
    # Build the full query
    query_conditions = [{"$or": base_or}]
    if deleted_filter:
        query_conditions.append(deleted_filter)
    
    if roles:
        role_list = [r.strip() for r in roles.split(",") if r.strip()]
        if role_list:
            query_conditions.append({"role": {"$in": role_list}})
    elif role:
        if role == "OWNER":
            query_conditions.append({"role": {"$in": ["OWNER", "OWNER_FULL"]}})
        else:
            query_conditions.append({"role": role})
    
    if location_id:
        query_conditions.append({
            "$or": [
                {"location_id": location_id},
                {"manager_location_ids": location_id},
            ]
        })
    
    if is_active is not None:
        query_conditions.append({"is_active": is_active})

    if search:
        s = search.strip()
        if s:
            query_conditions.append({
                "$or": [
                    {"email": {"$regex": s, "$options": "i"}},
                    {"name": {"$regex": s, "$options": "i"}},
                    {"first_name": {"$regex": s, "$options": "i"}},
                    {"last_name": {"$regex": s, "$options": "i"}},
                ]
            })
    
    query = {"$and": query_conditions} if len(query_conditions) > 1 else query_conditions[0]
    
    # Execute query with pagination
    skip = (page - 1) * limit
    cursor = (
        db.users.find(query, {"_id": 0, "password_hash": 0})
        .sort([("created_at", -1), ("email", 1)])
        .skip(skip)
        .limit(limit)
    )
    users = await cursor.to_list(limit)
    
    # Get total count
    total = await db.users.count_documents(query)
    
    # Get location names for managers
    location_ids = set()
    for user in users:
        if user.get("location_id"):
            location_ids.add(user["location_id"])
        if user.get("manager_location_ids"):
            location_ids.update(user["manager_location_ids"])
    
    locations_map = {}
    if location_ids:
        locations = await db.locations.find(
            {"location_id": {"$in": list(location_ids)}},
            {"_id": 0, "location_id": 1, "name": 1}
        ).to_list(100)
        locations_map = {loc["location_id"]: loc["name"] for loc in locations}
    
    # Format response with location names
    formatted_users = []
    
    # Collect all admin role IDs for batch lookup
    all_role_ids = set()
    for user in users:
        if user.get("admin_role_ids"):
            all_role_ids.update(user["admin_role_ids"])
    
    # Load all roles at once
    roles_map = {}
    if all_role_ids:
        roles = await db.roles.find(
            {"role_id": {"$in": list(all_role_ids)}},
            {"_id": 0, "role_id": 1, "name": 1, "code": 1}
        ).to_list(100)
        roles_map = {r["role_id"]: {"role_id": r["role_id"], "name": r["name"], "code": r["code"]} for r in roles}
    
    for user in users:
        formatted = format_user_response(user)
        # Add location names
        if formatted.get("location_id"):
            formatted["location_name"] = locations_map.get(formatted["location_id"], "Unknown")
        if formatted.get("manager_location_ids"):
            formatted["manager_location_names"] = [
                locations_map.get(lid, "Unknown") for lid in formatted["manager_location_ids"]
            ]
        # Add admin role details
        if formatted.get("admin_role_ids"):
            formatted["admin_roles"] = [
                roles_map.get(rid) for rid in formatted["admin_role_ids"] if rid in roles_map
            ]
        else:
            formatted["admin_roles"] = []
        formatted_users.append(formatted)
    
    return {
        "users": formatted_users,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": (total + limit - 1) // limit
    }


@router.get("/{user_id}")
async def get_user(user_id: str, request: Request):
    """Get a single user's details"""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    user = await db.users.find_one({
        "user_id": user_id, 
        "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}],
        "$and": [{"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}]
    }, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    formatted = format_user_response(user)
    
    # Get location names
    location_ids = []
    if formatted.get("location_id"):
        location_ids.append(formatted["location_id"])
    if formatted.get("manager_location_ids"):
        location_ids.extend(formatted["manager_location_ids"])
    
    if location_ids:
        locations = await db.locations.find(
            {"location_id": {"$in": location_ids}},
            {"_id": 0, "location_id": 1, "name": 1}
        ).to_list(100)
        locations_map = {loc["location_id"]: loc["name"] for loc in locations}
        
        if formatted.get("location_id"):
            formatted["location_name"] = locations_map.get(formatted["location_id"], "Unknown")
        if formatted.get("manager_location_ids"):
            formatted["manager_location_names"] = [
                locations_map.get(lid, "Unknown") for lid in formatted["manager_location_ids"]
            ]
    
    return formatted


@router.post("", status_code=201)
async def create_user(data: UserCreateRequest, request: Request):
    """
    Create a new OWNER, LOCATION_MANAGER, or RECEPTIONIST user.
    SECURITY: Only authenticated OWNER can create admin-level users.
    For MANAGER/RECEPTIONIST role, manager_location_ids must be provided.
    Optionally assign admin roles via admin_role_ids.
    """
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    client_ip = request.client.host if request.client else "unknown"
    
    # SECURITY: Validate allowed roles for admin creation
    allowed_admin_roles = {"OWNER", "LOCATION_MANAGER", "RECEPTIONIST"}
    if data.role not in allowed_admin_roles:
        security_logger.warning(
            f"SECURITY_ALERT: Invalid role creation attempt via admin panel | "
            f"IP: {client_ip} | Owner: {owner.get('email')} | Attempted role: {data.role}"
        )
        raise HTTPException(status_code=400, detail="Invalid request")
    
    stored_role = data.role
    if stored_role == "OWNER":
        stored_role = "OWNER_FULL"

    # Validate role-specific requirements
    if stored_role in ("LOCATION_MANAGER", "RECEPTIONIST"):
        if not data.manager_location_ids or len(data.manager_location_ids) == 0:
            raise HTTPException(
                status_code=400, 
                detail=f"{stored_role} must be assigned to at least one location"
            )
        
        # Verify all locations exist and belong to the owner
        for loc_id in data.manager_location_ids:
            loc = await db.locations.find_one(
                {"location_id": loc_id, "owner_id": effective_owner_id, "is_deleted": False},
                {"_id": 0}
            )
            if not loc:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Location {loc_id} not found or doesn't belong to you"
                )
    
    # Check for duplicate email
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Validate and assign admin roles
    admin_role_ids = []
    expected_scope = "OWNER" if stored_role in ("OWNER", "OWNER_FULL") else ("RECEPTIONIST" if stored_role == "RECEPTIONIST" else "MANAGER")
    
    if data.admin_role_ids:
        # Validate that roles exist and match the user's role scope
        for role_id in data.admin_role_ids:
            role = await db.roles.find_one(
                {"role_id": role_id, "is_active": True},
                {"_id": 0}
            )
            if not role:
                raise HTTPException(status_code=400, detail=f"Role {role_id} not found or inactive")
            if role["scope"] != expected_scope:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Role {role['name']} has scope {role['scope']}, but user role requires {expected_scope}"
                )
        admin_role_ids = data.admin_role_ids
    else:
        # Assign default role based on user type
        role_map = {"OWNER_FULL": "OWNER_FULL", "LOCATION_MANAGER": "MANAGER_FULL", "RECEPTIONIST": "RECEPTIONIST_FULL"}
        default_code = role_map.get(stored_role, "MANAGER_FULL")
        default_role = await db.roles.find_one({"code": default_code, "is_active": True}, {"_id": 0})
        if default_role:
            admin_role_ids = [default_role["role_id"]]
    
    # Create user
    now = datetime.now(timezone.utc).isoformat()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    
    user_doc = {
        "user_id": user_id,
        "email": data.email,
        "first_name": data.first_name,
        "last_name": data.last_name,
        "name": f"{data.first_name} {data.last_name}".strip(),
        "password_hash": pwd_context.hash(data.password),
        "picture": None,
        "role": stored_role,
        "is_active": True,
        "deleted_at": None,
        "owner_id": effective_owner_id,
        "admin_role_ids": admin_role_ids,
        "created_at": now,
        "updated_at": now,
    }
    
    # Add location fields based on role
    if stored_role in ("LOCATION_MANAGER", "RECEPTIONIST"):
        user_doc["location_id"] = data.manager_location_ids[0]  # Primary location
        user_doc["manager_location_ids"] = data.manager_location_ids
    else:
        user_doc["location_id"] = None
        user_doc["manager_location_ids"] = []
    
    await db.users.insert_one(user_doc)
    
    # Audit log for admin user creation
    logger.info(
        f"Admin user created | Owner: {owner.get('email')} | New user: {data.email} | Role: {data.role}"
    )
    
    # Return formatted response
    formatted = format_user_response(user_doc)

    staff_doc = await _ensure_employee_staff(user_doc, effective_owner_id, data.employee)
    if staff_doc:
        formatted["staff_id"] = staff_doc.get("staff_id")
        formatted["employee_location_id"] = staff_doc.get("location_id")
        formatted["employee"] = {
            "staff_id": staff_doc.get("staff_id"),
            "location_id": staff_doc.get("location_id"),
            "employment_type": staff_doc.get("employment_type"),
            "join_date": staff_doc.get("join_date"),
            "pay_structure": staff_doc.get("pay_structure"),
            "is_active": staff_doc.get("is_active"),
            "deleted_at": staff_doc.get("deleted_at"),
        }
    
    # Add location names
    if data.manager_location_ids:
        locations = await db.locations.find(
            {"location_id": {"$in": data.manager_location_ids}},
            {"_id": 0, "location_id": 1, "name": 1}
        ).to_list(100)
        locations_map = {loc["location_id"]: loc["name"] for loc in locations}
        formatted["manager_location_names"] = [
            locations_map.get(lid, "Unknown") for lid in data.manager_location_ids
        ]
    
    # Add role names
    if admin_role_ids:
        roles = await db.roles.find(
            {"role_id": {"$in": admin_role_ids}},
            {"_id": 0, "role_id": 1, "name": 1, "code": 1}
        ).to_list(100)
        formatted["admin_roles"] = [{"role_id": r["role_id"], "name": r["name"], "code": r["code"]} for r in roles]
    
    return formatted


@router.patch("/{user_id}")
async def update_user(user_id: str, data: UserUpdateRequest, request: Request):
    """
    Update user information.
    - Can update first_name, last_name
    - Can change role (with restrictions)
    - Can update manager_location_ids for managers
    - Can toggle is_active
    """
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find user (exclude deleted)
    user = await db.users.find_one({
        "user_id": user_id, 
        "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}],
        "$and": [{"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}]
    }, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent modifying the primary owner account
    if user["role"] == "OWNER" and user["user_id"] != owner["user_id"]:
        raise HTTPException(status_code=403, detail="Cannot modify another owner's account")
    
    # Build update
    update_data = {}
    now = datetime.now(timezone.utc).isoformat()
    
    if data.first_name is not None:
        update_data["first_name"] = data.first_name
    
    if data.last_name is not None:
        update_data["last_name"] = data.last_name
    
    # Update name field if first/last name changed
    if data.first_name is not None or data.last_name is not None:
        new_first = data.first_name if data.first_name is not None else user.get("first_name", "")
        new_last = data.last_name if data.last_name is not None else user.get("last_name", "")
        update_data["name"] = f"{new_first} {new_last}".strip()
    
    # Handle role change
    if data.role is not None:
        requested_role = data.role
        normalized_role = "OWNER_FULL" if requested_role == "OWNER" else requested_role
        current_role = user.get("role")

        if normalized_role != current_role:
            # Validate role change permissions
            if current_role in ("OWNER", "OWNER_FULL") and normalized_role not in ("OWNER", "OWNER_FULL"):
                raise HTTPException(status_code=403, detail="Cannot change an owner's role")

            if normalized_role not in ("OWNER", "OWNER_FULL", "LOCATION_MANAGER", "RECEPTIONIST", "CUSTOMER", "MEMBER"):
                raise HTTPException(status_code=400, detail="Invalid role")

            update_data["role"] = normalized_role

            # If changing to manager/receptionist, require location assignment
            if normalized_role in ("LOCATION_MANAGER", "RECEPTIONIST"):
                if not data.manager_location_ids or len(data.manager_location_ids) == 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{normalized_role} must be assigned to at least one location"
                    )
    
    # Handle manager location updates
    if data.manager_location_ids is not None:
        target_role = data.role if data.role else user["role"]
        if target_role in ("LOCATION_MANAGER", "RECEPTIONIST"):
            # Verify all locations exist and belong to the owner
            for loc_id in data.manager_location_ids:
                loc = await db.locations.find_one(
                    {"location_id": loc_id, "owner_id": effective_owner_id, "is_deleted": False},
                    {"_id": 0}
                )
                if not loc:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Location {loc_id} not found or doesn't belong to you"
                    )
            
            update_data["manager_location_ids"] = data.manager_location_ids
            update_data["location_id"] = data.manager_location_ids[0] if data.manager_location_ids else None
    
    # Handle is_active toggle
    if data.is_active is not None:
        # Prevent deactivating yourself
        if user["user_id"] == owner["user_id"] and not data.is_active:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        update_data["is_active"] = data.is_active
    
    # Handle admin role updates
    if data.admin_role_ids is not None:
        target_role = data.role if data.role else user["role"]
        
        # Customers cannot have admin roles
        if target_role == "CUSTOMER":
            if data.admin_role_ids:
                raise HTTPException(status_code=400, detail="Customers cannot have admin roles")
            update_data["admin_role_ids"] = []
        else:
            # Validate that roles exist and match the user's role scope
            expected_scope = "OWNER" if target_role in ("OWNER", "OWNER_FULL") else ("RECEPTIONIST" if target_role == "RECEPTIONIST" else "MANAGER")
            for role_id in data.admin_role_ids:
                role = await db.roles.find_one(
                    {"role_id": role_id, "is_active": True},
                    {"_id": 0}
                )
                if not role:
                    raise HTTPException(status_code=400, detail=f"Role {role_id} not found or inactive")
                if role["scope"] != expected_scope:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Role {role['name']} has scope {role['scope']}, but user role requires {expected_scope}"
                    )
            update_data["admin_role_ids"] = data.admin_role_ids
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    update_data["updated_at"] = now
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": update_data}
    )
    
    # Return updated user
    updated_user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    formatted = format_user_response(updated_user)

    staff_doc = await _ensure_employee_staff(updated_user, effective_owner_id, data.employee)
    if staff_doc:
        formatted["staff_id"] = staff_doc.get("staff_id")
        formatted["employee_location_id"] = staff_doc.get("location_id")
        formatted["employee"] = {
            "staff_id": staff_doc.get("staff_id"),
            "location_id": staff_doc.get("location_id"),
            "employment_type": staff_doc.get("employment_type"),
            "join_date": staff_doc.get("join_date"),
            "pay_structure": staff_doc.get("pay_structure"),
            "is_active": staff_doc.get("is_active"),
            "deleted_at": staff_doc.get("deleted_at"),
        }

    return formatted


@router.patch("/{user_id}/reset-password")
async def reset_password(user_id: str, data: ResetPasswordRequest, request: Request):
    """Reset a user's password (Owner only)"""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find user
    user = await db.users.find_one(
        {"user_id": user_id, "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}]},
        {"_id": 0}
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent resetting another owner's password
    if user["role"] == "OWNER" and user["user_id"] != owner["user_id"]:
        raise HTTPException(status_code=403, detail="Cannot reset another owner's password")
    
    # Update password
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "password_hash": pwd_context.hash(data.new_password),
            "updated_at": now
        }}
    )
    
    return {"message": "Password reset successfully"}


@router.patch("/{user_id}/deactivate")
async def deactivate_user(user_id: str, request: Request):
    """Soft deactivate a user (set is_active = false)"""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find user (exclude deleted)
    user = await db.users.find_one({
        "user_id": user_id, 
        "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}],
        "$and": [{"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}]
    }, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deactivating yourself
    if user["user_id"] == owner["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
    
    # Prevent deactivating another owner
    if user["role"] == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot deactivate another owner")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_active": False, "updated_at": now}}
    )
    
    return {"message": "User deactivated"}


@router.patch("/{user_id}/activate")
async def activate_user(user_id: str, request: Request):
    """Reactivate a deactivated user"""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find user (exclude deleted)
    user = await db.users.find_one({
        "user_id": user_id, 
        "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}],
        "$and": [{"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}]
    }, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"is_active": True, "updated_at": now}}
    )
    
    return {"message": "User activated"}


@router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request):
    """Soft delete a user - sets deleted_at timestamp. Record can be restored."""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find user (exclude already deleted)
    user = await db.users.find_one({
        "user_id": user_id, 
        "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}],
        "$and": [{"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}]
    }, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting yourself
    if user["user_id"] == owner["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    # Prevent deleting another owner
    if user["role"] == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot delete another owner")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"deleted_at": now, "updated_at": now}}
    )
    
    return {"message": "User deleted"}


@router.post("/{user_id}/restore")
async def restore_user(user_id: str, request: Request):
    """Restore a soft-deleted user"""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find deleted user
    user = await db.users.find_one({
        "user_id": user_id, 
        "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}],
        "deleted_at": {"$ne": None}
    }, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Deleted user not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"deleted_at": None, "updated_at": now}}
    )
    
    return await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})


@router.delete("/{user_id}/permanent")
async def permanent_delete_user(user_id: str, request: Request):
    """Permanently delete a user (Owner only, irreversible)"""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find user
    user = await db.users.find_one({
        "user_id": user_id, 
        "$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}]
    }, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent deleting yourself
    if user["user_id"] == owner["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    # Prevent deleting another owner
    if user["role"] == "OWNER":
        raise HTTPException(status_code=403, detail="Cannot permanently delete another owner")
    
    await db.users.delete_one({"user_id": user_id})
    
    return {"message": "User permanently deleted"}


@router.post("/sync-members")
async def sync_members_data(request: Request):
    """
    Sync Users with role 'CUSTOMER' to 'MEMBER' role and ensure they have
    corresponding records in the members collection.
    """
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Find all users with role CUSTOMER or MEMBER
    users = await db.users.find({
        "role": {"$in": ["CUSTOMER", "MEMBER"]},
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    }).to_list(10000)
    
    synced_count = 0
    updated_role_count = 0
    
    for user in users:
        # Skip if no location_id (should not happen for customers/members usually, but good to check)
        if not user.get("location_id"):
            continue
            
        location_id = user["location_id"]
        email = user.get("email")
        
        # Check if member exists
        member = await db.members.find_one({
            "location_id": location_id,
            "email": email
        })
        
        member_id = None
        
        if not member:
            # Create member record
            member_id = f"member_{uuid.uuid4().hex[:12]}"
            now = datetime.now(timezone.utc).isoformat()
            
            # Generate member_no logic (simplified version of members.py)
            loc = await db.locations.find_one({"location_id": location_id}, {"_id": 0, "name": 1})
            prefix = "GEN"
            if loc:
                name = loc["name"]
                if "(" in name and ")" in name:
                    start = name.find("(") + 1
                    end = name.find(")")
                    prefix = name[start:end][:3].upper()
                elif "-" in name:
                    parts = name.split("-")
                    prefix = parts[-1].strip()[:3].upper()
                else:
                    prefix = name[:3].upper()
            
            count = await db.members.count_documents({"location_id": location_id})
            seq = count + 1
            member_no = f"SP-{prefix}-{seq:04d}"
            
            member_doc = {
                "member_id": member_id,
                "location_id": location_id,
                "member_no": member_no,
                "full_name": user.get("name") or f"{user.get('first_name', '')} {user.get('last_name', '')}".strip(),
                "gender": "",
                "dob": None,
                "phone": "",
                "email": email,
                "address": "",
                "emergency_contact": {"name": "", "phone": "", "relation": ""},
                "medical": {
                    "conditions": "", "injuries": "", "allergies": "", 
                    "medications": "", "notes": "", "doctor_name": "", 
                    "doctor_phone": "", "consent": False
                },
                "profile_photo_url": user.get("picture"),
                "is_active": user.get("is_active", True),
                "deleted_at": None,
                "created_by_user_id": owner["user_id"],
                "created_at": now,
                "updated_at": now,
                "user_id": user["user_id"] # Link back to user
            }
            
            await db.members.insert_one(member_doc)
            synced_count += 1
        else:
            member_id = member["member_id"]
            # Ensure member has user_id linked
            if not member.get("user_id"):
                await db.members.update_one(
                    {"member_id": member_id},
                    {"$set": {"user_id": user["user_id"]}}
                )
        
        # Update User record
        update_fields = {}
        if user["role"] == "CUSTOMER":
            update_fields["role"] = "MEMBER"
            updated_role_count += 1
            
        if not user.get("member_id") and member_id:
            update_fields["member_id"] = member_id
            
        if update_fields:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": update_fields}
            )
            
    return {
        "message": "Sync complete",
        "synced_members_created": synced_count,
        "users_updated_to_member_role": updated_role_count
    }


@router.get("/stats/summary")
async def get_user_stats(request: Request):
    """Get user statistics summary for the owner"""
    owner = await require_owner(request, "owner.manage_users")
    effective_owner_id = owner["user_id"] if owner.get("role") == "OWNER" else owner.get("owner_id")
    if not effective_owner_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Count users by role
    pipeline = [
        {"$match": {"$or": [{"owner_id": effective_owner_id}, {"user_id": effective_owner_id}, {"user_id": owner["user_id"]}]}},
        {"$group": {
            "_id": {"role": "$role", "is_active": "$is_active"},
            "count": {"$sum": 1}
        }}
    ]
    
    results = await db.users.aggregate(pipeline).to_list(100)
    
    stats = {
        "total_owners": 0,
        "total_managers": 0,
        "total_receptionists": 0,
        "total_members": 0,
        "total_customers": 0,
        "active_owners": 0,
        "active_managers": 0,
        "active_receptionists": 0,
        "active_members": 0,
        "active_customers": 0,
        "inactive_users": 0,
    }
    
    for result in results:
        role = result["_id"]["role"]
        is_active = result["_id"].get("is_active", True)
        count = result["count"]
        
        if role in ("OWNER", "OWNER_FULL"):
            stats["total_owners"] += count
            if is_active:
                stats["active_owners"] += count
        elif role == "LOCATION_MANAGER":
            stats["total_managers"] += count
            if is_active:
                stats["active_managers"] += count
        elif role == "RECEPTIONIST":
            stats["total_receptionists"] += count
            if is_active:
                stats["active_receptionists"] += count
        elif role == "MEMBER":
            stats["total_members"] += count
            if is_active:
                stats["active_members"] += count
        elif role == "CUSTOMER":
            # Count customers as members for the summary
            stats["total_members"] += count
            if is_active:
                stats["active_members"] += count
        
        if not is_active:
            stats["inactive_users"] += count
    
    stats["total_users"] = stats["total_owners"] + stats["total_managers"] + stats["total_receptionists"] + stats["total_members"] + stats["total_customers"]
    
    return stats
