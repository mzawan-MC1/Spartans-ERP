"""
RBAC (Role-Based Access Control) Module
Manages roles and permissions for admin users (Owners and Managers).
Customers are excluded from this RBAC system.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Set
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/admin/roles", tags=["Roles & Permissions"])

# Will be initialized from server.py
db = None
get_current_user = None

def init(database, auth_func):
    global db, get_current_user
    db = database
    get_current_user = auth_func


# ─── Permission Definitions ────────────────────────────────────────

# Owner-scope permissions (global / multi-location)
OWNER_PERMISSIONS = [
    "owner.view_dashboard",
    "owner.manage_locations",
    "owner.view_all_locations_reports",
    "owner.manage_public_site",
    "owner.manage_users",
    "owner.manage_roles",
    "owner.manage_payment_gateways",
    "owner.view_finance_all",
    "owner.manage_finance_all",
    "owner.view_hr_all",
    "owner.manage_hr_all",
    "owner.view_contact_submissions",
    "owner.manage_contact_submissions",
    "owner.manage_members",
    "owner.manage_transfers",
    "owner.view_sales_all",
    "owner.manage_sales_all",
    "employee.view_own_profile",
    "employee.edit_own_profile",
    "employee.create_requests",
    "employee.view_own_reports",
    "employee.view_own_performance",
]

# Manager-scope permissions (single-location)
MANAGER_PERMISSIONS = [
    "manager.view_dashboard",
    "manager.manage_programs",
    "manager.view_programs",
    "manager.manage_schedules",
    "manager.view_schedules",
    "manager.record_attendance",
    "manager.view_bookings",
    "manager.manage_bookings",
    "manager.view_hr_location",
    "manager.manage_hr_location",
    "manager.view_finance_location",
    "manager.manage_finance_location",
    "manager.view_contact_submissions_location",
    "manager.manage_contact_submissions_location",
    "manager.manage_instructors",
    "manager.view_instructors",
    "manager.manage_staff",
    "manager.view_staff",
    "manager.manage_members",
    "manager.view_members",
    "manager.manage_memberships",
    "manager.freeze_memberships",
    "manager.manage_auto_renew",
    "manager.manage_agreements",
    "manager.manage_payments",
    "manager.manage_documents",
    "manager.request_transfers",
    "manager.view_sales_location",
    "manager.manage_sales_location",
    "manager.approve_discipline_requests",
    "employee.view_own_profile",
    "employee.edit_own_profile",
    "employee.create_requests",
    "employee.view_own_reports",
    "employee.view_own_performance",
]

# Receptionist-scope permissions (single-location, extended)
RECEPTIONIST_PERMISSIONS = [
    # Dashboard
    "receptionist.view_dashboard",
    
    # Staff / Instructors
    "manager.view_staff",          # View staff attendance/list
    "manager.view_instructors",    # View instructor schedules
    "receptionist.record_attendance", # Record attendance (for staff/members)

    # Members
    "receptionist.view_members",
    "receptionist.create_members",
    "receptionist.edit_members_basic",
    "manager.manage_members",      # Full edit access if needed
    
    # Memberships
    "receptionist.view_memberships",
    "receptionist.create_memberships",
    "manager.manage_memberships",  # Renew/Update
    "manager.freeze_memberships",  # Optional: Receptionist might need this
    
    # Payments / Finance
    "receptionist.view_payments",
    "receptionist.record_cash_payments",
    "manager.manage_payments",     # Full payment access (edit/record all types)
    
    # Documents
    "manager.manage_documents",
    
    # Programs / Schedules
    "receptionist.view_programs",
    "receptionist.view_schedules",
    "receptionist.view_bookings",
    "manager.manage_bookings",     # Cancel/Modify bookings
    
    # Agreements
    "receptionist.view_agreements",
    "manager.manage_agreements",   # Add/Edit agreements
    "employee.view_own_profile",
    "employee.edit_own_profile",
    "employee.create_requests",
    "employee.view_own_reports",
    "employee.view_own_performance",
]

# Member-scope permissions (self only)
MEMBER_PERMISSIONS = [
    "member.view_own_profile",
    "member.edit_own_profile",
    "member.view_own_memberships",
    "member.view_own_payments",
    "member.view_schedules",
    "member.make_payments",
    "member.sign_agreements",
]

ALL_PERMISSIONS = {
    "OWNER": OWNER_PERMISSIONS,
    "MANAGER": MANAGER_PERMISSIONS,
    "RECEPTIONIST": RECEPTIONIST_PERMISSIONS,
    "MEMBER": MEMBER_PERMISSIONS,
}

# Permission descriptions for UI
PERMISSION_DESCRIPTIONS = {
    # Owner permissions
    "owner.view_dashboard": "View owner dashboard",
    "owner.manage_locations": "Create, edit, and delete locations",
    "owner.view_all_locations_reports": "View reports across all locations",
    "owner.manage_public_site": "Manage public website, CMS, disciplines, pricing, FAQs",
    "owner.manage_users": "Create, edit, deactivate users",
    "owner.manage_roles": "Create, edit, delete roles",
    "owner.manage_payment_gateways": "Manage payment gateways and configuration",
    "owner.view_finance_all": "View financial data across all locations",
    "owner.manage_finance_all": "Edit payroll & expenses for all locations",
    "owner.view_hr_all": "View staff list across all locations",
    "owner.manage_hr_all": "Edit staff and pay structures for all locations",
    "owner.view_contact_submissions": "View all contact/lead submissions",
    "owner.manage_contact_submissions": "Mark handled, assign contact submissions",
    "owner.manage_members": "Manage members across all locations",
    "owner.manage_transfers": "Approve and complete member transfers",
    "owner.view_sales_all": "View sales teams and leads across all locations",
    "employee.view_own_profile": "View own employee profile",
    "employee.edit_own_profile": "Edit own employee profile (limited)",
    "employee.create_requests": "Create own HR requests",
    "employee.view_own_reports": "View own reports",
    "employee.view_own_performance": "View own performance records",
    "owner.manage_sales_all": "Manage sales teams, agents, and leads across all locations",
    # Manager permissions
    "manager.view_dashboard": "View manager dashboard",
    "manager.manage_programs": "Create, edit, delete programs and categories",
    "manager.view_programs": "View programs and categories",
    "manager.manage_schedules": "Create, edit, delete schedules and sessions",
    "manager.view_schedules": "View schedules and sessions",
    "manager.record_attendance": "Record student attendance",
    "manager.view_bookings": "View class bookings",
    "manager.manage_bookings": "Cancel or modify bookings",
    "manager.view_hr_location": "View staff at assigned location",
    "manager.manage_hr_location": "Manage staff at assigned location",
    "manager.view_finance_location": "View financial data at assigned location",
    "manager.manage_finance_location": "Manage payroll & expenses at assigned location",
    "manager.view_contact_submissions_location": "View contact submissions for location",
    "manager.manage_contact_submissions_location": "Handle contact submissions for location",
    "manager.manage_instructors": "Create, edit, delete instructors",
    "manager.view_instructors": "View instructors",
    "manager.manage_staff": "Create, edit staff records",
    "manager.view_staff": "View staff records",
    "manager.manage_members": "Create, edit, deactivate members",
    "manager.view_members": "View member list and details",
    "manager.manage_memberships": "Create, edit memberships",
    "manager.freeze_memberships": "Freeze and unfreeze memberships",
    "manager.manage_auto_renew": "Manage membership auto-renew settings",
    "manager.manage_agreements": "Create, edit agreement templates",
    "manager.manage_payments": "Record and manage payments",
    "manager.manage_documents": "Upload and manage member documents/receipts",
    "manager.request_transfers": "Request member transfers",
    "manager.view_sales_location": "View sales teams and leads for assigned location",
    "manager.manage_sales_location": "Manage sales teams, agents, and leads for assigned location",
    "manager.approve_discipline_requests": "Approve/reject discipline supervisor requests",
    # Receptionist permissions
    "receptionist.view_dashboard": "View receptionist dashboard",
    "receptionist.view_programs": "View programs and categories",
    "receptionist.view_schedules": "View schedules and sessions",
    "receptionist.record_attendance": "Record student attendance",
    "receptionist.view_bookings": "View class bookings",
    "receptionist.create_members": "Create new members",
    "receptionist.view_members": "View member list and details",
    "receptionist.edit_members_basic": "Edit basic member info (phone, address, emergency)",
    "receptionist.create_memberships": "Create new memberships",
    "receptionist.view_memberships": "View memberships",
    "receptionist.record_cash_payments": "Record cash payments",
    "receptionist.view_payments": "View payment history",
    "receptionist.view_agreements": "View agreement templates",
    
    # Receptionist Extended (using manager.* keys for shared functionality where appropriate)
    "manager.manage_bookings": "Manage bookings (cancel/modify)",
    "manager.view_instructors": "View instructor list and schedules",
    "manager.manage_payments": "Manage payments (full access)",
    "manager.manage_agreements": "Manage agreements (add/edit)",
    "manager.view_staff": "View staff list",
    "manager.manage_members": "Manage members (full access)",
    "manager.manage_memberships": "Manage memberships (renew/update)",
    "manager.approve_discipline_requests": "Approve/reject discipline supervisor requests",
    # Member permissions
    "member.view_own_profile": "View own member profile",
    "member.edit_own_profile": "Edit own profile (limited fields)",
    "member.view_own_memberships": "View own memberships",
    "member.view_own_payments": "View own payment history",
    "member.view_schedules": "View class schedules",
    "member.make_payments": "Make online payments",
    "member.sign_agreements": "Sign agreements",
}

# Default system roles
DEFAULT_ROLES = [
    {
        "name": "Owner – Full Access",
        "code": "OWNER_FULL",
        "scope": "OWNER",
        "description": "Full access to all owner-level features and settings",
        "permissions": OWNER_PERMISSIONS,
        "is_system": True,
    },
    {
        "name": "Manager – Full Access",
        "code": "MANAGER_FULL",
        "scope": "MANAGER",
        "description": "Full access to all manager-level features for assigned locations",
        "permissions": MANAGER_PERMISSIONS,
        "is_system": True,
    },
    {
        "name": "Manager – Operations",
        "code": "MANAGER_OPS",
        "scope": "MANAGER",
        "description": "Operations access without financial management",
        "permissions": [
            "manager.view_dashboard",
            "manager.manage_programs",
            "manager.view_programs",
            "manager.manage_schedules",
            "manager.view_schedules",
            "manager.record_attendance",
            "manager.view_bookings",
            "manager.manage_bookings",
            "manager.view_contact_submissions_location",
            "manager.manage_contact_submissions_location",
            "manager.manage_instructors",
            "manager.view_instructors",
            "manager.manage_members",
            "manager.view_members",
            "manager.manage_memberships",
        ],
        "is_system": True,
    },
    {
        "name": "Manager – Front Desk",
        "code": "MANAGER_FRONTDESK",
        "scope": "MANAGER",
        "description": "Front desk access for attendance and bookings",
        "permissions": [
            "manager.view_dashboard",
            "manager.view_programs",
            "manager.view_schedules",
            "manager.record_attendance",
            "manager.view_bookings",
            "manager.manage_bookings",
            "manager.view_instructors",
            "manager.view_members",
        ],
        "is_system": True,
    },
    {
        "name": "Receptionist – Full Access",
        "code": "RECEPTIONIST_FULL",
        "scope": "RECEPTIONIST",
        "description": "Full receptionist access for member registration, payments, and attendance",
        "permissions": RECEPTIONIST_PERMISSIONS,
        "is_system": True,
    },
    {
        "name": "Member – Standard",
        "code": "MEMBER_STANDARD",
        "scope": "MEMBER",
        "description": "Standard member access to portal features",
        "permissions": MEMBER_PERMISSIONS,
        "is_system": True,
    },
    {
        "name": "Instructor – Standard",
        "code": "INSTRUCTOR",
        "scope": "MANAGER",
        "description": "Instructor access to manage their own classes",
        "permissions": [
            "manager.view_dashboard",
            "manager.view_schedules",
            "manager.record_attendance",
            "manager.view_bookings",
        ],
        "is_system": True,
    },
]


# ─── Pydantic Models ───────────────────────────────────────────────

class RoleCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str = Field(..., min_length=1, max_length=50, pattern="^[A-Z0-9_]+$")
    scope: str = Field(..., pattern="^(OWNER|MANAGER|RECEPTIONIST|MEMBER)$")
    description: str = Field(default="", max_length=500)
    permissions: List[str]


class RoleUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None


class RoleResponse(BaseModel):
    role_id: str
    name: str
    code: str
    scope: str
    description: str
    permissions: List[str]
    is_system: bool
    is_active: bool
    created_at: str
    updated_at: str


# ─── Helper Functions ──────────────────────────────────────────────

def format_role_response(role: dict) -> dict:
    """Format role document for API response"""
    return {
        "role_id": role.get("role_id"),
        "name": role.get("name"),
        "code": role.get("code"),
        "scope": role.get("scope"),
        "description": role.get("description", ""),
        "permissions": role.get("permissions", []),
        "is_system": role.get("is_system", False),
        "is_active": role.get("is_active", True),
        "created_at": role.get("created_at"),
        "updated_at": role.get("updated_at"),
    }


async def get_user_permissions(user: dict) -> Set[str]:
    """
    Get all permissions for a user based on their assigned admin roles.
    Returns empty set for CUSTOMER role.
    """
    if user.get("role") == "CUSTOMER":
        return set()
    
    admin_role_ids = user.get("admin_role_ids", [])
    if not admin_role_ids:
        return set()
    
    # Load all active roles assigned to this user
    roles = await db.roles.find(
        {"role_id": {"$in": admin_role_ids}, "is_active": True},
        {"_id": 0, "permissions": 1}
    ).to_list(100)
    
    # Collect all unique permissions
    permissions = set()
    for role in roles:
        permissions.update(role.get("permissions", []))
    
    return permissions


async def check_permission(user: dict, permission: str) -> bool:
    """
    Check if user has a specific permission without raising HTTPException.
    """
    if user.get("role") == "CUSTOMER":
        return False
        
    # Full access roles bypass granular permission checks
    if user.get("role") in ("OWNER", "MANAGER_FULL"):
        return True
        
    permissions = await get_user_permissions(user)
    return permission in permissions

async def require_permission(request: Request, permission: str) -> dict:
    """
    Check if the current user has a specific permission.
    Returns the user if authorized, raises 403 if not.
    """
    user = await get_current_user(request)
    
    # Customers never have admin permissions
    if user.get("role") == "CUSTOMER":
        raise HTTPException(status_code=403, detail="Access denied")

    if user.get("role") == "OWNER":
        user["permissions"] = set(OWNER_PERMISSIONS)
        return user
    
    # Get user's permissions
    permissions = await get_user_permissions(user)
    
    # Check if user has the required permission
    if permission not in permissions:
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    
    user["permissions"] = permissions
    return user


async def require_owner_with_permission(request: Request, permission: str) -> dict:
    """Require OWNER/OWNER_FULL and specific permission (OWNER bypasses granular checks)."""
    user = await get_current_user(request)
    if user.get("role") not in ("OWNER", "OWNER_FULL"):
        raise HTTPException(status_code=403, detail="Only owners can access this resource")

    if user.get("role") == "OWNER":
        user["permissions"] = set(OWNER_PERMISSIONS)
        return user

    permissions = await get_user_permissions(user)
    if permission not in permissions:
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")
    
    user["permissions"] = permissions
    return user


# ─── API Endpoints ─────────────────────────────────────────────────

@router.get("/permissions")
async def list_all_permissions(request: Request):
    """
    Get all available permissions grouped by scope.
    Requires owner.manage_roles permission.
    """
    user = await require_owner_with_permission(request, "owner.manage_roles")
    
    return {
        "owner_permissions": [
            {"key": p, "description": PERMISSION_DESCRIPTIONS.get(p, p)}
            for p in OWNER_PERMISSIONS
        ],
        "manager_permissions": [
            {"key": p, "description": PERMISSION_DESCRIPTIONS.get(p, p)}
            for p in MANAGER_PERMISSIONS
        ],
        "receptionist_permissions": [
            {"key": p, "description": PERMISSION_DESCRIPTIONS.get(p, p)}
            for p in RECEPTIONIST_PERMISSIONS
        ],
        "member_permissions": [
            {"key": p, "description": PERMISSION_DESCRIPTIONS.get(p, p)}
            for p in MEMBER_PERMISSIONS
        ],
    }


@router.get("")
async def list_roles(
    request: Request,
    scope: Optional[str] = None,
    is_active: Optional[bool] = None,
):
    """
    List all roles with optional filters.
    Accessible by Owners (to manage) and Managers (to assign/view).
    """
    user = await get_current_user(request)
    permissions = await get_user_permissions(user)
    
    # Allow if user has role management OR staff management OR staff viewing permissions
    allowed = {"owner.manage_roles", "owner.manage_users", "manager.manage_staff", "manager.view_staff"}
    if not any(p in permissions for p in allowed):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    query = {}
    if scope:
        query["scope"] = scope
    if is_active is not None:
        query["is_active"] = is_active
    
    roles = await db.roles.find(query, {"_id": 0}).to_list(100)
    
    return {
        "roles": [format_role_response(r) for r in roles],
        "total": len(roles),
    }


@router.get("/{role_id}")
async def get_role(role_id: str, request: Request):
    """Get a single role by ID"""
    user = await require_owner_with_permission(request, "owner.manage_roles")
    
    role = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    return format_role_response(role)


@router.post("", status_code=201)
async def create_role(data: RoleCreateRequest, request: Request):
    """
    Create a new role.
    Requires owner.manage_roles permission.
    """
    user = await require_owner_with_permission(request, "owner.manage_roles")
    
    # Check for duplicate code
    existing = await db.roles.find_one({"code": data.code}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Role code already exists")
    
    # Validate permissions match scope
    # Allow any known permission to support extended roles
    all_known_permissions = set(OWNER_PERMISSIONS + MANAGER_PERMISSIONS + RECEPTIONIST_PERMISSIONS + MEMBER_PERMISSIONS)
    invalid_perms = [p for p in data.permissions if p not in all_known_permissions]
    if invalid_perms:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid permissions: {invalid_perms}"
        )
    
    now = datetime.now(timezone.utc).isoformat()
    role_id = f"role_{uuid.uuid4().hex[:12]}"
    
    role_doc = {
        "role_id": role_id,
        "name": data.name,
        "code": data.code,
        "scope": data.scope,
        "description": data.description,
        "permissions": data.permissions,
        "is_system": False,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    
    await db.roles.insert_one(role_doc)
    
    return format_role_response(role_doc)


@router.patch("/{role_id}")
async def update_role(role_id: str, data: RoleUpdateRequest, request: Request):
    """
    Update a role.
    System roles have limited editing (cannot change code or scope).
    Requires owner.manage_roles permission.
    """
    user = await require_owner_with_permission(request, "owner.manage_roles")
    
    role = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    update_data = {}
    now = datetime.now(timezone.utc).isoformat()
    
    if data.name is not None:
        update_data["name"] = data.name
    
    if data.description is not None:
        update_data["description"] = data.description
    
    if data.permissions is not None:
        # Validate permissions match scope
        # Note: we allow some cross-scope mapping now for extended roles (like receptionist using manager.view_staff)
        # So instead of strict matching against ALL_PERMISSIONS[scope], we allow any permission that exists in the system.
        all_known_permissions = set(OWNER_PERMISSIONS + MANAGER_PERMISSIONS + RECEPTIONIST_PERMISSIONS + MEMBER_PERMISSIONS)
        invalid_perms = [p for p in data.permissions if p not in all_known_permissions]
        if invalid_perms:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid permissions: {invalid_perms}"
            )
        update_data["permissions"] = data.permissions
    
    if data.is_active is not None:
        update_data["is_active"] = data.is_active
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    
    update_data["updated_at"] = now
    
    await db.roles.update_one({"role_id": role_id}, {"$set": update_data})
    
    updated_role = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    return format_role_response(updated_role)


@router.delete("/{role_id}")
async def delete_role(role_id: str, request: Request):
    """
    Delete a role (soft delete by setting is_active=false).
    System roles cannot be deleted.
    Requires owner.manage_roles permission.
    """
    user = await require_owner_with_permission(request, "owner.manage_roles")
    
    role = await db.roles.find_one({"role_id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    if role.get("is_system"):
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.roles.update_one(
        {"role_id": role_id},
        {"$set": {"is_active": False, "updated_at": now}}
    )
    
    return {"message": "Role deleted"}


@router.post("/seed", status_code=201)
async def seed_default_roles(request: Request):
    """
    Seed default system roles.
    Only creates roles that don't already exist.
    """
    user = await get_current_user(request)
    if user["role"] != "OWNER":
        raise HTTPException(status_code=403, detail="Only owners can seed roles")
    
    now = datetime.now(timezone.utc).isoformat()
    created_roles = []
    
    for role_data in DEFAULT_ROLES:
        existing = await db.roles.find_one({"code": role_data["code"]}, {"_id": 0})
        if existing:
            # Update permissions for system roles to include any new ones
            if existing.get("is_system"):
                await db.roles.update_one(
                    {"code": role_data["code"]},
                    {"$addToSet": {"permissions": {"$each": role_data["permissions"]}}}
                )
            continue
        
        role_id = f"role_{uuid.uuid4().hex[:12]}"
        role_doc = {
            "role_id": role_id,
            "name": role_data["name"],
            "code": role_data["code"],
            "scope": role_data["scope"],
            "description": role_data["description"],
            "permissions": role_data["permissions"],
            "is_system": role_data["is_system"],
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await db.roles.insert_one(role_doc)
        created_roles.append(role_doc["name"])
    
    # Assign default role to the owner if they don't have any
    owner_full_role = await db.roles.find_one({"code": "OWNER_FULL"}, {"_id": 0})
    if owner_full_role and not user.get("admin_role_ids"):
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"admin_role_ids": [owner_full_role["role_id"]], "updated_at": now}}
        )
    
    return {
        "message": "Default roles seeded",
        "created_roles": created_roles,
    }


@router.get("/user/{user_id}/permissions")
async def get_user_effective_permissions(user_id: str, request: Request):
    """
    Get effective permissions for a specific user.
    Requires owner.manage_users permission.
    """
    owner = await require_owner_with_permission(request, "owner.manage_users")
    
    target_user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target_user.get("role") == "CUSTOMER":
        return {"permissions": [], "roles": []}
    
    admin_role_ids = target_user.get("admin_role_ids", [])
    if not admin_role_ids:
        return {"permissions": [], "roles": []}
    
    # Load roles
    roles = await db.roles.find(
        {"role_id": {"$in": admin_role_ids}, "is_active": True},
        {"_id": 0}
    ).to_list(100)
    
    # Collect permissions
    permissions = set()
    for role in roles:
        permissions.update(role.get("permissions", []))
    
    return {
        "permissions": sorted(list(permissions)),
        "roles": [format_role_response(r) for r in roles],
    }


@router.get("/me/permissions")
async def get_my_effective_permissions(request: Request):
    user = await get_current_user(request)
    role = user.get("role")
    if role in ("CUSTOMER", "MEMBER"):
        return {"permissions": [], "roles": []}

    if role == "OWNER":
        return {"permissions": sorted(list(set(OWNER_PERMISSIONS))), "roles": []}

    admin_role_ids = user.get("admin_role_ids", [])
    if not admin_role_ids:
        return {"permissions": [], "roles": []}

    roles = await db.roles.find(
        {"role_id": {"$in": admin_role_ids}, "is_active": True},
        {"_id": 0}
    ).to_list(100)

    permissions = set()
    for r in roles:
        permissions.update(r.get("permissions", []))

    return {"permissions": sorted(list(permissions)), "roles": [format_role_response(r) for r in roles]}
