"""
Members Management Module
Handles members, memberships, agreements, payments, and transfers.
Multi-tenant with strict location_id isolation.
"""

from fastapi import APIRouter, HTTPException, Request, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, date, timedelta
from dateutil.relativedelta import relativedelta
import uuid
import secrets
import logging
import io
import re
import html
from xml.sax.saxutils import escape as xml_escape

import membership_status

router = APIRouter(tags=["Members"])

# Security logger for audit trail
security_logger = logging.getLogger("security_audit")
logger = logging.getLogger(__name__)

_db = None
_get_current_user = None
_pwd_context = None


def init(database, auth_func, pwd_context):
    global _db, _get_current_user, _pwd_context
    _db = database
    _get_current_user = auth_func
    _pwd_context = pwd_context


def _ascii_filename(value: Optional[str], *, fallback: str) -> str:
    base = (value or "").strip()
    if not base:
        return fallback
    base = base.replace("/", "-").replace("\\", "-")
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", base)
    base = base.strip(" .-_")
    return base or fallback


def _iso_display(value: Optional[str]) -> str:
    if not value:
        return "—"
    s = str(value)
    return s[:19].replace("T", " ")


def _origin_website(request: Request) -> str:
    origin = (request.headers.get("origin") or "").strip()
    if not origin:
        return ""
    v = origin.replace("https://", "").replace("http://", "").strip().rstrip("/")
    return v


def _plain_text_from_html(content_html: str) -> str:
    if not content_html:
        return ""
    s = str(content_html)
    s = re.sub(r"(?i)<\s*br\s*/?\s*>", "\n", s)
    s = re.sub(r"(?i)</\s*p\s*>", "\n\n", s)
    s = re.sub(r"(?i)<\s*p[^>]*>", "", s)
    s = re.sub(r"(?i)</\s*(h1|h2|h3|h4|h5|h6)\s*>", "\n\n", s)
    s = re.sub(r"(?i)<\s*(h1|h2|h3|h4|h5|h6)[^>]*>", "", s)
    s = re.sub(r"(?i)</\s*li\s*>", "\n", s)
    s = re.sub(r"(?i)<\s*li[^>]*>", "• ", s)
    s = re.sub(r"(?is)<\s*style[^>]*>.*?<\s*/\s*style\s*>", "", s)
    s = re.sub(r"(?is)<\s*script[^>]*>.*?<\s*/\s*script\s*>", "", s)
    s = re.sub(r"(?is)<[^>]+>", "", s)
    s = html.unescape(s)
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


async def _resolve_logo_path_for_pdf(location: Optional[dict]):
    import os
    logo_path = None
    candidates = []
    site_settings = await _db.site_settings.find_one({"setting_id": "global"})
    if site_settings:
        candidates.append(site_settings.get("logo_url"))
        candidates.append(site_settings.get("favicon_url"))
    if location:
        candidates.append(location.get("logo_url"))
    for logo_url in candidates:
        if not logo_url:
            continue
        filename = str(logo_url).split("/")[-1]
        possible_path = os.path.join(os.path.dirname(__file__), "uploads", filename)
        if os.path.exists(possible_path):
            logo_path = possible_path
            break
    if not logo_path:
        possible_fallback = os.path.join(os.path.dirname(__file__), "assets", "logo.png")
        if os.path.exists(possible_fallback):
            logo_path = possible_fallback
    return logo_path


async def _get_terms_page_snapshot() -> Optional[dict]:
    page = await _db.static_pages.find_one({"slug": "terms", "is_active": True}, {"_id": 0})
    if not page:
        return None
    return {
        "page_id": page.get("page_id"),
        "slug": page.get("slug"),
        "title": page.get("title") or "Terms & Conditions",
        "version": page.get("updated_at") or page.get("created_at"),
        "content_html": page.get("content") or "",
    }


async def _create_accepted_terms_for_member(member_id: str, location_id: str, accepted_at: str, created_by_user_id: Optional[str]):
    snapshot = await _get_terms_page_snapshot()
    if not snapshot:
        return None
    doc = {
        "accepted_terms_id": f"terms_{uuid.uuid4().hex[:12]}",
        "member_id": member_id,
        "location_id": location_id,
        "accepted_at": accepted_at,
        "created_by_user_id": created_by_user_id,
        "source": {
            "type": "static_page",
            "page_id": snapshot.get("page_id"),
            "slug": snapshot.get("slug"),
        },
        "document_snapshot": snapshot,
        "created_at": accepted_at,
    }
    await _db.accepted_terms.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ─── Pydantic Models ───────────────────────────────────────────────

class EmergencyContact(BaseModel):
    name: str = ""
    phone: str = ""
    relation: str = ""


class MedicalInfo(BaseModel):
    conditions: str = ""
    injuries: str = ""
    allergies: str = ""
    medications: str = ""
    notes: str = ""
    doctor_name: str = ""
    doctor_phone: str = ""
    consent: bool = False


class MemberCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    gender: str = Field(..., pattern="^(male|female)$")
    dob: Optional[str] = ""
    phone: str = Field(..., min_length=5)
    email: str = Field(..., min_length=5)
    password: Optional[str] = None
    address: str = ""
    emergency_contact: EmergencyContact = EmergencyContact()
    medical: MedicalInfo = MedicalInfo()
    profile_photo_url: Optional[str] = None
    accept_terms: bool = False
    agreement_id: Optional[str] = None
    dependent_type: Optional[str] = Field(default=None, pattern="^(kids|spouse|friend)$")


class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    emergency_contact: Optional[EmergencyContact] = None
    medical: Optional[MedicalInfo] = None
    profile_photo_url: Optional[str] = None
    is_active: Optional[bool] = None


class MembershipCreate(BaseModel):
    member_id: str
    type: str = Field(..., pattern="^(full_access|only_gym|kids|kids_program|dedicated_program)$")
    program_id: Optional[str] = None
    program_ids: Optional[List[str]] = None
    start_date: str
    end_date: Optional[str] = None
    payment_plan_id: Optional[str] = None
    auto_renew: bool = False


class LinkedProfileCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    gender: str = Field(..., pattern="^(male|female)$")
    phone: str = ""
    email: str = ""
    address: str = ""
    profile_photo_url: Optional[str] = None
    relationship: str = ""
    dependent_type: str = Field(..., pattern="^(kids|spouse|friend)$")
    password: str = ""


class MembershipUpdate(BaseModel):
    type: Optional[str] = None
    program_id: Optional[str] = None
    program_ids: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    payment_plan_id: Optional[str] = None
    status: Optional[str] = None
    auto_renew: Optional[bool] = None
    signed_agreement_id: Optional[str] = None


class MembershipFreezeCreate(BaseModel):
    start_date: str
    end_date: str
    reason: str = ""


class MembershipFreezeUpdate(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    reason: Optional[str] = None


class MemberPortalPasswordSet(BaseModel):
    password: str = Field(..., min_length=6, max_length=200)


async def _get_or_create_member_user_for_portal(member: dict, *, location_id: str, owner_id: str, now_iso: str):
    user_doc = None
    if member.get("user_id"):
        user_doc = await _db.users.find_one({"user_id": member.get("user_id")})
    if not user_doc and member.get("member_id"):
        user_doc = await _db.users.find_one({"member_id": member.get("member_id")})
    if not user_doc and member.get("email"):
        user_doc = await _db.users.find_one({"email": member.get("email")})
    if user_doc:
        if not member.get("user_id"):
            await _db.members.update_one({"member_id": member.get("member_id")}, {"$set": {"user_id": user_doc.get("user_id"), "updated_at": now_iso}})
        return user_doc

    email = (member.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Member has no email for portal login")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": member.get("full_name") or "Member",
        "password_hash": _pwd_context.hash(secrets.token_urlsafe(8)),
        "picture": member.get("profile_photo_url"),
        "role": "MEMBER",
        "location_id": location_id,
        "owner_id": owner_id,
        "member_id": member.get("member_id"),
        "is_active": True,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await _db.users.insert_one(user_doc)
    await _db.members.update_one({"member_id": member.get("member_id")}, {"$set": {"user_id": user_id, "updated_at": now_iso}})
    return user_doc


class PaymentPlanCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    billing_cycle: str = Field(..., pattern="^(weekly|monthly|quarterly|yearly)$")
    price: float = Field(..., ge=0)
    currency: str = "AED"
    includes_full_access: bool = False
    program_ids: List[str] = []


class PaymentPlanUpdate(BaseModel):
    name: Optional[str] = None
    billing_cycle: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    includes_full_access: Optional[bool] = None
    program_ids: Optional[List[str]] = None
    is_active: Optional[bool] = None


class AgreementCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    version: str = "1.0"
    content_html: str = ""
    pdf_url: Optional[str] = None


class AgreementUpdate(BaseModel):
    title: Optional[str] = None
    version: Optional[str] = None
    content_html: Optional[str] = None
    pdf_url: Optional[str] = None
    is_active: Optional[bool] = None


class SignAgreementRequest(BaseModel):
    agreement_id: str
    signature_data: Optional[str] = None  # Base64 image
    checkbox_agreed: bool = True
    signer_name: str = ""


class PaymentInitiate(BaseModel):
    member_id: str
    membership_id: str
    method: str = Field(..., description="Payment provider identifier")
    amount: float = Field(..., gt=0)
    currency: str = "AED"
    receipt_url: Optional[str] = None
    receipt_info: Optional[str] = None


class CashPaymentRecord(BaseModel):
    member_id: str
    membership_id: str
    amount: float = Field(..., gt=0)
    currency: str = "AED"
    receipt_info: str = ""
    receipt_url: Optional[str] = None


class PaymentUpdateStatus(BaseModel):
    status: str = Field(..., pattern="^(pending|approved|declined|paid|failed|refunded|cancelled|completed)$")
    notes: Optional[str] = None


class TransferRequest(BaseModel):
    member_id: str
    to_location_id: str
    reason: str = ""


class TransferAction(BaseModel):
    action: str = Field(..., pattern="^(approve|reject|complete)$")
    notes: str = ""


class ExpenseCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    category: str = ""
    amount: float = Field(..., ge=0)
    currency: str = "AED"
    expense_date: str
    note: str = ""


class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    expense_date: Optional[str] = None
    note: Optional[str] = None


# ─── Helper Functions ──────────────────────────────────────────────

async def get_user_location(user: dict, request: Request, param_name: str = "location_id") -> str:
    """Get location_id based on user role. Enforce location isolation."""
    role = user.get("role", "")
    
    if role == "OWNER" or role == "OWNER_FULL":
        lid = request.query_params.get(param_name)
        if not lid:
            raise HTTPException(400, f"{param_name} required for owner")
        owner_id = user["user_id"] if role == "OWNER" else user.get("owner_id")
        loc = await _db.locations.find_one({
            "location_id": lid, 
            "owner_id": owner_id, 
            "is_deleted": False
        })
        if not loc:
            raise HTTPException(403, "Location access denied")
        return lid
    
    # If the request contains a location_id (e.g. from query params), verify it matches the user's assigned location
    req_lid = request.query_params.get(param_name)
    user_lid = user.get("location_id")
    
    if req_lid and user_lid and req_lid != user_lid:
         raise HTTPException(403, "Cross-location access denied")

    if user_lid:
        return user_lid
        
    raise HTTPException(403, "Access denied: No location assigned")


async def require_member_access(request: Request, permission: str = None, allow_member_self: bool = False):
    """Require authenticated user with specific roles/permissions for member management."""
    user = await _get_current_user(request)
    role = user.get("role")
    
    if role == "CUSTOMER":
        raise HTTPException(403, "Access denied. Manager or Receptionist required.")
        
    if role == "MEMBER":
        if not allow_member_self:
            raise HTTPException(403, "Access denied for Member role.")
        return user
        
    if permission:
        from rbac import check_permission
        if role == "OWNER":
            return user
        if role == "OWNER_FULL":
            if not await check_permission(user, "owner.manage_members"):
                raise HTTPException(403, "Missing permission: owner.manage_members")
            return user
        if user.get("role") not in ("LOCATION_MANAGER",) and not await check_permission(user, permission):
            raise HTTPException(403, f"Missing permission: {permission}")
            
    return user


async def _allowed_member_ids_for_member_user(user: dict) -> List[str]:
    if user.get("role") != "MEMBER":
        return []
    primary_id = user.get("member_id")
    if not primary_id:
        return []
    linked = await _db.members.find(
        {"primary_member_id": primary_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "member_id": 1},
    ).to_list(200)
    ids = [primary_id] + [m.get("member_id") for m in linked if m.get("member_id")]
    return list(dict.fromkeys(ids))


async def _assert_member_scope(user: dict, member_id: str):
    if user.get("role") != "MEMBER":
        return
    allowed = await _allowed_member_ids_for_member_user(user)
    if member_id not in allowed:
        raise HTTPException(403, "Access denied")


async def _pick_active_agreement(location_id: str, agreement_id: Optional[str] = None) -> Optional[dict]:
    if agreement_id:
        return await _db.agreements.find_one(
            {"agreement_id": agreement_id, "location_id": location_id, "is_active": True},
            {"_id": 0},
        )
    return await _db.agreements.find_one(
        {"location_id": location_id, "is_active": True, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0},
        sort=[("updated_at", -1)],
    )


async def _create_signed_agreement_for_member(
    *,
    request: Request,
    location_id: str,
    member_id: str,
    agreement: dict,
    signer_name: str,
    checkbox_agreed: bool,
    signature_data: Optional[str],
    created_by_user_id: Optional[str],
) -> dict:
    signed_id = f"signed_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    client_ip = request.client.host if request.client else "unknown"
    signed_doc = {
        "signed_agreement_id": signed_id,
        "location_id": location_id,
        "agreement_id": agreement["agreement_id"],
        "member_id": member_id,
        "signed_at": now,
        "signature_data": signature_data,
        "checkbox_agreed": checkbox_agreed,
        "signed_ip": client_ip,
        "signer_name": signer_name,
        "document_snapshot": {
            "title": agreement.get("title"),
            "version": agreement.get("version"),
            "content_html": agreement.get("content_html"),
        },
        "created_at": now,
        "created_by_user_id": created_by_user_id,
    }
    await _db.signed_agreements.insert_one(signed_doc)
    signed_doc.pop("_id", None)
    return signed_doc


def _normalize_billing_cycle(value: Optional[str]) -> str:
    v = (value or "").strip().lower()
    if v == "quarterly":
        return "3 months"
    if v in ("annual",):
        return "yearly"
    return v or "monthly"


def _calc_end_date(start_date: str, billing_cycle: str) -> str:
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    end = start
    cycle = _normalize_billing_cycle(billing_cycle)
    if cycle in ("per class", "single", "daily"):
        end = start + timedelta(days=1)
    elif cycle == "weekly":
        end = start + timedelta(days=7)
    elif cycle == "monthly":
        end = start + relativedelta(months=1)
    elif cycle == "3 months":
        end = start + relativedelta(months=3)
    elif cycle == "4 months":
        end = start + relativedelta(months=4)
    elif cycle == "6 months":
        end = start + relativedelta(months=6)
    elif cycle == "yearly":
        end = start + relativedelta(years=1)
    else:
        end = start + relativedelta(months=1)
    return end.strftime("%Y-%m-%d")


def _normalize_membership_type(value: Optional[str]) -> str:
    v = (value or "").strip().lower()
    if v == "kids_program":
        return "kids"
    if v == "dedicated_program":
        return "full_access"
    return v


def _is_supported_membership_type(value: Optional[str]) -> bool:
    return _normalize_membership_type(value) in ("full_access", "only_gym", "kids")


async def _assert_primary_payer_for_target(user: dict, target_member_id: str, *, location_id: str):
    if user.get("role") != "MEMBER":
        return
    await _assert_member_scope(user, target_member_id)
    primary_member_id = user.get("member_id")
    if not primary_member_id:
        raise HTTPException(403, "Access denied")
    if target_member_id == primary_member_id:
        member = await _db.members.find_one({"member_id": primary_member_id, "location_id": location_id}, {"_id": 0, "primary_member_id": 1})
        if member and member.get("primary_member_id"):
            raise HTTPException(403, "Primary payer access required")
        return
    target = await _db.members.find_one({"member_id": target_member_id, "location_id": location_id}, {"_id": 0, "primary_member_id": 1})
    if not target or target.get("primary_member_id") != primary_member_id:
        raise HTTPException(403, "Primary payer access required")


async def generate_member_no(location_id: str) -> str:
    """Generate unique member number for a location."""
    # Format: SP-XXX-0001
    loc = await _db.locations.find_one({"location_id": location_id}, {"_id": 0, "name": 1})
    prefix = "GEN"
    if loc:
        name = loc["name"]
        # Extract meaningful prefix from location name
        # e.g., "Spartans - Sharjah (Maliha)" -> "MAL"
        if "(" in name and ")" in name:
            # Extract content in parentheses
            start = name.find("(") + 1
            end = name.find(")")
            prefix = name[start:end][:3].upper()
        elif "-" in name:
            # Take last part after dash
            parts = name.split("-")
            prefix = parts[-1].strip()[:3].upper()
        else:
            prefix = name[:3].upper()
    
    # Get next sequence number
    count = await _db.members.count_documents({"location_id": location_id})
    seq = count + 1
    return f"SP-{prefix}-{seq:04d}"


# ─── Members CRUD ──────────────────────────────────────────────────

@router.post("/members", status_code=201)
async def create_member(data: MemberCreate, request: Request, location_id: str = None):
    """Create a new member. Also creates a user account for portal access."""
    user = await require_member_access(request, "receptionist.create_members")
    location_id = await get_user_location(user, request)
    
    import sales_identity
    email_norm = sales_identity.norm_email(data.email)
    phone_norm = sales_identity.norm_phone(data.phone)

    # Check for duplicate email at this location
    if email_norm:
        existing = await _db.members.find_one({
            "location_id": location_id,
            "$and": [
                {"$or": [{"email_norm": email_norm}, {"email": {"$regex": f"^{re.escape(email_norm)}$", "$options": "i"}}]},
                {"$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
            ],
        })
        if existing:
            raise HTTPException(400, "Member with this email already exists at this location")
    
    member_id = f"member_{uuid.uuid4().hex[:12]}"
    member_no = await generate_member_no(location_id)
    now = datetime.now(timezone.utc).isoformat()
    
    # Get owner_id for the location
    loc = await _db.locations.find_one({"location_id": location_id}, {"_id": 0, "owner_id": 1})
    owner_id = loc["owner_id"] if loc else user.get("owner_id") or user["user_id"]
    
    member_doc = {
        "member_id": member_id,
        "location_id": location_id,
        "member_no": member_no,
        "primary_member_id": None,
        "relationship": "",
        "dependent_type": None,
        "full_name": data.full_name,
        "gender": data.gender,
        "dob": data.dob,
        "phone": data.phone,
        "phone_norm": phone_norm,
        "email": data.email,
        "email_norm": email_norm,
        "address": data.address,
        "emergency_contact": data.emergency_contact.model_dump(),
        "medical": data.medical.model_dump(),
        "profile_photo_url": data.profile_photo_url,
        "terms_accepted_at": now if data.accept_terms else None,
        "terms_signed_agreement_id": None,
        "is_active": True,
        "deleted_at": None,
        "created_by_user_id": user["user_id"],
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.members.insert_one(member_doc)
    await _create_accepted_terms_for_member(
        member_id=member_id,
        location_id=location_id,
        accepted_at=now,
        created_by_user_id=None,
    )
    
    # Create user account for portal access (if email provided)
    user_id = None
    temp_password = None
    if data.email:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        raw_password = (data.password or "").strip()
        if raw_password:
            if len(raw_password) < 6:
                raise HTTPException(400, "Password must be at least 6 characters")
        else:
            temp_password = secrets.token_urlsafe(8)
            raw_password = temp_password
        user_doc = {
            "user_id": user_id,
            "email": data.email,
            "name": data.full_name,
            "password_hash": _pwd_context.hash(raw_password),
            "picture": data.profile_photo_url,
            "role": "MEMBER",
            "location_id": location_id,
            "owner_id": owner_id,
            "member_id": member_id,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await _db.users.insert_one(user_doc)
        
        # Update member with user_id reference
        await _db.members.update_one(
            {"member_id": member_id},
            {"$set": {"user_id": user_id}}
        )
    
    if data.accept_terms:
        agreement = await _pick_active_agreement(location_id, data.agreement_id)
        if agreement:
            signed = await _create_signed_agreement_for_member(
                request=request,
                location_id=location_id,
                member_id=member_id,
                agreement=agreement,
                signer_name=data.full_name,
                checkbox_agreed=True,
                signature_data=None,
                created_by_user_id=user.get("user_id"),
            )
            await _db.members.update_one(
                {"member_id": member_id},
                {"$set": {"terms_signed_agreement_id": signed["signed_agreement_id"]}},
            )
            member_doc["terms_signed_agreement_id"] = signed["signed_agreement_id"]

    member_doc.pop("_id", None)
    member_doc["user_id"] = user_id
    member_doc["temp_password"] = temp_password  # Returned only when password is generated server-side
    
    return member_doc


@router.get("/members")
async def list_members(
    request: Request,
    status: str = Query("active", pattern="^(active|inactive|deleted|all)$"),
    search: str = None,
    skip: int = 0,
    limit: int = 50,
    location_id: str = None
):
    """List members for a location with filters."""
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    query = {"location_id": location_id}
    
    # Status filter
    if status == "active":
        query["is_active"] = True
        query["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    elif status == "inactive":
        query["is_active"] = False
        query["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    elif status == "deleted":
        query["deleted_at"] = {"$ne": None}
    # "all" = no status filter
    
    # Search filter
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"member_no": {"$regex": search, "$options": "i"}},
        ]
    
    total = await _db.members.count_documents(query)
    
    # Get counts for different statuses
    base_query = {"location_id": location_id}
    if search:
        base_query["$or"] = query["$or"]
        
    active_count = await _db.members.count_documents({
        **base_query, 
        "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    
    inactive_count = await _db.members.count_documents({
        **base_query, 
        "is_active": False,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    
    deleted_count = await _db.members.count_documents({
        **base_query,
        "deleted_at": {"$ne": None}
    })
    
    all_count = await _db.members.count_documents(base_query)
    
    # Strict projection to fetch only necessary fields for the list view
    projection = {
        "_id": 0,
        "member_id": 1,
        "member_no": 1,
        "full_name": 1,
        "email": 1,
        "phone": 1,
        "gender": 1,
        "is_active": 1,
        "created_at": 1,
        "profile_photo_url": 1
    }
    members = await _db.members.find(query, projection).skip(skip).limit(limit).to_list(limit)
    
    if not members:
        return {
            "members": [], 
            "total": total, 
            "skip": skip, 
            "limit": limit,
            "counts": {
                "active": active_count,
                "inactive": inactive_count,
                "deleted": deleted_count,
                "all": all_count
            }
        }
        
    member_ids = [m["member_id"] for m in members]
    
    membership_pipeline = [
        {"$match": {
            "member_id": {"$in": member_ids},
            "location_id": location_id,
            "status": {"$in": ["active", "pending", "past_due", "expired", "cancelled"]}
        }},
        {"$facet": {
            "current": [
                {"$match": {"status": {"$in": ["active", "pending", "past_due"]}}},
                {"$sort": {"end_date": -1, "created_at": -1}},
                {"$group": {
                    "_id": "$member_id",
                    "membership_id": {"$first": "$membership_id"},
                    "type": {"$first": "$type"},
                    "status": {"$first": "$status"},
                    "program_id": {"$first": "$program_id"},
                    "payment_plan_id": {"$first": "$payment_plan_id"},
                    "start_date": {"$first": "$start_date"},
                    "end_date": {"$first": "$end_date"},
                    "auto_renew": {"$first": "$auto_renew"},
                }}
            ],
            "last_active": [
                {"$match": {"status": {"$in": ["active", "expired", "past_due"]}}},
                {"$sort": {"end_date": -1, "created_at": -1}},
                {"$group": {
                    "_id": "$member_id",
                    "membership_id": {"$first": "$membership_id"},
                    "type": {"$first": "$type"},
                    "status": {"$first": "$status"},
                    "program_id": {"$first": "$program_id"},
                    "payment_plan_id": {"$first": "$payment_plan_id"},
                    "start_date": {"$first": "$start_date"},
                    "end_date": {"$first": "$end_date"},
                    "auto_renew": {"$first": "$auto_renew"},
                }}
            ]
        }}
    ]
    membership_agg = await _db.memberships.aggregate(membership_pipeline).to_list(1)
    membership_agg = membership_agg[0] if membership_agg else {"current": [], "last_active": []}
    current_memberships = membership_agg.get("current") or []
    last_active_memberships = membership_agg.get("last_active") or []
    current_by_member = {m["_id"]: m for m in current_memberships}
    last_active_by_member = {m["_id"]: m for m in last_active_memberships}
    plan_ids = set()
    membership_ids = set()
    for mem in current_memberships:
        pid = mem.get("payment_plan_id")
        if pid:
            plan_ids.add(pid)
        mid = mem.get("membership_id")
        if mid:
            membership_ids.add(mid)
    for mem in last_active_memberships:
        pid = mem.get("payment_plan_id")
        if pid:
            plan_ids.add(pid)
        mid = mem.get("membership_id")
        if mid:
            membership_ids.add(mid)
    plan_name_by_id = {}
    if plan_ids:
        plans = await _db.pricing_plans.find(
            {"location_id": location_id, "plan_id": {"$in": list(plan_ids)}},
            {"_id": 0, "plan_id": 1, "name": 1},
        ).to_list(None)
        plan_name_by_id = {p.get("plan_id"): p.get("name") for p in plans if p.get("plan_id")}
    
    payments_by_membership = {}
    if membership_ids:
        payment_pipeline = [
            {"$match": {"location_id": location_id, "membership_id": {"$in": list(membership_ids)}}},
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": "$membership_id",
                "latest_status": {"$first": "$status"},
                "has_success": {"$max": {"$cond": [{"$in": ["$status", list(membership_status.SUCCESS_PAYMENT_STATUSES)]}, 1, 0]}},
            }},
        ]
        payments = await _db.payments.aggregate(payment_pipeline).to_list(None)
        payments_by_membership = {p["_id"]: p for p in payments if p.get("_id")}
    
    # Map the bulk data back to the members list
    for m in members:
        m_id = m["member_id"]
        current_mem = current_by_member.get(m_id)
        if current_mem:
            pay_info = payments_by_membership.get(current_mem.get("membership_id")) or {}
            effective_status = membership_status.compute_effective_membership_status(
                current_mem,
                has_success_payment=bool(pay_info.get("has_success")),
                latest_payment_status=pay_info.get("latest_status"),
            )
            if effective_status and effective_status != current_mem.get("status"):
                await _db.memberships.update_one(
                    {"membership_id": current_mem.get("membership_id"), "location_id": location_id},
                    {"$set": {"status": effective_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
                current_mem["status"] = effective_status

            m["active_membership"] = {
                "membership_id": current_mem.get("membership_id"),
                "type": current_mem.get("type"),
                "status": current_mem.get("status"),
                "program_id": current_mem.get("program_id"),
                "payment_plan_id": current_mem.get("payment_plan_id"),
                "payment_plan_name": plan_name_by_id.get(current_mem.get("payment_plan_id")),
            }

            latest_payment_status = pay_info.get("latest_status")
            if latest_payment_status:
                m["active_membership"]["payment_status"] = latest_payment_status

            m["membership_status"] = current_mem.get("status")

        last_mem = last_active_by_member.get(m_id)
        if (not current_mem) and last_mem:
            pay_info = payments_by_membership.get(last_mem.get("membership_id")) or {}
            effective_status = membership_status.compute_effective_membership_status(
                last_mem,
                has_success_payment=bool(pay_info.get("has_success")),
                latest_payment_status=pay_info.get("latest_status"),
            )
            if effective_status and effective_status != last_mem.get("status"):
                await _db.memberships.update_one(
                    {"membership_id": last_mem.get("membership_id"), "location_id": location_id},
                    {"$set": {"status": effective_status, "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
                last_mem["status"] = effective_status

            m["active_membership"] = {
                "membership_id": last_mem.get("membership_id"),
                "type": last_mem.get("type"),
                "status": last_mem.get("status"),
                "program_id": last_mem.get("program_id"),
                "payment_plan_id": last_mem.get("payment_plan_id"),
                "payment_plan_name": plan_name_by_id.get(last_mem.get("payment_plan_id")),
            }
            latest_payment_status = pay_info.get("latest_status")
            if latest_payment_status:
                m["active_membership"]["payment_status"] = latest_payment_status

            m["membership_status"] = last_mem.get("status")

        plan_mem = current_mem if (current_mem and (current_mem.get("status") == "active")) else last_mem

        if plan_mem:
            plan_name = plan_name_by_id.get(plan_mem.get("payment_plan_id"))
            if plan_name:
                m["plan_name"] = plan_name
                m["plan_membership_status"] = plan_mem.get("status")
    
    return {
        "members": members, 
        "total": total, 
        "skip": skip, 
        "limit": limit,
        "counts": {
            "active": active_count,
            "inactive": inactive_count,
            "deleted": deleted_count,
            "all": all_count
        }
    }


@router.get("/members/{member_id}")
async def get_member(member_id: str, request: Request, location_id: str = None):
    """Get a single member by ID."""
    user = await require_member_access(request, "receptionist.view_members", allow_member_self=True)
    # Important: The frontend might pass location_id as a query param, but we should use the one from the user's role 
    # to ensure they are looking at their own location
    loc_id = await get_user_location(user, request)
    
    await _assert_member_scope(user, member_id)
    
    # Also support searching by exact member_no since frontend passes it sometimes
    member = await _db.members.find_one({
        "$or": [
            {"member_id": member_id},
            {"member_no": member_id}
        ],
        "location_id": loc_id
    }, {"_id": 0})
    
    if not member:
        # Fallback to check if it exists in another location, to give a better error
        other_loc = await _db.members.find_one({
            "$or": [
                {"member_id": member_id},
                {"member_no": member_id}
            ]
        })
        if other_loc:
            raise HTTPException(403, "Member belongs to a different location")
        raise HTTPException(404, "Member not found")
    
    return member


@router.patch("/members/{member_id}")
async def update_member(member_id: str, data: MemberUpdate, request: Request, location_id: str = None):
    """Update member details."""
    user = await require_member_access(request, "receptionist.edit_members_basic", allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    # Members can only update limited fields on themselves
    member_self_fields = {"phone", "address", "emergency_contact", "profile_photo_url"}
    
    if user["role"] == "MEMBER":
        await _assert_member_scope(user, member_id)
        # Check if trying to update restricted fields
        update_fields = {k for k, v in data.model_dump().items() if v is not None}
        restricted = update_fields - member_self_fields
        if restricted:
            raise HTTPException(403, f"Cannot update fields: {restricted}")
    
    existing = await _db.members.find_one({
        "member_id": member_id,
        "location_id": location_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Member not found")
    
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            if k in ("emergency_contact", "medical") and isinstance(v, dict):
                updates[k] = v
            else:
                updates[k] = v
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.members.update_one({"member_id": member_id}, {"$set": updates})
    
    # Sync user account if email/name changed
    if "email" in updates or "full_name" in updates or "profile_photo_url" in updates:
        user_updates = {"updated_at": updates["updated_at"]}
        if "email" in updates:
            user_updates["email"] = updates["email"]
        if "full_name" in updates:
            user_updates["name"] = updates["full_name"]
        if "profile_photo_url" in updates:
            user_updates["picture"] = updates["profile_photo_url"]
        await _db.users.update_one({"member_id": member_id}, {"$set": user_updates})
    
    return await _db.members.find_one({"member_id": member_id}, {"_id": 0})


@router.patch("/members/{member_id}/portal-password")
async def set_member_portal_password(member_id: str, data: MemberPortalPasswordSet, request: Request, location_id: str = None):
    user = await require_member_access(request, "receptionist.edit_members_basic")
    location_id = await get_user_location(user, request)

    member = await _db.members.find_one({"member_id": member_id, "location_id": location_id}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")

    now_iso = datetime.now(timezone.utc).isoformat()
    user_doc = await _get_or_create_member_user_for_portal(member, location_id=location_id, owner_id=user.get("owner_id"), now_iso=now_iso)
    await _db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"password_hash": _pwd_context.hash(data.password), "updated_at": now_iso}})
    return {"message": "Password updated"}


@router.post("/members/{member_id}/portal-password/reset")
async def reset_member_portal_password(member_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, "receptionist.edit_members_basic")
    location_id = await get_user_location(user, request)

    member = await _db.members.find_one({"member_id": member_id, "location_id": location_id}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")

    temp_password = secrets.token_urlsafe(8)
    now_iso = datetime.now(timezone.utc).isoformat()
    user_doc = await _get_or_create_member_user_for_portal(member, location_id=location_id, owner_id=user.get("owner_id"), now_iso=now_iso)
    await _db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"password_hash": _pwd_context.hash(temp_password), "updated_at": now_iso}})
    return {"temp_password": temp_password}


@router.get("/member/profiles")
async def list_member_profiles(request: Request):
    user = await require_member_access(request, allow_member_self=True)
    if user.get("role") != "MEMBER":
        raise HTTPException(403, "Member access only")
    location_id = await get_user_location(user, request)
    allowed = await _allowed_member_ids_for_member_user(user)
    profiles = await _db.members.find(
        {"member_id": {"$in": allowed}, "location_id": location_id},
        {"_id": 0, "member_id": 1, "full_name": 1, "gender": 1, "phone": 1, "email": 1, "profile_photo_url": 1, "primary_member_id": 1, "relationship": 1, "dependent_type": 1, "member_no": 1},
    ).to_list(200)
    for p in profiles:
        p["is_primary"] = not p.get("primary_member_id")
    return {"profiles": profiles}


@router.get("/member/primary-contact")
async def get_member_primary_contact(request: Request):
    user = await require_member_access(request, allow_member_self=True)
    if user.get("role") != "MEMBER":
        raise HTTPException(403, "Member access only")
    location_id = await get_user_location(user, request)
    member_id = user.get("member_id")
    if not member_id:
        raise HTTPException(400, "Member not found")
    me = await _db.members.find_one({"member_id": member_id, "location_id": location_id}, {"_id": 0, "primary_member_id": 1})
    primary_id = me.get("primary_member_id") if me else None
    if not primary_id:
        return {"primary": None}
    primary = await _db.members.find_one(
        {"member_id": primary_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "member_id": 1, "full_name": 1, "phone": 1, "email": 1},
    )
    return {"primary": primary}


@router.post("/member/accept-terms")
async def member_accept_terms(request: Request):
    user = await require_member_access(request, allow_member_self=True)
    if user.get("role") != "MEMBER":
        raise HTTPException(403, "Member access only")
    location_id = await get_user_location(user, request)
    member_id = user.get("member_id")
    if not member_id:
        raise HTTPException(400, "Member not found")

    member = await _db.members.find_one(
        {"member_id": member_id, "location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "member_id": 1, "full_name": 1, "terms_accepted_at": 1, "terms_signed_agreement_id": 1},
    )
    if not member:
        raise HTTPException(404, "Member not found")

    now = datetime.now(timezone.utc).isoformat()
    updates = {"updated_at": now}

    if not member.get("terms_accepted_at"):
        updates["terms_accepted_at"] = now

    latest_terms = await _db.accepted_terms.find(
        {"member_id": member_id, "location_id": location_id},
        {"_id": 0, "document_snapshot.version": 1},
    ).sort("accepted_at", -1).limit(1).to_list(1)
    current_terms = await _get_terms_page_snapshot()
    latest_version = (latest_terms[0].get("document_snapshot") or {}).get("version") if latest_terms else None
    current_version = current_terms.get("version") if current_terms else None
    if current_version and current_version != latest_version:
        await _create_accepted_terms_for_member(
            member_id=member_id,
            location_id=location_id,
            accepted_at=now,
            created_by_user_id=user.get("user_id"),
        )

    signed_id = member.get("terms_signed_agreement_id")
    if not signed_id:
        agreement = await _pick_active_agreement(location_id)
        if agreement:
            signed = await _create_signed_agreement_for_member(
                request=request,
                location_id=location_id,
                member_id=member_id,
                agreement=agreement,
                signer_name=member.get("full_name") or "",
                checkbox_agreed=True,
                signature_data=None,
                created_by_user_id=user.get("user_id"),
            )
            updates["terms_signed_agreement_id"] = signed["signed_agreement_id"]

    if len(updates) == 1:
        return {
            "member_id": member_id,
            "terms_accepted_at": member.get("terms_accepted_at"),
            "terms_signed_agreement_id": member.get("terms_signed_agreement_id"),
        }

    await _db.members.update_one({"member_id": member_id, "location_id": location_id}, {"$set": updates})
    updated = await _db.members.find_one(
        {"member_id": member_id, "location_id": location_id},
        {"_id": 0, "member_id": 1, "terms_accepted_at": 1, "terms_signed_agreement_id": 1},
    )
    return updated


@router.post("/member/profiles", status_code=201)
async def create_linked_profile(data: LinkedProfileCreate, request: Request):
    user = await require_member_access(request, allow_member_self=True)
    if user.get("role") != "MEMBER":
        raise HTTPException(403, "Member access only")
    location_id = await get_user_location(user, request)

    primary_member_id = user.get("member_id")
    if not primary_member_id:
        raise HTTPException(400, "Primary member not found")

    await _assert_primary_payer_for_target(user, primary_member_id, location_id=location_id)

    dependent_email = (data.email or "").strip().lower()
    if not dependent_email:
        dependent_email = f"member_{uuid.uuid4().hex[:10]}@dependents.spartans.local"
    existing = await _db.members.find_one({
        "location_id": location_id,
        "email": dependent_email,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    existing_user = await _db.users.find_one({"email": dependent_email}, {"_id": 0, "user_id": 1})
    if existing or existing_user:
        raise HTTPException(400, "Member with this email already exists at this location")

    member_id = f"member_{uuid.uuid4().hex[:12]}"
    member_no = await generate_member_no(location_id)
    now = datetime.now(timezone.utc).isoformat()

    raw_password = (data.password or "").strip()
    if raw_password:
        if len(raw_password) < 6:
            raise HTTPException(400, "Password must be at least 6 characters")
        temp_password = None
    else:
        temp_password = secrets.token_urlsafe(8)
        raw_password = temp_password

    member_doc = {
        "member_id": member_id,
        "location_id": location_id,
        "member_no": member_no,
        "primary_member_id": primary_member_id,
        "relationship": data.relationship or "",
        "dependent_type": data.dependent_type,
        "full_name": data.full_name,
        "gender": data.gender,
        "dob": "",
        "phone": data.phone,
        "email": dependent_email,
        "address": data.address,
        "emergency_contact": EmergencyContact().model_dump(),
        "medical": MedicalInfo().model_dump(),
        "profile_photo_url": data.profile_photo_url,
        "terms_accepted_at": now,
        "terms_signed_agreement_id": None,
        "is_active": True,
        "deleted_at": None,
        "created_by_user_id": user.get("user_id"),
        "created_at": now,
        "updated_at": now,
    }

    await _db.members.insert_one(member_doc)

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": dependent_email,
        "name": data.full_name,
        "password_hash": _pwd_context.hash(raw_password),
        "picture": data.profile_photo_url,
        "role": "MEMBER",
        "location_id": location_id,
        "owner_id": user.get("owner_id"),
        "member_id": member_id,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await _db.users.insert_one(user_doc)
    await _db.members.update_one({"member_id": member_id}, {"$set": {"user_id": user_id}})
    member_doc["user_id"] = user_id
    member_doc["temp_password"] = temp_password

    agreement = await _pick_active_agreement(location_id)
    if agreement:
        signed = await _create_signed_agreement_for_member(
            request=request,
            location_id=location_id,
            member_id=member_id,
            agreement=agreement,
            signer_name=data.full_name,
            checkbox_agreed=True,
            signature_data=None,
            created_by_user_id=user.get("user_id"),
        )
        await _db.members.update_one(
            {"member_id": member_id},
            {"$set": {"terms_signed_agreement_id": signed["signed_agreement_id"]}},
        )
        member_doc["terms_signed_agreement_id"] = signed["signed_agreement_id"]

    member_doc.pop("_id", None)
    return member_doc


@router.patch("/members/{member_id}/activate")
async def activate_member(member_id: str, request: Request, location_id: str = None):
    """Activate a member."""
    user = await require_member_access(request, "manager.manage_members")
    location_id = await get_user_location(user, request)
    
    existing = await _db.members.find_one({
        "member_id": member_id,
        "location_id": location_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Member not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.members.update_one(
        {"member_id": member_id},
        {"$set": {"is_active": True, "updated_at": now}}
    )
    
    # Also activate user account
    await _db.users.update_one(
        {"member_id": member_id},
        {"$set": {"is_active": True, "updated_at": now}}
    )
    
    return {"message": "Member activated"}


@router.patch("/members/{member_id}/deactivate")
async def deactivate_member(member_id: str, request: Request, location_id: str = None):
    """Deactivate a member."""
    user = await require_member_access(request, "manager.manage_members")
    location_id = await get_user_location(user, request)
    
    existing = await _db.members.find_one({
        "member_id": member_id,
        "location_id": location_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Member not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.members.update_one(
        {"member_id": member_id},
        {"$set": {"is_active": False, "updated_at": now}}
    )
    
    # Also deactivate user account
    await _db.users.update_one(
        {"member_id": member_id},
        {"$set": {"is_active": False, "updated_at": now}}
    )
    
    return {"message": "Member deactivated"}


@router.delete("/members/{member_id}")
async def delete_member(member_id: str, request: Request, location_id: str = None):
    """Soft delete a member."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    existing = await _db.members.find_one({
        "member_id": member_id,
        "location_id": location_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not existing:
        raise HTTPException(404, "Member not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.members.update_one(
        {"member_id": member_id},
        {"$set": {"deleted_at": now, "is_active": False, "updated_at": now}}
    )
    
    # Also soft-delete user account
    await _db.users.update_one(
        {"member_id": member_id},
        {"$set": {"is_active": False, "deleted_at": now, "updated_at": now}}
    )
    
    return {"message": "Member deleted"}


@router.post("/members/{member_id}/restore")
async def restore_member(member_id: str, request: Request, location_id: str = None):
    """Restore a soft-deleted member."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    existing = await _db.members.find_one({
        "member_id": member_id,
        "location_id": location_id,
        "deleted_at": {"$ne": None}
    })
    if not existing:
        raise HTTPException(404, "Deleted member not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.members.update_one(
        {"member_id": member_id},
        {"$set": {"deleted_at": None, "is_active": True, "updated_at": now}}
    )
    
    # Also restore user account
    await _db.users.update_one(
        {"member_id": member_id},
        {"$set": {"is_active": True, "deleted_at": None, "updated_at": now}}
    )
    
    return await _db.members.find_one({"member_id": member_id}, {"_id": 0})


# ─── Memberships CRUD ──────────────────────────────────────────────

@router.post("/members/{member_id}/memberships", status_code=201)
async def create_membership(member_id: str, data: MembershipCreate, request: Request, location_id: str = None):
    """Create a new membership for a member. Status starts as 'pending'."""
    user = await require_member_access(request, "receptionist.create_memberships", allow_member_self=True)
    location_id = await get_user_location(user, request)

    await _assert_member_scope(user, member_id)
    
    # Verify member exists
    member = await _db.members.find_one({
        "member_id": member_id,
        "location_id": location_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not member:
        raise HTTPException(404, "Member not found")

    if user.get("role") == "MEMBER":
        if not member.get("terms_accepted_at"):
            raise HTTPException(400, "Terms & Conditions must be accepted")

    normalized_type = _normalize_membership_type(data.type)
    if (data.type or "").strip().lower() == "dedicated_program":
        raise HTTPException(400, "Dedicated Program membership is no longer supported")
    if not _is_supported_membership_type(normalized_type):
        raise HTTPException(400, "Invalid membership type")

    await _assert_primary_payer_for_target(user, member_id, location_id=location_id)
    
    membership_id = f"membership_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Get freeze rules from the selected payment plan
    freeze_max_days = 60  # Legacy fallback
    freeze_max_uses = 2   # Legacy fallback
    billing_cycle = "monthly"
    
    if data.payment_plan_id:
        plan = await _db.pricing_plans.find_one({"plan_id": data.payment_plan_id})
        if plan:
            plan_type_raw = plan.get("membership_type")
            if plan_type_raw:
                plan_type = _normalize_membership_type(plan_type_raw)
                if plan_type != normalized_type:
                    raise HTTPException(400, "Selected payment plan does not match membership type")
            freeze_max_days = plan.get("freeze_max_days", 60)
            freeze_max_uses = plan.get("freeze_max_uses", 2)
            billing_cycle = plan.get("billing_cycle") or plan.get("billing_period") or "monthly"

    end_date = data.end_date or _calc_end_date(data.start_date, billing_cycle)

    signed_agreement_id = member.get("terms_signed_agreement_id")
    if not signed_agreement_id:
        latest = await _db.signed_agreements.find_one(
            {"member_id": member_id, "location_id": location_id},
            {"_id": 0, "signed_agreement_id": 1},
            sort=[("signed_at", -1)],
        )
        signed_agreement_id = latest.get("signed_agreement_id") if latest else None
            
    membership_doc = {
        "membership_id": membership_id,
        "location_id": location_id,
        "member_id": member_id,
        "type": normalized_type,
        "program_id": None,
        "program_ids": [],
        "start_date": data.start_date,
        "end_date": end_date,
        "base_end_date": end_date,
        "payment_plan_id": data.payment_plan_id,
        "status": "pending",  # pending until payment + agreement
        "auto_renew": data.auto_renew,
        "freeze_max_days": freeze_max_days,
        "freeze_max_uses": freeze_max_uses,
        "next_renewal_date": end_date if data.auto_renew else None,
        "recurring_provider": None,
        "recurring_token": None,
        "last_renewal_attempt": None,
        "renewal_status": None,
        "renewal_error": None,
        "signed_agreement_id": signed_agreement_id,
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.memberships.insert_one(membership_doc)
    membership_doc.pop("_id", None)
    
    return membership_doc


@router.get("/memberships")
async def list_memberships(
    request: Request,
    member_id: str = None,
    status: str = None,
    skip: int = 0,
    limit: int = 50,
    location_id: str = None
):
    """List memberships for a location."""
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    query = {"location_id": location_id}
    
    # Members can only see their own
    if user["role"] == "MEMBER":
        query["member_id"] = {"$in": await _allowed_member_ids_for_member_user(user)}
    elif member_id:
        query["member_id"] = member_id
    
    if status:
        query["status"] = status
    
    total = await _db.memberships.count_documents(query)
    memberships = await _db.memberships.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    membership_ids = [m.get("membership_id") for m in memberships if m.get("membership_id")]
    payments_by_membership = {}
    if membership_ids:
        payment_agg = await _db.payments.aggregate([
            {"$match": {"location_id": location_id, "membership_id": {"$in": membership_ids}}},
            {"$sort": {"created_at": -1}},
            {"$group": {
                "_id": "$membership_id",
                "latest_status": {"$first": "$status"},
                "has_success": {"$max": {"$cond": [{"$in": ["$status", list(membership_status.SUCCESS_PAYMENT_STATUSES)]}, 1, 0]}},
            }},
        ]).to_list(None)
        payments_by_membership = {p["_id"]: p for p in payment_agg if p.get("_id")}
    
    # Enrich with member names and plan details
    for m in memberships:
        m["type"] = _normalize_membership_type(m.get("type"))
        member = await _db.members.find_one({"member_id": m["member_id"]}, {"_id": 0, "full_name": 1, "member_no": 1})
        m["member_name"] = member["full_name"] if member else "Unknown"
        m["member_no"] = member.get("member_no", "") if member else ""
        
        # Enrich plan details
        if m.get("payment_plan_id"):
            plan = await _db.pricing_plans.find_one({"plan_id": m["payment_plan_id"]})
            if plan:
                m["payment_plan_name"] = f"{plan.get('name', 'Unknown Plan')} ({plan.get('currency', 'AED')} {plan.get('price', 0)} / {plan.get('billing_cycle', 'month')})"

        pay_info = payments_by_membership.get(m.get("membership_id")) or {}
        latest_payment_status = pay_info.get("latest_status")
        has_success = bool(pay_info.get("has_success"))
        effective_status = membership_status.compute_effective_membership_status(
            m,
            now=now_dt,
            has_success_payment=has_success,
            latest_payment_status=latest_payment_status,
        )
        m["status_raw"] = m.get("status")
        m["payment_status"] = latest_payment_status
        if effective_status and effective_status != m.get("status"):
            await _db.memberships.update_one(
                {"membership_id": m.get("membership_id"), "location_id": location_id},
                {"$set": {"status": effective_status, "updated_at": now_iso}},
            )
            m["status"] = effective_status
    
    return {"memberships": memberships, "total": total}


@router.get("/memberships/{membership_id}")
async def get_membership(membership_id: str, request: Request, location_id: str = None):
    """Get a single membership."""
    user = await require_member_access(request, "receptionist.view_members", allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    membership = await _db.memberships.find_one({
        "membership_id": membership_id,
        "location_id": location_id
    }, {"_id": 0})
    
    if not membership:
        raise HTTPException(404, "Membership not found")
    
    membership["type"] = _normalize_membership_type(membership.get("type"))
    await _assert_member_scope(user, membership.get("member_id"))
        
    # Enrich plan details
    if membership.get("payment_plan_id"):
        plan = await _db.pricing_plans.find_one({"plan_id": membership["payment_plan_id"]})
        if plan:
            membership["payment_plan_name"] = f"{plan.get('name', 'Unknown Plan')} ({plan.get('currency', 'AED')} {plan.get('price', 0)} / {plan.get('billing_cycle', 'month')})"

    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    payment_agg = await _db.payments.aggregate([
        {"$match": {"location_id": location_id, "membership_id": membership_id}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$membership_id",
            "latest_status": {"$first": "$status"},
            "has_success": {"$max": {"$cond": [{"$in": ["$status", list(membership_status.SUCCESS_PAYMENT_STATUSES)]}, 1, 0]}},
        }},
    ]).to_list(1)
    pay_info = payment_agg[0] if payment_agg else {}
    latest_payment_status = pay_info.get("latest_status")
    has_success = bool(pay_info.get("has_success"))
    effective_status = membership_status.compute_effective_membership_status(
        membership,
        now=now_dt,
        has_success_payment=has_success,
        latest_payment_status=latest_payment_status,
    )
    membership["status_raw"] = membership.get("status")
    membership["payment_status"] = latest_payment_status
    if effective_status and effective_status != membership.get("status"):
        await _db.memberships.update_one(
            {"membership_id": membership_id, "location_id": location_id},
            {"$set": {"status": effective_status, "updated_at": now_iso}},
        )
        membership["status"] = effective_status
    
    return membership


@router.patch("/memberships/{membership_id}")
async def update_membership(membership_id: str, data: MembershipUpdate, request: Request, location_id: str = None):
    """Update membership details."""
    user = await require_member_access(request, "receptionist.edit_members_basic", allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    existing = await _db.memberships.find_one({
        "membership_id": membership_id,
        "location_id": location_id
    })
    if not existing:
        raise HTTPException(404, "Membership not found")

    await _assert_member_scope(user, existing.get("member_id"))
    await _assert_primary_payer_for_target(user, existing.get("member_id"), location_id=location_id)
    
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if user.get("role") == "MEMBER":
        allowed_fields = {"auto_renew"}
        blocked = set(updates.keys()) - allowed_fields
        if blocked:
            raise HTTPException(403, "Members can only update auto-renew")

    if "type" in updates:
        raw = (updates.get("type") or "").strip().lower()
        if raw == "dedicated_program":
            raise HTTPException(400, "Dedicated Program membership is no longer supported")
        normalized_type = _normalize_membership_type(raw)
        if not _is_supported_membership_type(normalized_type):
            raise HTTPException(400, "Invalid membership type")
        updates["type"] = normalized_type
    
    # Handle auto_renew toggle specifically to manage next_renewal_date
    if "auto_renew" in updates:
        if updates["auto_renew"] and not existing.get("auto_renew"):
            updates["next_renewal_date"] = existing.get("end_date")
        elif not updates["auto_renew"]:
            updates["next_renewal_date"] = None
            
    # Update freeze limits if payment plan changes
    if "payment_plan_id" in updates and updates["payment_plan_id"] != existing.get("payment_plan_id"):
        plan = await _db.pricing_plans.find_one({"plan_id": updates["payment_plan_id"]})
        if plan:
            target_type = updates.get("type") or _normalize_membership_type(existing.get("type"))
            plan_type_raw = plan.get("membership_type")
            if plan_type_raw and _normalize_membership_type(plan_type_raw) != target_type:
                raise HTTPException(400, "Selected payment plan does not match membership type")
            updates["freeze_max_days"] = plan.get("freeze_max_days", 60)
            updates["freeze_max_uses"] = plan.get("freeze_max_uses", 2)
            
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # If end_date is manually updated via UI, it becomes the new base_end_date
    if "end_date" in updates:
        updates["base_end_date"] = updates["end_date"]
        # If auto renew is active, also adjust next_renewal_date
        if existing.get("auto_renew") or updates.get("auto_renew"):
            updates["next_renewal_date"] = updates["end_date"]
    
    await _db.memberships.update_one({"membership_id": membership_id}, {"$set": updates})
    
    # Recalculate if we just updated the base_end_date so freezes still apply
    if "end_date" in updates:
        await recalculate_membership_end_date(membership_id)
    
    return await _db.memberships.find_one({"membership_id": membership_id}, {"_id": 0})


@router.post("/memberships/{membership_id}/activate")
async def activate_membership(membership_id: str, request: Request, location_id: str = None):
    """
    Activate a membership. Requires:
    - signed_agreement_id is set
    - At least one successful payment exists
    """
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    membership = await _db.memberships.find_one({
        "membership_id": membership_id,
        "location_id": location_id
    })
    if not membership:
        raise HTTPException(404, "Membership not found")

    await _assert_member_scope(user, membership.get("member_id"))
    
    # Check requirements
    if not membership.get("signed_agreement_id"):
        member = await _db.members.find_one({"member_id": membership.get("member_id"), "location_id": location_id}, {"_id": 0})
        signed_agreement_id = member.get("terms_signed_agreement_id") if member else None
        if not signed_agreement_id:
            latest = await _db.signed_agreements.find_one(
                {"member_id": membership.get("member_id"), "location_id": location_id},
                {"_id": 0, "signed_agreement_id": 1},
                sort=[("signed_at", -1)],
            )
            signed_agreement_id = latest.get("signed_agreement_id") if latest else None
        if not signed_agreement_id:
            raise HTTPException(400, "Agreement must be signed before activation")
        await _db.memberships.update_one(
            {"membership_id": membership_id},
            {"$set": {"signed_agreement_id": signed_agreement_id}},
        )
        membership["signed_agreement_id"] = signed_agreement_id
    
    # Check for at least one paid payment
    paid_payment = await _db.payments.find_one({
        "membership_id": membership_id,
        "status": {"$in": ["paid", "approved", "completed"]}
    })
    if not paid_payment:
        raise HTTPException(400, "At least one payment must be completed before activation")
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"status": "active", "updated_at": now}}
    )
    
    return {"message": "Membership activated", "status": "active"}


# ─── Membership Freezes ───────────────────────────────────────────

async def recalculate_membership_end_date(membership_id: str):
    """
    Recalculates the membership's actual end date based on its base_end_date 
    and all active freeze periods.
    """
    membership = await _db.memberships.find_one({"membership_id": membership_id})
    if not membership:
        return
        
    base_end_date_str = membership.get("base_end_date")
    
    # Backward compatibility: if no base_end_date, it means it's an old membership before freezes existed.
    # So its current end_date is its base_end_date.
    if not base_end_date_str:
        base_end_date_str = membership["end_date"]
        await _db.memberships.update_one({"membership_id": membership_id}, {"$set": {"base_end_date": base_end_date_str}})

    base_end = datetime.fromisoformat(base_end_date_str.replace('Z', '+00:00'))
    
    # Calculate new end date from all active freezes
    freezes = await _db.membership_freezes.find({"membership_id": membership_id, "status": "active"}).to_list(None)
    total_freeze_days = sum([(datetime.fromisoformat(f["end_date"].replace('Z', '+00:00')) - datetime.fromisoformat(f["start_date"].replace('Z', '+00:00'))).days for f in freezes])
    
    from datetime import timedelta
    new_end_date = base_end + timedelta(days=total_freeze_days)
    
    # Format exactly to YYYY-MM-DD to match the frontend date picker expectations
    # If the original string had a time component, keep it, otherwise just date
    new_end_date_str = new_end_date.isoformat()
    if len(base_end_date_str) == 10:  # Format YYYY-MM-DD
        new_end_date_str = new_end_date.strftime('%Y-%m-%d')
    
    await _db.memberships.update_one(
        {"membership_id": membership_id},
        {"$set": {"end_date": new_end_date_str, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

@router.get("/memberships/{membership_id}/freezes")
async def list_membership_freezes(membership_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    membership = await _db.memberships.find_one({"membership_id": membership_id, "location_id": location_id})
    if not membership:
        raise HTTPException(404, "Membership not found")
    await _assert_member_scope(user, membership.get("member_id"))
        
    freezes = await _db.membership_freezes.find({"membership_id": membership_id, "status": "active"}, {"_id": 0}).to_list(100)
    return freezes

@router.post("/memberships/{membership_id}/freezes", status_code=201)
async def create_membership_freeze(membership_id: str, data: MembershipFreezeCreate, request: Request, location_id: str = None):
    user = await require_member_access(request, "receptionist.create_memberships", allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    membership = await _db.memberships.find_one({"membership_id": membership_id, "location_id": location_id})
    if not membership:
        raise HTTPException(404, "Membership not found")
    await _assert_member_scope(user, membership.get("member_id"))
    await _assert_primary_payer_for_target(user, membership.get("member_id"), location_id=location_id)
        
    if membership.get("status") not in ["active", "pending"]:
        raise HTTPException(400, "Cannot freeze inactive or cancelled membership")
        
    try:
        start_date = datetime.fromisoformat(data.start_date.replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(data.end_date.replace('Z', '+00:00'))
    except ValueError:
        raise HTTPException(400, "Invalid date format")
        
    if end_date <= start_date:
        raise HTTPException(400, "End date must be after start date")
        
    freeze_days = (end_date - start_date).days
    
    existing_freezes = await _db.membership_freezes.find({"membership_id": membership_id, "status": "active"}).to_list(100)
    
    # Get dynamic freeze limits from membership (with legacy fallback)
    freeze_max_uses = membership.get("freeze_max_uses", 2)
    freeze_max_days = membership.get("freeze_max_days", 60)
    
    if freeze_max_uses <= 0 or freeze_max_days <= 0:
        raise HTTPException(400, "Freezing is not allowed for this membership plan")
    
    if len(existing_freezes) >= freeze_max_uses:
        raise HTTPException(400, f"Maximum of {freeze_max_uses} freezes allowed per membership")
        
    total_freeze_days = sum([(datetime.fromisoformat(f["end_date"].replace('Z', '+00:00')) - datetime.fromisoformat(f["start_date"].replace('Z', '+00:00'))).days for f in existing_freezes])
    
    if total_freeze_days + freeze_days > freeze_max_days:
        raise HTTPException(400, f"Total freeze period cannot exceed {freeze_max_days} days. Current used: {total_freeze_days} days.")
        
    for f in existing_freezes:
        f_start = datetime.fromisoformat(f["start_date"].replace('Z', '+00:00'))
        f_end = datetime.fromisoformat(f["end_date"].replace('Z', '+00:00'))
        if start_date < f_end and end_date > f_start:
            raise HTTPException(400, "Freeze dates overlap with an existing freeze")
            
    mem_start = datetime.fromisoformat(membership["start_date"].replace('Z', '+00:00'))
    mem_end = datetime.fromisoformat(membership["end_date"].replace('Z', '+00:00'))
    
    if start_date < mem_start or start_date > mem_end:
        raise HTTPException(400, "Freeze start date must be within the active membership period")
        
    freeze_id = f"freeze_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    freeze_doc = {
        "freeze_id": freeze_id,
        "membership_id": membership_id,
        "location_id": location_id,
        "start_date": data.start_date,
        "end_date": data.end_date,
        "reason": data.reason,
        "status": "active",
        "created_by": user["user_id"],
        "created_at": now
    }
    
    await _db.membership_freezes.insert_one(freeze_doc)
    freeze_doc.pop("_id", None)
    
    await recalculate_membership_end_date(membership_id)
    
    return freeze_doc

@router.delete("/memberships/{membership_id}/freezes/{freeze_id}")
async def delete_membership_freeze(membership_id: str, freeze_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    membership = await _db.memberships.find_one({"membership_id": membership_id, "location_id": location_id})
    if not membership:
        raise HTTPException(404, "Membership not found")
    await _assert_member_scope(user, membership.get("member_id"))
    await _assert_primary_payer_for_target(user, membership.get("member_id"), location_id=location_id)
        
    freeze = await _db.membership_freezes.find_one({"freeze_id": freeze_id, "membership_id": membership_id, "status": "active"})
    if not freeze:
        raise HTTPException(404, "Freeze not found or already cancelled")
        
    start_date = datetime.fromisoformat(freeze["start_date"].replace('Z', '+00:00'))
    end_date = datetime.fromisoformat(freeze["end_date"].replace('Z', '+00:00'))
    freeze_days = (end_date - start_date).days
    
    now = datetime.now(timezone.utc).isoformat()
    
    await _db.membership_freezes.update_one(
        {"freeze_id": freeze_id},
        {"$set": {"status": "cancelled", "updated_at": now}}
    )
    
    await recalculate_membership_end_date(membership_id)
    
    return {"message": "Freeze cancelled and membership end date reverted"}

@router.patch("/memberships/{membership_id}/freezes/{freeze_id}")
async def update_membership_freeze(membership_id: str, freeze_id: str, data: MembershipFreezeUpdate, request: Request, location_id: str = None):
    user = await require_member_access(request, "receptionist.edit_members_basic", allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    membership = await _db.memberships.find_one({"membership_id": membership_id, "location_id": location_id})
    if not membership:
        raise HTTPException(404, "Membership not found")
    await _assert_member_scope(user, membership.get("member_id"))
    await _assert_primary_payer_for_target(user, membership.get("member_id"), location_id=location_id)
        
    freeze = await _db.membership_freezes.find_one({"freeze_id": freeze_id, "membership_id": membership_id, "status": "active"})
    if not freeze:
        raise HTTPException(404, "Freeze not found or already cancelled")
        
    start_date = datetime.fromisoformat((data.start_date or freeze["start_date"]).replace('Z', '+00:00'))
    end_date = datetime.fromisoformat((data.end_date or freeze["end_date"]).replace('Z', '+00:00'))
    
    if end_date <= start_date:
        raise HTTPException(400, "End date must be after start date")
        
    freeze_days = (end_date - start_date).days
    
    existing_freezes = await _db.membership_freezes.find({"membership_id": membership_id, "status": "active", "freeze_id": {"$ne": freeze_id}}).to_list(100)
    
    # Get dynamic freeze limits from membership (with legacy fallback)
    freeze_max_days = membership.get("freeze_max_days", 60)
    
    total_freeze_days = sum([(datetime.fromisoformat(f["end_date"].replace('Z', '+00:00')) - datetime.fromisoformat(f["start_date"].replace('Z', '+00:00'))).days for f in existing_freezes])
    
    if total_freeze_days + freeze_days > freeze_max_days:
        raise HTTPException(400, f"Total freeze period cannot exceed {freeze_max_days} days. Current other freezes: {total_freeze_days} days.")
        
    for f in existing_freezes:
        f_start = datetime.fromisoformat(f["start_date"].replace('Z', '+00:00'))
        f_end = datetime.fromisoformat(f["end_date"].replace('Z', '+00:00'))
        if start_date < f_end and end_date > f_start:
            raise HTTPException(400, "Freeze dates overlap with an existing freeze")
            
    mem_start = datetime.fromisoformat(membership["start_date"].replace('Z', '+00:00'))
    mem_end = datetime.fromisoformat(membership["end_date"].replace('Z', '+00:00'))
    
    if start_date < mem_start or start_date > mem_end:
        raise HTTPException(400, "Freeze start date must be within the active membership period")
        
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.start_date: update_data["start_date"] = data.start_date
    if data.end_date: update_data["end_date"] = data.end_date
    if data.reason is not None: update_data["reason"] = data.reason
    
    await _db.membership_freezes.update_one(
        {"freeze_id": freeze_id},
        {"$set": update_data}
    )
    
    await recalculate_membership_end_date(membership_id)
    
    return {"message": "Freeze updated successfully"}


# ─── Payment Plans CRUD ────────────────────────────────────────────

@router.post("/payment-plans", status_code=201)
async def create_payment_plan(data: PaymentPlanCreate, request: Request, location_id: str = None):
    """Create a payment plan."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    plan_id = f"plan_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    plan_doc = {
        "plan_id": plan_id,
        "location_id": location_id,
        "name": data.name,
        "billing_cycle": data.billing_cycle,
        "price": data.price,
        "currency": data.currency,
        "includes": {
            "full_access": data.includes_full_access,
            "program_ids": data.program_ids,
        },
        "is_active": True,
        "deleted_at": None,
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.payment_plans.insert_one(plan_doc)
    plan_doc.pop("_id", None)
    
    return plan_doc


@router.get("/payment-plans")
async def list_payment_plans(
    request: Request,
    active_only: bool = True,
    membership_type: str = None,
    location_id: str = None
):
    """List payment plans - fetches from CMS pricing_plans for unified pricing."""
    user = await require_member_access(request, allow_member_self=True)
    
    # Fetch from CMS pricing_plans collection (unified with Public Site CMS)
    query = {}
    if active_only:
        query["is_active"] = {"$ne": False}
    
    if membership_type:
        normalized = _normalize_membership_type(membership_type)
        if not _is_supported_membership_type(normalized):
            raise HTTPException(400, "Invalid membership type")
        if normalized == "full_access":
            query["$or"] = [{"membership_type": "full_access"}, {"membership_type": {"$exists": False}}, {"membership_type": None}]
        else:
            query["membership_type"] = normalized

    plans = await _db.pricing_plans.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
    
    # Map to payment plan format expected by frontend
    formatted_plans = []
    for p in plans:
        # Use billing_cycle if available, otherwise fall back to billing_period
        billing_cycle = p.get("billing_cycle") or p.get("billing_period", "monthly")
        membership_type_out = _normalize_membership_type(p.get("membership_type") or "full_access")
        
        formatted_plans.append({
            "plan_id": p.get("plan_id"),
            "name": p.get("name"),
            "price": p.get("price"),
            "currency": p.get("currency", "AED"),
            "billing_cycle": billing_cycle,
            "description": p.get("description", ""),
            "features": p.get("features", []),
            "is_active": p.get("is_active", True),
            "is_popular": p.get("is_popular", False),
            "membership_type": membership_type_out,
        })
    
    return {"plans": formatted_plans}


@router.patch("/payment-plans/{plan_id}")
async def update_payment_plan(plan_id: str, data: PaymentPlanUpdate, request: Request, location_id: str = None):
    """Update a payment plan."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    existing = await _db.payment_plans.find_one({
        "plan_id": plan_id,
        "location_id": location_id
    })
    if not existing:
        raise HTTPException(404, "Payment plan not found")
    
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            if k == "includes_full_access":
                updates["includes.full_access"] = v
            elif k == "program_ids":
                updates["includes.program_ids"] = v
            else:
                updates[k] = v
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.payment_plans.update_one({"plan_id": plan_id}, {"$set": updates})
    
    return await _db.payment_plans.find_one({"plan_id": plan_id}, {"_id": 0})


@router.delete("/payment-plans/{plan_id}")
async def delete_payment_plan(plan_id: str, request: Request, location_id: str = None):
    """Soft delete a payment plan."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    existing = await _db.payment_plans.find_one({
        "plan_id": plan_id,
        "location_id": location_id
    })
    if not existing:
        raise HTTPException(404, "Payment plan not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.payment_plans.update_one(
        {"plan_id": plan_id},
        {"$set": {"deleted_at": now, "is_active": False, "updated_at": now}}
    )
    
    return {"message": "Payment plan deleted"}


# ─── Agreements CRUD ───────────────────────────────────────────────

@router.post("/agreements", status_code=201)
async def create_agreement(data: AgreementCreate, request: Request, location_id: str = None):
    """Create an agreement template."""
    user = await require_member_access(request, "manager.manage_agreements")
    location_id = await get_user_location(user, request)
    
    agreement_id = f"agreement_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    agreement_doc = {
        "agreement_id": agreement_id,
        "location_id": location_id,
        "title": data.title,
        "version": data.version,
        "content_html": data.content_html,
        "pdf_url": data.pdf_url,
        "is_active": True,
        "deleted_at": None,
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.agreements.insert_one(agreement_doc)
    agreement_doc.pop("_id", None)
    
    return agreement_doc


@router.get("/agreements")
async def list_agreements(
    request: Request,
    active_only: bool = True,
    location_id: str = None
):
    """List agreement templates for a location."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    query = {"location_id": location_id}
    if active_only:
        query["is_active"] = True
        query["$or"] = [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    
    agreements = await _db.agreements.find(query, {"_id": 0}).to_list(100)
    return {"agreements": agreements}


@router.patch("/agreements/{agreement_id}")
async def update_agreement(agreement_id: str, data: AgreementUpdate, request: Request, location_id: str = None):
    """Update an agreement template."""
    user = await require_member_access(request, "manager.manage_agreements")
    location_id = await get_user_location(user, request)
    
    existing = await _db.agreements.find_one({
        "agreement_id": agreement_id,
        "location_id": location_id
    })
    if not existing:
        raise HTTPException(404, "Agreement not found")
    
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.agreements.update_one({"agreement_id": agreement_id}, {"$set": updates})
    
    return await _db.agreements.find_one({"agreement_id": agreement_id}, {"_id": 0})


@router.delete("/agreements/{agreement_id}")
async def delete_agreement(agreement_id: str, request: Request, location_id: str = None):
    """Soft delete an agreement template."""
    user = await require_member_access(request, "manager.manage_agreements")
    location_id = await get_user_location(user, request)
    
    existing = await _db.agreements.find_one({
        "agreement_id": agreement_id,
        "location_id": location_id
    })
    if not existing:
        raise HTTPException(404, "Agreement not found")
    
    now = datetime.now(timezone.utc).isoformat()
    await _db.agreements.update_one(
        {"agreement_id": agreement_id},
        {"$set": {"deleted_at": now, "is_active": False, "updated_at": now}}
    )
    
    return {"message": "Agreement deleted"}


@router.post("/members/{member_id}/sign-agreement", status_code=201)
async def sign_agreement(member_id: str, data: SignAgreementRequest, request: Request, location_id: str = None):
    """Sign an agreement for a member."""
    user = await require_member_access(request, "receptionist.view_agreements", allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    # Members can only sign their own agreements
    if user["role"] == "MEMBER" and user.get("member_id") != member_id:
        raise HTTPException(403, "You can only sign your own agreements")
    
    # Verify member exists
    member = await _db.members.find_one({
        "member_id": member_id,
        "location_id": location_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not member:
        raise HTTPException(404, "Member not found")
    
    # Verify agreement exists
    agreement = await _db.agreements.find_one({
        "agreement_id": data.agreement_id,
        "location_id": location_id,
        "is_active": True
    })
    if not agreement:
        raise HTTPException(404, "Agreement not found or inactive")
    
    # Check if already signed this version
    existing_signed = await _db.signed_agreements.find_one({
        "agreement_id": data.agreement_id,
        "member_id": member_id
    })
    if existing_signed:
        raise HTTPException(400, "Agreement already signed")
    
    signed_id = f"signed_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    # Get signer IP
    client_ip = request.client.host if request.client else "unknown"
    
    signed_doc = {
        "signed_agreement_id": signed_id,
        "location_id": location_id,
        "agreement_id": data.agreement_id,
        "member_id": member_id,
        "signed_at": now,
        "signature_data": data.signature_data,  # Base64 image if provided
        "checkbox_agreed": data.checkbox_agreed,
        "signed_ip": client_ip,
        "signer_name": data.signer_name or member["full_name"],
        "document_snapshot": {
            "title": agreement["title"],
            "version": agreement["version"],
            "content_html": agreement["content_html"],
        },
        "created_at": now,
    }
    
    await _db.signed_agreements.insert_one(signed_doc)
    signed_doc.pop("_id", None)
    
    return signed_doc


@router.get("/members/{member_id}/signed-agreements")
async def list_signed_agreements(member_id: str, request: Request, location_id: str = None):
    """List signed agreements for a member."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    # Members can only see their own
    if user["role"] == "MEMBER" and user.get("member_id") != member_id:
        raise HTTPException(403, "You can only view your own agreements")
    
    signed = await _db.signed_agreements.find({
        "member_id": member_id,
        "location_id": location_id
    }, {"_id": 0}).to_list(100)
    
    return {"signed_agreements": signed}


@router.get("/members/{member_id}/signed-agreements/{signed_agreement_id}/download")
async def download_signed_agreement(member_id: str, signed_agreement_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    if user.get("role") == "MEMBER" and user.get("member_id") != member_id:
        raise HTTPException(403, "You can only view your own agreements")
    signed = await _db.signed_agreements.find_one(
        {"signed_agreement_id": signed_agreement_id, "member_id": member_id, "location_id": location_id},
        {"_id": 0},
    )
    if not signed:
        raise HTTPException(404, "Signed agreement not found")
    snap = signed.get("document_snapshot") or {}
    title = snap.get("title") or "agreement"
    html = snap.get("content_html") or ""
    filename = _ascii_filename(title, fallback=f"agreement-{signed_agreement_id}") + ".html"
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/members/{member_id}/accepted-terms")
async def list_accepted_terms(member_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    if user.get("role") == "MEMBER" and user.get("member_id") != member_id:
        raise HTTPException(403, "You can only view your own terms")
    rows = await _db.accepted_terms.find({"member_id": member_id, "location_id": location_id}, {"_id": 0}).sort("accepted_at", -1).to_list(100)
    if not rows:
        member = await _db.members.find_one({"member_id": member_id, "location_id": location_id}, {"_id": 0, "terms_accepted_at": 1})
        accepted_at = member.get("terms_accepted_at") if member else None
        if accepted_at:
            await _create_accepted_terms_for_member(
                member_id=member_id,
                location_id=location_id,
                accepted_at=accepted_at,
                created_by_user_id=None,
            )
            rows = await _db.accepted_terms.find({"member_id": member_id, "location_id": location_id}, {"_id": 0}).sort("accepted_at", -1).to_list(100)
    out = []
    for r in rows:
        snap = r.get("document_snapshot") or {}
        out.append({
            "accepted_terms_id": r.get("accepted_terms_id"),
            "accepted_at": r.get("accepted_at"),
            "title": snap.get("title"),
            "version": snap.get("version"),
            "source": r.get("source"),
        })
    return {"accepted_terms": out}


@router.get("/members/{member_id}/accepted-terms/{accepted_terms_id}")
async def get_accepted_terms(member_id: str, accepted_terms_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    if user.get("role") == "MEMBER" and user.get("member_id") != member_id:
        raise HTTPException(403, "You can only view your own terms")
    doc = await _db.accepted_terms.find_one(
        {"accepted_terms_id": accepted_terms_id, "member_id": member_id, "location_id": location_id},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Accepted terms not found")
    return doc


@router.get("/members/{member_id}/accepted-terms/{accepted_terms_id}/download")
async def download_accepted_terms(member_id: str, accepted_terms_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    if user.get("role") == "MEMBER" and user.get("member_id") != member_id:
        raise HTTPException(403, "You can only view your own terms")
    doc = await _db.accepted_terms.find_one(
        {"accepted_terms_id": accepted_terms_id, "member_id": member_id, "location_id": location_id},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(404, "Accepted terms not found")
    snap = doc.get("document_snapshot") or {}
    html = snap.get("content_html") or ""
    filename = f"terms-{accepted_terms_id}.html"
    return Response(
        content=html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _build_registration_document_pdf(*, request: Request, member: dict, location: Optional[dict], signed_agreement: dict, accepted_terms: dict):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=18*mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("DocTitle", parent=styles["Heading1"], fontSize=20, textColor=colors.HexColor("#C0392B"), spaceAfter=4)
    subtitle_style = ParagraphStyle("DocSub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#7f8c8d"), spaceAfter=10)
    h1_style = ParagraphStyle("H1", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#2c3e50"), spaceBefore=14, spaceAfter=8)
    h2_style = ParagraphStyle("H2", parent=styles["Heading3"], fontSize=11, textColor=colors.HexColor("#2c3e50"), spaceBefore=10, spaceAfter=6)
    normal = ParagraphStyle("Norm", parent=styles["Normal"], fontSize=10, leading=14, textColor=colors.HexColor("#333333"))
    small = ParagraphStyle("Small", parent=styles["Normal"], fontSize=9, leading=12, textColor=colors.HexColor("#7f8c8d"))

    gym_name = (location.get("name") if location else None) or "Spartans"
    gym_city = (location.get("city") if location else "") or ""
    gym_address = (location.get("address") if location else "") or ""

    left_header = [Paragraph(gym_name.upper(), title_style)]
    if gym_address or gym_city:
        left_header.append(Paragraph(f"{gym_address}{', ' + gym_city if gym_city else ''}", subtitle_style))

    logo_path = await _resolve_logo_path_for_pdf(location)
    right_header = []
    if logo_path:
        try:
            logo = Image(logo_path, width=38*mm, height=38*mm, kind='proportional')
            logo.hAlign = "RIGHT"
            right_header.append(logo)
        except Exception:
            right_header.append(Paragraph("", normal))
    else:
        right_header.append(Paragraph("", normal))

    elements = []
    header_table = Table([[left_header, right_header]], colWidths=[110*mm, 60*mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 2*mm))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#C0392B"), spaceBefore=1, spaceAfter=8, hAlign="CENTER"))
    elements.append(Spacer(1, 2*mm))

    elements.append(Paragraph("SIGNED REGISTRATION DOCUMENT", h1_style))

    member_info = [
        ["Member:", member.get("full_name") or "—", "Member No:", member.get("member_no") or "—"],
        ["Email:", member.get("email") or "—", "Phone:", member.get("phone") or "—"],
    ]
    member_table = Table(member_info, colWidths=[20*mm, 70*mm, 20*mm, 55*mm], hAlign="LEFT")
    member_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#333333")),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(member_table)
    elements.append(Spacer(1, 4*mm))

    agreement_snap = signed_agreement.get("document_snapshot") or {}
    agreement_title = agreement_snap.get("title") or "Agreement"
    agreement_version = agreement_snap.get("version") or "—"
    agreement_signed_at = signed_agreement.get("signed_at") or signed_agreement.get("created_at")

    terms_snap = accepted_terms.get("document_snapshot") or {}
    terms_title = terms_snap.get("title") or "Terms & Conditions"
    terms_version = terms_snap.get("version") or "—"
    terms_accepted_at = accepted_terms.get("accepted_at") or accepted_terms.get("created_at")

    elements.append(Paragraph("Agreement", h1_style))
    elements.append(Paragraph(f"Title: {xml_escape(str(agreement_title))}", small))
    elements.append(Paragraph(f"Version: {xml_escape(str(agreement_version))}", small))
    elements.append(Paragraph(f"Accepted on: {_iso_display(agreement_signed_at)}", small))
    elements.append(Spacer(1, 2*mm))
    agreement_text = _plain_text_from_html(agreement_snap.get("content_html") or "")
    agreement_para = xml_escape(agreement_text).replace("\n", "<br/>") if agreement_text else "—"
    elements.append(Paragraph(agreement_para, normal))

    elements.append(Spacer(1, 6*mm))
    elements.append(Paragraph("Terms & Conditions", h1_style))
    elements.append(Paragraph(f"Title: {xml_escape(str(terms_title))}", small))
    elements.append(Paragraph(f"Version: {xml_escape(str(terms_version))}", small))
    elements.append(Paragraph(f"Accepted on: {_iso_display(terms_accepted_at)}", small))
    elements.append(Spacer(1, 2*mm))
    terms_text = _plain_text_from_html(terms_snap.get("content_html") or "")
    terms_para = xml_escape(terms_text).replace("\n", "<br/>") if terms_text else "—"
    elements.append(Paragraph(terms_para, normal))

    elements.append(Spacer(1, 8*mm))
    elements.append(Paragraph("Signature", h2_style))
    accepted_on = agreement_signed_at or terms_accepted_at
    sig_table = Table(
        [
            ["Signed by:", member.get("full_name") or "—"],
            ["Accepted on:", _iso_display(accepted_on)],
        ],
        colWidths=[28*mm, 137*mm],
        hAlign="LEFT",
    )
    sig_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#333333")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (1, 0), (1, 0), 0.4, colors.HexColor("#CCCCCC")),
        ("LINEBELOW", (1, 1), (1, 1), 0.4, colors.HexColor("#CCCCCC")),
    ]))
    elements.append(sig_table)

    elements.append(Spacer(1, 10*mm))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#C0392B"), spaceBefore=1, spaceAfter=6, hAlign="CENTER"))

    website = _origin_website(request)
    contact_phone = (location.get("phone") if location else None) or ""
    contact_email = (location.get("email") if location else None) or ""
    if not (contact_phone or contact_email):
        site_settings = await _db.site_settings.find_one({"setting_id": "global"}, {"_id": 0})
        if site_settings:
            contact_phone = contact_phone or site_settings.get("contact_phone") or ""
            contact_email = contact_email or site_settings.get("contact_email") or ""

    footer_cells = [
        website,
        contact_phone,
        contact_email,
    ]
    footer_table = Table([footer_cells], colWidths=[55*mm, 55*mm, 55*mm])
    footer_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#333333")),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(footer_table)

    doc.build(elements)
    buf.seek(0)
    return buf


@router.get("/members/{member_id}/registration-document/pdf")
async def view_registration_document_pdf(member_id: str, request: Request, location_id: str = None):
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    await _assert_member_scope(user, member_id)

    member = await _db.members.find_one({"member_id": member_id, "location_id": location_id}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")

    location = await _db.locations.find_one({"location_id": location_id}, {"_id": 0})

    signed_rows = await _db.signed_agreements.find({"member_id": member_id, "location_id": location_id}, {"_id": 0}).sort("signed_at", -1).limit(1).to_list(1)
    signed = signed_rows[0] if signed_rows else None
    if not signed:
        raise HTTPException(404, "Signed agreement not found")

    terms_rows = await _db.accepted_terms.find({"member_id": member_id, "location_id": location_id}, {"_id": 0}).sort("accepted_at", -1).limit(1).to_list(1)
    if not terms_rows:
        accepted_at = member.get("terms_accepted_at")
        if accepted_at:
            await _create_accepted_terms_for_member(member_id=member_id, location_id=location_id, accepted_at=accepted_at, created_by_user_id=None)
            terms_rows = await _db.accepted_terms.find({"member_id": member_id, "location_id": location_id}, {"_id": 0}).sort("accepted_at", -1).limit(1).to_list(1)
    terms = terms_rows[0] if terms_rows else None
    if not terms:
        raise HTTPException(404, "Accepted terms not found")

    buf = await _build_registration_document_pdf(request=request, member=member, location=location, signed_agreement=signed, accepted_terms=terms)
    filename = _ascii_filename(member.get("member_no") or member_id, fallback=f"registration-{member_id}") + ".pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/members/{member_id}/registration-document/pdf/download")
async def download_registration_document_pdf(member_id: str, request: Request, location_id: str = None):
    res = await view_registration_document_pdf(member_id=member_id, request=request, location_id=location_id)
    filename = res.headers.get("content-disposition", "")
    if filename.startswith("inline;"):
        res.headers["Content-Disposition"] = filename.replace("inline;", "attachment;", 1)
    return res


# ─── Payments ──────────────────────────────────────────────────────

import payment_gateways

@router.post("/payments/initiate", status_code=201)
async def initiate_payment(data: PaymentInitiate, request: Request, location_id: str = None):
    """Initiate a payment (online/tabby/tamara/etc). Returns checkout URL."""
    # Temporarily bypass auth for public joins since they don't have tokens yet, 
    # but still validate location.
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        user = {"role": "PUBLIC", "user_id": None}
        if not location_id:
            raise HTTPException(400, "Location ID required for public initiation")
    else:
        user = await require_member_access(request, allow_member_self=True)
        location_id = await get_user_location(user, request)
    
    # Verify member
    member = await _db.members.find_one({
        "member_id": data.member_id,
        "location_id": location_id
    })
    if not member:
        raise HTTPException(404, "Member not found")
    
    if user.get("role") == "MEMBER":
        await _assert_member_scope(user, data.member_id)
        await _assert_primary_payer_for_target(user, data.member_id, location_id=location_id)
    
    # Verify membership
    membership = await _db.memberships.find_one({
        "membership_id": data.membership_id,
        "member_id": data.member_id,
        "location_id": location_id
    })
    if not membership:
        raise HTTPException(404, "Membership not found")
    
    if data.method == "cash":
        raise HTTPException(400, "Use /payments/cash endpoint for cash payments")
    
    payment_id = f"payment_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    backend_url = str(request.base_url)
    return_url = f"{backend_url}api/payments/callback/{payment_id}"
    
    try:
        checkout_data = await payment_gateways.PaymentService.initiate_checkout(
            provider=data.method,
            payment_id=payment_id,
            amount=data.amount,
            currency=data.currency,
            member=member,
            return_url=return_url,
            location_id=location_id
        )
    except ValueError as e:
        raise HTTPException(400, str(e))
    
    payment_doc = {
        "payment_id": payment_id,
        "location_id": location_id,
        "member_id": data.member_id,
        "membership_id": data.membership_id,
        "method": data.method,
        "source": "public_join" if user.get("role") == "PUBLIC" else ("member" if user.get("role") == "MEMBER" else "online"),
        "provider_ref": checkout_data.get("session_id") or checkout_data.get("order_id") or checkout_data.get("transaction_id"),
        "amount": data.amount,
        "currency": data.currency,
        "status": "pending",
        "paid_at": None,
        "due_date": None,
        "created_by_user_id": user["user_id"],
        "receipt_url": data.receipt_url,
        "receipt_info": data.receipt_info,
        "checkout_data": checkout_data,
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.payments.insert_one(payment_doc)
    payment_doc.pop("_id", None)
    
    return payment_doc


@router.post("/payments/cash", status_code=201)
async def record_cash_payment(data: CashPaymentRecord, request: Request, location_id: str = None):
    user = await require_member_access(request, "receptionist.record_cash_payments", allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    if user.get("role") == "MEMBER":
        membership = await _db.memberships.find_one(
            {"membership_id": data.membership_id, "location_id": location_id},
            {"_id": 0, "member_id": 1, "membership_id": 1},
        )
        if not membership:
            raise HTTPException(404, "Membership not found")
        await _assert_member_scope(user, membership.get("member_id"))
        member = await _db.members.find_one(
            {"member_id": membership.get("member_id"), "location_id": location_id},
            {"_id": 0, "member_id": 1},
        )
        if not member:
            raise HTTPException(404, "Member not found")
        effective_member_id = membership.get("member_id")
    else:
        member = await _db.members.find_one({
            "member_id": data.member_id,
            "location_id": location_id
        })
        if not member:
            raise HTTPException(404, "Member not found")
        
        membership = await _db.memberships.find_one({
            "membership_id": data.membership_id,
            "member_id": data.member_id,
            "location_id": location_id
        })
        if not membership:
            raise HTTPException(404, "Membership not found")
        effective_member_id = data.member_id

    if not membership:
        raise HTTPException(404, "Membership not found")
    
    payment_id = f"payment_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    payment_doc = {
        "payment_id": payment_id,
        "location_id": location_id,
        "member_id": effective_member_id,
        "membership_id": data.membership_id,
        "method": "cash",
        "source": "member" if user.get("role") == "MEMBER" else "manual",
        "provider_ref": None,
        "amount": data.amount,
        "currency": data.currency,
        "status": "pending",  # Manager must review it
        "paid_at": None,
        "due_date": None,
        "created_by_user_id": user["user_id"],
        "receipt_info": data.receipt_info,
        "receipt_url": data.receipt_url,
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.payments.insert_one(payment_doc)
    payment_doc.pop("_id", None)
    
    return payment_doc


@router.get("/payments")
async def list_payments(
    request: Request,
    member_id: str = None,
    status: str = None,
    method: str = None,
    skip: int = 0,
    limit: int = 50,
    location_id: str = None
):
    """List payments for a location."""
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    query = {"location_id": location_id}
    
    # Members can only see their own
    if user["role"] == "MEMBER":
        query["member_id"] = {"$in": await _allowed_member_ids_for_member_user(user)}
    elif member_id:
        query["member_id"] = member_id
    
    if status:
        query["status"] = status
    if method:
        query["method"] = method
    
    total = await _db.payments.count_documents(query)
    payments = await _db.payments.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Enrich with member names
    for p in payments:
        member = await _db.members.find_one({"member_id": p["member_id"]}, {"_id": 0, "full_name": 1})
        p["member_name"] = member["full_name"] if member else "Unknown"
    
    return {"payments": payments, "total": total}


@router.get("/payments/{payment_id}")
async def get_payment(payment_id: str, request: Request, location_id: str = None):
    """Get a single payment."""
    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)
    
    payment = await _db.payments.find_one({
        "payment_id": payment_id,
        "location_id": location_id
    }, {"_id": 0})
    
    if not payment:
        raise HTTPException(404, "Payment not found")
    
    if user.get("role") == "MEMBER":
        await _assert_member_scope(user, payment.get("member_id"))
    
    return payment


@router.patch("/payments/{payment_id}/status")
async def update_payment_status(payment_id: str, data: PaymentUpdateStatus, request: Request, location_id: str = None):
    """Update payment status (Manager/Receptionist)."""
    user = await require_member_access(request, "manager.manage_payments")
    location_id = await get_user_location(user, request)
    
    if user["role"] == "MEMBER":
        raise HTTPException(403, "Members cannot update payment statuses")
        
    payment = await _db.payments.find_one({
        "payment_id": payment_id,
        "location_id": location_id
    })
    
    if not payment:
        raise HTTPException(404, "Payment not found")
        
    # Enforce status lock: If it's already a final status, prevent changing it
    # Allow transitions only if it's currently pending.
    if payment.get("status") != "pending" and data.status != payment.get("status"):
        raise HTTPException(400, "Cannot change status of a finalized payment")

    # Require notes for declined or failed
    if data.status in ["declined", "failed"]:
        if not data.notes or not data.notes.strip():
            raise HTTPException(400, "Internal Notes / Reason is required when declining or failing a payment")

    updates = {
        "status": data.status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if data.status in ["paid", "completed", "approved"]:
        updates["paid_at"] = datetime.now(timezone.utc).isoformat()
    
    if data.notes is not None:
        updates["notes"] = data.notes
        
    # If payment goes to a completed state and is linked to a membership, activate the membership
    if data.status in ["paid", "completed", "approved"]:
        if payment.get("membership_id"):
            membership = await _db.memberships.find_one({"membership_id": payment["membership_id"], "location_id": location_id})
            if membership and membership.get("status") != "cancelled":
                now_dt = datetime.now(timezone.utc)
                now_iso = now_dt.isoformat()
                today = now_dt.date()

                plan = None
                if membership.get("payment_plan_id"):
                    plan = await _db.pricing_plans.find_one({"plan_id": membership["payment_plan_id"]}, {"_id": 0})
                billing_cycle = (plan or {}).get("billing_cycle") or (plan or {}).get("billing_period") or "monthly"

                end_d = membership_status.parse_date_ymd(membership.get("end_date"))
                needs_reactivate_window = (end_d is None) or (today > end_d) or (membership.get("status") in {"expired", "past_due"})

                mem_updates = {"status": "active", "updated_at": now_iso}
                if needs_reactivate_window:
                    new_start = today.strftime("%Y-%m-%d")
                    new_end = membership_status.calc_end_date(new_start, billing_cycle)
                    mem_updates.update({
                        "start_date": new_start,
                        "end_date": new_end,
                        "base_end_date": new_end,
                        "next_renewal_date": new_end if membership.get("auto_renew") else None,
                    })

                await _db.memberships.update_one(
                    {"membership_id": membership["membership_id"], "location_id": location_id},
                    {"$set": mem_updates},
                )
        
    await _db.payments.update_one({"payment_id": payment_id}, {"$set": updates})
    
    return await _db.payments.find_one({"payment_id": payment_id}, {"_id": 0})


@router.get("/payments/{payment_id}/invoice")
async def generate_invoice_pdf(payment_id: str, request: Request, location_id: str = None):
    """Generate a PDF invoice for a payment."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    user = await require_member_access(request, allow_member_self=True)
    location_id = await get_user_location(user, request)

    payment = await _db.payments.find_one({"payment_id": payment_id, "location_id": location_id}, {"_id": 0})
    if not payment:
        raise HTTPException(404, "Payment not found")
        
    # Enforce invoice eligibility rule: only allowed for paid/approved/completed
    if (payment.get("status") or "").lower() not in {"paid", "approved", "completed"}:
        raise HTTPException(400, "Invoice is only available for completed or approved payments")

    if user["role"] == "MEMBER":
        allowed = await _allowed_member_ids_for_member_user(user)
        if payment["member_id"] not in allowed:
            raise HTTPException(403, "Access denied")

    member = await _db.members.find_one({"member_id": payment["member_id"]}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Member not found")

    membership = await _db.memberships.find_one({"membership_id": payment.get("membership_id")}, {"_id": 0})
    location = await _db.locations.find_one({"location_id": location_id}, {"_id": 0})

    # Get plan info
    plan_name = "N/A"
    billing_cycle = "N/A"
    if membership and membership.get("payment_plan_id"):
        plan = await _db.pricing_plans.find_one({"plan_id": membership["payment_plan_id"]}, {"_id": 0})
        if plan:
            plan_name = plan.get("name", "N/A")
            billing_cycle = plan.get("billing_cycle") or plan.get("billing_period", "N/A")

    # Build PDF
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("InvTitle", parent=styles["Heading1"], fontSize=22, textColor=colors.HexColor("#C0392B"), spaceAfter=4)
    subtitle_style = ParagraphStyle("InvSub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#7f8c8d"), spaceAfter=12)
    section_style = ParagraphStyle("Section", parent=styles["Heading2"], fontSize=13, textColor=colors.HexColor("#2c3e50"), spaceBefore=16, spaceAfter=8,
                                     borderWidth=0, borderPadding=0)
    normal = ParagraphStyle("Norm", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#333333"))

    elements = []

    # Header (2 columns: Left=Text, Right=Logo)
    gym_name = location.get("name", "Spartans Gym") if location else "Spartans Gym"
    gym_city = location.get("city", "") if location else ""
    gym_address = location.get("address", "") if location else ""

    left_header = []
    left_header.append(Paragraph(gym_name.upper(), title_style))
    if gym_address or gym_city:
        left_header.append(Paragraph(f"{gym_address}{', ' + gym_city if gym_city else ''}", subtitle_style))
        
    # Attempt to load logo (from CMS site_settings favicon_url or fallback text if missing)
    import os
    from reportlab.platypus import Image
    
    site_settings = await _db.site_settings.find_one({"setting_id": "global"})
    logo_path = None
    
    if site_settings:
        logo_url = site_settings.get("logo_url") or site_settings.get("favicon_url")
        if logo_url:
            # e.g. "/api/uploads/xxx.png"
            filename = logo_url.split("/")[-1]
            possible_path = os.path.join(os.path.dirname(__file__), "uploads", filename)
            if os.path.exists(possible_path):
                logo_path = possible_path

    if not logo_path:
        possible_fallback = os.path.join(os.path.dirname(__file__), "assets", "logo.png")
        if os.path.exists(possible_fallback):
            logo_path = possible_fallback

    right_header = []
    if logo_path:
        try:
            logo = Image(logo_path, width=40*mm, height=40*mm, kind='proportional')
            logo.hAlign = 'RIGHT'
            right_header.append(logo)
        except Exception:
            right_header.append(Paragraph("", normal))
    else:
        right_header.append(Paragraph("", normal))

    header_table = Table([[left_header, right_header]], colWidths=[110*mm, 60*mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_table)
    
    # Red Horizontal Line Separator
    elements.append(Spacer(1, 2*mm))
    from reportlab.platypus import HRFlowable
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#C0392B"), spaceBefore=1, spaceAfter=8, hAlign='CENTER'))
    elements.append(Spacer(1, 4*mm))

    # Invoice info row
    inv_date = payment.get("paid_at") or payment.get("created_at") or datetime.now(timezone.utc).isoformat()
    inv_date_str = inv_date[:10] if isinstance(inv_date, str) else inv_date.strftime("%Y-%m-%d")

    inv_info = [
        ["INVOICE", ""],
        ["Invoice #:", payment_id[-12:].upper()],
        ["Date:", inv_date_str],
        ["Status:", (payment.get("status") or "N/A").upper()],
    ]
    # Move table to the left by keeping default alignment but controlling width
    inv_table = Table(inv_info, colWidths=[30*mm, 50*mm], hAlign='LEFT')
    inv_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (1, 0), 14),
        ("TEXTCOLOR", (0, 0), (1, 0), colors.HexColor("#C0392B")),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#333333")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(inv_table)
    elements.append(Spacer(1, 6*mm))

    # --- Personal Info ---
    elements.append(Paragraph("MEMBER INFORMATION", section_style))
    personal_data = [
        ["Name:", member.get("full_name", "N/A"), "Member No:", member.get("member_no", "N/A")],
        ["Email:", member.get("email", "N/A"), "Phone:", member.get("phone", "N/A")],
        ["Gender:", (member.get("gender") or "N/A").capitalize(), "DOB:", member.get("dob", "N/A")],
        ["Address:", member.get("address", "N/A"), "", ""],
    ]
    p_table = Table(personal_data, colWidths=[22*mm, 55*mm, 25*mm, 55*mm])
    p_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#333333")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#ddd")),
    ]))
    elements.append(p_table)

    # --- Membership Info ---
    elements.append(Paragraph("MEMBERSHIP DETAILS", section_style))
    mem_type = (membership.get("type", "N/A") if membership else "N/A").replace("_", " ").title()
    mem_data = [
        ["Plan:", plan_name, "Billing Cycle:", billing_cycle.capitalize()],
        ["Type:", mem_type, "Auto Renew:", "Yes" if (membership or {}).get("auto_renew") else "No"],
        ["Start Date:", (membership or {}).get("start_date", "N/A"), "End Date:", (membership or {}).get("end_date", "N/A")],
        ["Status:", ((membership or {}).get("status", "N/A")).upper(), "", ""],
    ]
    m_table = Table(mem_data, colWidths=[26*mm, 50*mm, 28*mm, 50*mm])
    m_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#333333")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#ddd")),
    ]))
    elements.append(m_table)

    # --- Payment Details ---
    elements.append(Paragraph("PAYMENT DETAILS", section_style))
    method_label = (payment.get("method", "N/A")).replace("_", " ").title()
    pay_data = [
        ["Method:", method_label, "Currency:", payment.get("currency", "AED")],
        ["Amount:", f"{payment.get('amount', 0):,.2f} {payment.get('currency', 'AED')}", "Paid At:", (payment.get("paid_at") or "Pending")[:10] if isinstance(payment.get("paid_at"), str) else "Pending"],
    ]
    if payment.get("receipt_info"):
        pay_data.append(["Receipt Info:", payment["receipt_info"], "", ""])

    pay_table = Table(pay_data, colWidths=[26*mm, 55*mm, 22*mm, 50*mm])
    pay_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#333333")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(pay_table)

    # Total box
    elements.append(Spacer(1, 8*mm))
    total_data = [
        ["TOTAL", f"{payment.get('amount', 0):,.2f} {payment.get('currency', 'AED')}"],
    ]
    total_table = Table(total_data, colWidths=[110*mm, 50*mm])
    total_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 14),
        ("TEXTCOLOR", (0, 0), (0, 0), colors.HexColor("#2c3e50")),
        ("TEXTCOLOR", (1, 0), (1, 0), colors.HexColor("#C0392B")),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8f9fa")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#C0392B")),
    ]))
    elements.append(total_table)

    # Footer
    elements.append(Spacer(1, 16*mm))
    elements.append(Paragraph("Thank you for choosing " + gym_name + "!", ParagraphStyle("Footer", parent=normal, alignment=1, textColor=colors.HexColor("#7f8c8d"), fontSize=9)))

    doc.build(elements)
    buf.seek(0)

    filename = f"invoice_{payment_id[-12:]}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ─── Member Transfers ──────────────────────────────────────────────

@router.post("/members/{member_id}/transfer", status_code=201)
async def request_transfer(member_id: str, data: TransferRequest, request: Request):
    """Request a member transfer to another location."""
    user = await require_member_access(request)
    from_location_id = await get_user_location(user, request)
    
    # Verify member exists at current location
    member = await _db.members.find_one({
        "member_id": member_id,
        "location_id": from_location_id,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    if not member:
        raise HTTPException(404, "Member not found at this location")
    
    # Verify target location exists
    to_location = await _db.locations.find_one({
        "location_id": data.to_location_id,
        "is_deleted": False
    })
    if not to_location:
        raise HTTPException(404, "Target location not found")
    
    # Check if same location
    if from_location_id == data.to_location_id:
        raise HTTPException(400, "Cannot transfer to same location")
    
    # Check for pending transfer
    pending = await _db.member_transfers.find_one({
        "member_id": member_id,
        "status": {"$in": ["requested", "approved"]}
    })
    if pending:
        raise HTTPException(400, "Member already has a pending transfer")
    
    transfer_id = f"transfer_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    transfer_doc = {
        "transfer_id": transfer_id,
        "from_location_id": from_location_id,
        "to_location_id": data.to_location_id,
        "member_id": member_id,
        "status": "requested",
        "requested_by_user_id": user["user_id"],
        "approved_by_user_id": None,
        "reason": data.reason,
        "created_at": now,
        "completed_at": None,
    }
    
    # If owner, can directly approve
    if user["role"] == "OWNER":
        transfer_doc["status"] = "approved"
        transfer_doc["approved_by_user_id"] = user["user_id"]
    
    await _db.member_transfers.insert_one(transfer_doc)
    transfer_doc.pop("_id", None)
    
    return transfer_doc


@router.get("/member-transfers")
async def list_transfers(
    request: Request,
    status: str = None
):
    """List member transfers."""
    user = await _get_current_user(request)
    
    query = {}
    
    if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
        # Owner sees all transfers for their locations
        loc_ids = [l["location_id"] async for l in _db.locations.find(
            {"owner_id": user["user_id"], "is_deleted": False}, {"location_id": 1}
        )]
        query["$or"] = [
            {"from_location_id": {"$in": loc_ids}},
            {"to_location_id": {"$in": loc_ids}}
        ]
    elif user.get("location_id"):
        # Staff sees transfers involving their location
        query["$or"] = [
            {"from_location_id": user["location_id"]},
            {"to_location_id": user["location_id"]}
        ]
    else:
        raise HTTPException(403, "Access denied")
    
    if status:
        query["status"] = status
    
    transfers = await _db.member_transfers.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Enrich with names
    for t in transfers:
        member = await _db.members.find_one({"member_id": t["member_id"]}, {"_id": 0, "full_name": 1})
        t["member_name"] = member["full_name"] if member else "Unknown"
        from_loc = await _db.locations.find_one({"location_id": t["from_location_id"]}, {"_id": 0, "name": 1})
        to_loc = await _db.locations.find_one({"location_id": t["to_location_id"]}, {"_id": 0, "name": 1})
        t["from_location_name"] = from_loc["name"] if from_loc else "Unknown"
        t["to_location_name"] = to_loc["name"] if to_loc else "Unknown"
    
    return {"transfers": transfers}


@router.patch("/member-transfers/{transfer_id}")
async def action_transfer(transfer_id: str, data: TransferAction, request: Request):
    """Approve, reject, or complete a transfer."""
    user = await _get_current_user(request)
    
    transfer = await _db.member_transfers.find_one({"transfer_id": transfer_id}, {"_id": 0})
    if not transfer:
        raise HTTPException(404, "Transfer not found")
    
    now = datetime.now(timezone.utc).isoformat()
    
    if data.action == "approve":
        if transfer["status"] != "requested":
            raise HTTPException(400, "Can only approve requested transfers")
        
        # Must be owner or manager at target location
        if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
            pass  # Owner can approve any
        elif user.get("location_id") == transfer["to_location_id"]:
            pass  # Manager at target location can approve
        else:
            raise HTTPException(403, "Cannot approve this transfer")
        
        await _db.member_transfers.update_one(
            {"transfer_id": transfer_id},
            {"$set": {"status": "approved", "approved_by_user_id": user["user_id"]}}
        )
        
    elif data.action == "reject":
        if transfer["status"] not in ("requested", "approved"):
            raise HTTPException(400, "Can only reject pending transfers")
        
        await _db.member_transfers.update_one(
            {"transfer_id": transfer_id},
            {"$set": {"status": "rejected"}}
        )
        
    elif data.action == "complete":
        if transfer["status"] != "approved":
            raise HTTPException(400, "Can only complete approved transfers")
        
        # Only owner can complete
        if user["role"] != "OWNER":
            raise HTTPException(403, "Only owner can complete transfers")
        
        # Update member location
        await _db.members.update_one(
            {"member_id": transfer["member_id"]},
            {"$set": {"location_id": transfer["to_location_id"], "updated_at": now}}
        )
        
        # Update user location
        await _db.users.update_one(
            {"member_id": transfer["member_id"]},
            {"$set": {"location_id": transfer["to_location_id"], "updated_at": now}}
        )
        
        # Update memberships location
        await _db.memberships.update_many(
            {"member_id": transfer["member_id"]},
            {"$set": {"location_id": transfer["to_location_id"], "updated_at": now}}
        )
        
        # Note: Payment history stays with original location_id for audit
        
        await _db.member_transfers.update_one(
            {"transfer_id": transfer_id},
            {"$set": {"status": "completed", "completed_at": now}}
        )
    
    return await _db.member_transfers.find_one({"transfer_id": transfer_id}, {"_id": 0})


# ─── Member Expenses (manual location expenses) ────────────────────

@router.post("/member-expenses", status_code=201)
async def create_member_expense(data: ExpenseCreate, request: Request, location_id: str = None):
    """Create a manual expense record."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    expense_id = f"mexp_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    expense_doc = {
        "expense_id": expense_id,
        "location_id": location_id,
        "title": data.title,
        "category": data.category,
        "amount": data.amount,
        "currency": data.currency,
        "expense_date": data.expense_date,
        "note": data.note,
        "created_by_user_id": user["user_id"],
        "created_at": now,
    }
    
    await _db.member_expenses.insert_one(expense_doc)
    expense_doc.pop("_id", None)
    
    return expense_doc


@router.get("/member-expenses")
async def list_member_expenses(
    request: Request,
    category: str = None,
    date_from: str = None,
    date_to: str = None,
    location_id: str = None
):
    """List expenses for a location."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    query = {"location_id": location_id}
    if category:
        query["category"] = category
    if date_from:
        query["expense_date"] = {"$gte": date_from}
    if date_to:
        query.setdefault("expense_date", {})
        if isinstance(query.get("expense_date"), dict):
            query["expense_date"]["$lte"] = date_to
        else:
            query["expense_date"] = {"$lte": date_to}
    
    expenses = await _db.member_expenses.find(query, {"_id": 0}).sort("expense_date", -1).to_list(500)
    return {"expenses": expenses}


# ─── Dashboard Alerts ──────────────────────────────────────────────

@router.get("/dashboard/alerts")
async def get_dashboard_alerts(request: Request, location_id: str = None):
    """Get dashboard alerts for memberships expiring, expired, payments due."""
    user = await require_member_access(request)
    location_id = await get_user_location(user, request)
    
    today = date.today().isoformat()
    seven_days = (date.today() + __import__('datetime').timedelta(days=7)).isoformat()
    
    # Expiring in 7 days
    expiring_query = {
        "location_id": location_id,
        "status": "active",
        "end_date": {"$gte": today, "$lte": seven_days}
    }
    expiring_count = await _db.memberships.count_documents(expiring_query)
    expiring_list = await _db.memberships.find(expiring_query, {"_id": 0}).limit(10).to_list(10)
    
    # Enrich expiring with member names
    for m in expiring_list:
        member = await _db.members.find_one({"member_id": m["member_id"]}, {"_id": 0, "full_name": 1, "member_no": 1})
        m["member_name"] = member["full_name"] if member else "Unknown"
        m["member_no"] = member.get("member_no", "") if member else ""
    
    # Expired
    expired_query = {
        "location_id": location_id,
        "status": "active",
        "end_date": {"$lt": today}
    }
    expired_count = await _db.memberships.count_documents(expired_query)
    expired_list = await _db.memberships.find(expired_query, {"_id": 0}).limit(10).to_list(10)
    
    for m in expired_list:
        member = await _db.members.find_one({"member_id": m["member_id"]}, {"_id": 0, "full_name": 1, "member_no": 1})
        m["member_name"] = member["full_name"] if member else "Unknown"
        m["member_no"] = member.get("member_no", "") if member else ""
    
    # Payments due (pending payments)
    payments_due_query = {
        "location_id": location_id,
        "status": "pending"
    }
    payments_due_count = await _db.payments.count_documents(payments_due_query)
    payments_due_list = await _db.payments.find(payments_due_query, {"_id": 0}).limit(10).to_list(10)
    
    for p in payments_due_list:
        member = await _db.members.find_one({"member_id": p["member_id"]}, {"_id": 0, "full_name": 1})
        p["member_name"] = member["full_name"] if member else "Unknown"
    
    return {
        "expiring_soon": {"count": expiring_count, "items": expiring_list},
        "expired": {"count": expired_count, "items": expired_list},
        "payments_due": {"count": payments_due_count, "items": payments_due_list},
    }


# ─── Seed Data ─────────────────────────────────────────────────────

@router.post("/seed-members")
async def seed_members_data(request: Request):
    """Seed sample members data for testing."""
    user = await _get_current_user(request)
    if user["role"] != "OWNER":
        raise HTTPException(403, "Owner only")
    
    # Check if already seeded
    existing = await _db.members.find_one({})
    if existing:
        return {"message": "Members data already seeded"}
    
    locations = await _db.locations.find(
        {"owner_id": user["user_id"], "is_deleted": False}, {"_id": 0}
    ).to_list(10)
    
    if not locations:
        raise HTTPException(400, "No locations found. Run /api/seed first.")
    
    now = datetime.now(timezone.utc).isoformat()
    today = date.today()
    
    totals = {"members": 0, "memberships": 0, "agreements": 0, "payment_plans": 0, "payments": 0}
    
    # Sample agreement template
    agreement_content = """
    <h2>Membership Agreement</h2>
    <p>By signing this agreement, you acknowledge and accept the following terms:</p>
    <ul>
        <li>Membership fees are non-refundable</li>
        <li>You agree to follow all gym rules and safety guidelines</li>
        <li>Medical conditions must be disclosed</li>
        <li>The gym is not liable for injuries resulting from improper use of equipment</li>
    </ul>
    <p>I understand and agree to these terms.</p>
    """
    
    for loc in locations:
        lid = loc["location_id"]
        
        # Create agreement template
        agreement_id = f"agreement_{uuid.uuid4().hex[:12]}"
        await _db.agreements.insert_one({
            "agreement_id": agreement_id,
            "location_id": lid,
            "title": "Standard Membership Agreement",
            "version": "1.0",
            "content_html": agreement_content,
            "pdf_url": None,
            "is_active": True,
            "deleted_at": None,
            "created_at": now,
            "updated_at": now,
        })
        totals["agreements"] += 1
        
        # Create payment plans
        plans = [
            {"name": "Monthly Basic", "billing_cycle": "monthly", "price": 299, "full_access": False},
            {"name": "Monthly Premium", "billing_cycle": "monthly", "price": 499, "full_access": True},
            {"name": "Quarterly Premium", "billing_cycle": "quarterly", "price": 1299, "full_access": True},
            {"name": "Yearly Premium", "billing_cycle": "yearly", "price": 4499, "full_access": True},
        ]
        
        plan_ids = []
        for plan in plans:
            plan_id = f"plan_{uuid.uuid4().hex[:12]}"
            plan_ids.append(plan_id)
            await _db.payment_plans.insert_one({
                "plan_id": plan_id,
                "location_id": lid,
                "name": plan["name"],
                "billing_cycle": plan["billing_cycle"],
                "price": plan["price"],
                "currency": "AED",
                "includes": {"full_access": plan["full_access"], "program_ids": []},
                "is_active": True,
                "deleted_at": None,
                "created_at": now,
                "updated_at": now,
            })
            totals["payment_plans"] += 1
        
        # Create sample members
        sample_members = [
            {"name": "Ahmad Hassan", "gender": "male", "email": "ahmad.hassan@example.com", "phone": "+971501234567"},
            {"name": "Fatima Al Maktoum", "gender": "female", "email": "fatima.almaktoum@example.com", "phone": "+971502345678"},
            {"name": "Mohammed Khalid", "gender": "male", "email": "mohammed.khalid@example.com", "phone": "+971503456789"},
            {"name": "Sara Abdullah", "gender": "female", "email": "sara.abdullah@example.com", "phone": "+971504567890"},
            {"name": "Omar Farouk", "gender": "male", "email": "omar.farouk@example.com", "phone": "+971505678901"},
        ]
        
        for i, sample in enumerate(sample_members):
            member_id = f"member_{uuid.uuid4().hex[:12]}"
            member_no = f"SP-{loc['name'].split()[-1][:3].upper()}-{i+1:04d}"
            
            # Create member
            member_doc = {
                "member_id": member_id,
                "location_id": lid,
                "member_no": member_no,
                "full_name": sample["name"],
                "gender": sample["gender"],
                "dob": f"{1985 + i}-0{i+1}-15",
                "phone": sample["phone"],
                "email": f"{lid[:8]}_{sample['email']}",  # Make email unique per location
                "address": f"Building {i+1}, Street {i+10}, {loc['city']}",
                "emergency_contact": {
                    "name": f"Emergency Contact {i+1}",
                    "phone": f"+9715067890{i}",
                    "relation": "Family"
                },
                "medical": {
                    "conditions": "",
                    "injuries": "",
                    "allergies": "None" if i % 2 == 0 else "",
                    "medications": "",
                    "notes": "",
                    "doctor_name": "",
                    "doctor_phone": "",
                    "consent": True
                },
                "profile_photo_url": None,
                "is_active": True,
                "deleted_at": None,
                "created_by_user_id": user["user_id"],
                "created_at": now,
                "updated_at": now,
            }
            await _db.members.insert_one(member_doc)
            totals["members"] += 1
            
            # Create user account for member
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            await _db.users.insert_one({
                "user_id": user_id,
                "email": member_doc["email"],
                "name": sample["name"],
                "password_hash": _pwd_context.hash("Member2024!"),
                "picture": None,
                "role": "MEMBER",
                "location_id": lid,
                "owner_id": loc["owner_id"],
                "member_id": member_id,
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            })
            
            # Update member with user_id
            await _db.members.update_one(
                {"member_id": member_id},
                {"$set": {"user_id": user_id}}
            )
            
            # Create membership
            membership_id = f"membership_{uuid.uuid4().hex[:12]}"
            start = today - __import__('datetime').timedelta(days=30 * (i % 3))
            end = start + __import__('datetime').timedelta(days=90 + (30 * i))
            
            # Sign agreement
            signed_id = f"signed_{uuid.uuid4().hex[:12]}"
            await _db.signed_agreements.insert_one({
                "signed_agreement_id": signed_id,
                "location_id": lid,
                "agreement_id": agreement_id,
                "member_id": member_id,
                "signed_at": now,
                "signature_data": None,
                "checkbox_agreed": True,
                "signed_ip": "127.0.0.1",
                "signer_name": sample["name"],
                "document_snapshot": {
                    "title": "Standard Membership Agreement",
                    "version": "1.0",
                    "content_html": agreement_content,
                },
                "created_at": now,
            })
            
            status = "active" if i < 3 else ("expired" if i == 3 else "pending")
            await _db.memberships.insert_one({
                "membership_id": membership_id,
                "location_id": lid,
                "member_id": member_id,
                "type": "full_access" if i % 2 == 0 else "dedicated_program",
                "program_id": None,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "payment_plan_id": plan_ids[i % len(plan_ids)],
                "status": status,
                "auto_renew": i % 2 == 0,
                "signed_agreement_id": signed_id,
                "created_at": now,
                "updated_at": now,
            })
            totals["memberships"] += 1
            
            # Create payment
            payment_id = f"payment_{uuid.uuid4().hex[:12]}"
            await _db.payments.insert_one({
                "payment_id": payment_id,
                "location_id": lid,
                "member_id": member_id,
                "membership_id": membership_id,
                "method": "cash" if i % 2 == 0 else "online",
                "provider_ref": None if i % 2 == 0 else f"ref_{uuid.uuid4().hex[:8]}",
                "amount": plans[i % len(plans)]["price"],
                "currency": "AED",
                "status": "paid" if status == "active" else "pending",
                "paid_at": now if status == "active" else None,
                "due_date": None,
                "created_by_user_id": user["user_id"],
                "receipt_info": "Cash payment received" if i % 2 == 0 else "",
                "created_at": now,
                "updated_at": now,
            })
            totals["payments"] += 1
    
    return {"message": "Members data seeded", **totals}


# ─── Public Self-Registration ──────────────────────────────────────

@router.get("/public/location/{location_id}/info")
async def get_public_location_info(location_id: str):
    """Get public location info for self-registration."""
    loc = await _db.locations.find_one({
        "location_id": location_id,
        "is_deleted": False,
        "status": "active"
    }, {"_id": 0, "owner_id": 0})
    
    if not loc:
        raise HTTPException(404, "Location not found")
    
    plans_docs = await _db.pricing_plans.find(
        {"is_active": {"$ne": False}},
        {"_id": 0},
    ).sort("sort_order", 1).to_list(100)

    if not plans_docs:
        plans_docs = await _db.payment_plans.find({
            "location_id": location_id,
            "is_active": True,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        }, {"_id": 0}).to_list(20)

    plans = []
    for p in plans_docs:
        plans.append({
            "plan_id": p.get("plan_id"),
            "name": p.get("name"),
            "price": p.get("price"),
            "currency": p.get("currency", "AED"),
            "billing_cycle": p.get("billing_cycle") or p.get("billing_period", "monthly"),
            "billing_period": p.get("billing_period"),
            "description": p.get("description", ""),
            "features": p.get("features", []),
            "is_active": p.get("is_active", True),
            "is_popular": p.get("is_popular", False),
            "membership_type": _normalize_membership_type(p.get("membership_type") or "full_access"),
        })
    
    # Get active agreements
    agreements = await _db.agreements.find({
        "location_id": location_id,
        "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    }, {"_id": 0}).to_list(10)
    
    # Get programs for dedicated memberships
    programs = await _db.programs.find({
        "location_id": location_id,
        "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    }, {"_id": 0, "program_id": 1, "name": 1, "description": 1}).to_list(50)
    
    return {
        "location": loc,
        "payment_plans": plans,
        "agreements": agreements,
        "programs": programs
    }


@router.post("/public/register", status_code=201)
async def public_self_register(data: MemberCreate, request: Request, location_id: str = Query(...)):
    """
    Public self-registration for members.
    SECURITY: This endpoint ALWAYS creates users with role=MEMBER.
    Admin roles cannot be created through this public endpoint.
    """
    client_ip = request.client.host if request.client else "unknown"
    
    # Verify location exists and is active
    loc = await _db.locations.find_one({
        "location_id": location_id,
        "is_deleted": False,
        "status": "active"
    })
    if not loc:
        # Generic error message - don't reveal if location exists
        raise HTTPException(400, "Registration failed. Please contact support.")
    
    # Check for duplicate email
    if data.email:
        existing_member = await _db.members.find_one({
            "location_id": location_id,
            "email": data.email,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        existing_user = await _db.users.find_one({"email": data.email})
        
        if existing_member or existing_user:
            raise HTTPException(400, "Email already registered. Please log in.")

    if not data.accept_terms:
        raise HTTPException(400, "Terms & Conditions must be accepted")
    
    member_id = f"member_{uuid.uuid4().hex[:12]}"
    member_no = await generate_member_no(location_id)
    now = datetime.now(timezone.utc).isoformat()
    
    member_doc = {
        "member_id": member_id,
        "location_id": location_id,
        "member_no": member_no,
        "primary_member_id": None,
        "relationship": "",
        "dependent_type": None,
        "full_name": data.full_name,
        "gender": data.gender,
        "dob": data.dob,
        "phone": data.phone,
        "email": data.email,
        "address": data.address,
        "emergency_contact": data.emergency_contact.model_dump(),
        "medical": data.medical.model_dump(),
        "profile_photo_url": data.profile_photo_url,
        "terms_accepted_at": now,
        "terms_signed_agreement_id": None,
        "is_active": True,
        "deleted_at": None,
        "created_by_user_id": None,  # Self-registered
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.members.insert_one(member_doc)
    
    # Create user account with MEMBER role (SECURITY: role is ALWAYS MEMBER)
    user_id = None
    temp_password = None
    if data.email:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        raw_password = (data.password or "").strip()
        if raw_password:
            if len(raw_password) < 6:
                raise HTTPException(400, "Password must be at least 6 characters")
        else:
            temp_password = secrets.token_urlsafe(8)
            raw_password = temp_password
        user_doc = {
            "user_id": user_id,
            "email": data.email,
            "name": data.full_name,
            "password_hash": _pwd_context.hash(raw_password),
            "picture": data.profile_photo_url,
            "role": "MEMBER",  # SECURITY: ALWAYS MEMBER - never trust any client input
            "location_id": location_id,
            "owner_id": loc["owner_id"],
            "member_id": member_id,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await _db.users.insert_one(user_doc)
        
        await _db.members.update_one(
            {"member_id": member_id},
            {"$set": {"user_id": user_id}}
        )
        
        logger.info(f"New MEMBER registered via public form at location {location_id}")
    
    agreement = await _pick_active_agreement(location_id, data.agreement_id)
    if agreement:
        signed = await _create_signed_agreement_for_member(
            request=request,
            location_id=location_id,
            member_id=member_id,
            agreement=agreement,
            signer_name=data.full_name,
            checkbox_agreed=True,
            signature_data=None,
            created_by_user_id=None,
        )
        await _db.members.update_one(
            {"member_id": member_id},
            {"$set": {"terms_signed_agreement_id": signed["signed_agreement_id"]}},
        )
        member_doc["terms_signed_agreement_id"] = signed["signed_agreement_id"]

    email_norm = (data.email or "").strip().lower()
    phone_norm = "".join(ch for ch in (data.phone or "") if ch.isdigit())

    existing_lead = await sales_identity.find_lead_by_email_phone(
        _db,
        email_norm,
        phone_norm,
        location_scope={"location_id": location_id} if location_id else None,
    )

    if existing_lead:
        await _db.sales_leads.update_one(
            {"sales_lead_id": existing_lead["sales_lead_id"]},
            {
                "$set": {
                    "linked_member_id": member_id,
                    "status": "converted",
                    "pipeline_stage": "converted",
                    "converted_at": now,
                    "updated_at": now,
                },
                "$addToSet": {"tags": "website_join_form"},
            },
        )
        ev_id = f"sle_{uuid.uuid4().hex[:12]}"
        await _db.sales_lead_events.insert_one(
            {
                "sales_lead_event_id": ev_id,
                "sales_lead_id": existing_lead["sales_lead_id"],
                "type": "CONVERTED",
                "payload": {"source": "WEBSITE_JOIN_FORM", "member_id": member_id},
                "actor_user_id": user_id,
                "actor_role": "PUBLIC",
                "actor_staff_id": None,
                "created_at": now,
            }
        )
    else:
        lead_id = f"lead_{uuid.uuid4().hex[:12]}"
        lead_doc = {
            "sales_lead_id": lead_id,
            "location_id": location_id,
            "assigned_location_id": location_id,
            "contact_submission_id": None,
            "contact_submission_ids": [],
            "full_name": data.full_name,
            "phone": data.phone,
            "phone_norm": phone_norm,
            "phone_number": data.phone,
            "email": data.email,
            "email_norm": email_norm,
            "source": "WEBSITE_JOIN_FORM",
            "source_platform": "website",
            "campaign_name": "",
            "adset_or_adgroup": "",
            "source_reference": "public_register",
            "source_ref": {},
            "discipline_slug": None,
            "plan_id": None,
            "status": "converted",
            "pipeline_stage": "converted",
            "assigned_team_id": None,
            "assigned_agent_staff_id": None,
            "assigned_csr_staff_id": None,
            "assigned_team_lead_staff_id": None,
            "last_contact_date": None,
            "next_follow_up_date": None,
            "notes": "Converted via website join form",
            "gender": data.gender,
            "address": data.address,
            "purpose": "self",
            "program_interest": "",
            "membership_plan": "",
            "lead_priority": "MEDIUM",
            "lead_temperature": "warm",
            "temperature": "WARM",
            "preferred_contact_method": "",
            "preferred_contact_time": "",
            "tags": ["website_join_form"],
            "linked_member_id": member_id,
            "duplicate_of_lead_id": None,
            "membership_type": None,
            "membership_plan_id": None,
            "membership_start_date": None,
            "membership_end_date": None,
            "membership_price": None,
            "currency": "AED",
            "created_at": now,
            "updated_at": now,
            "converted_at": now,
        }
        await _db.sales_leads.insert_one(lead_doc)
        ev_id = f"sle_{uuid.uuid4().hex[:12]}"
        await _db.sales_lead_events.insert_one(
            {
                "sales_lead_event_id": ev_id,
                "sales_lead_id": lead_id,
                "type": "CREATED",
                "payload": {"source": "WEBSITE_JOIN_FORM", "member_id": member_id, "auto_converted": True},
                "actor_user_id": user_id,
                "actor_role": "PUBLIC",
                "actor_staff_id": None,
                "created_at": now,
            }
        )

    member_doc.pop("_id", None)
    member_doc["user_id"] = user_id
    member_doc["temp_password"] = temp_password
    member_doc["sales_attribution"] = {
        "sales_lead_id": existing_lead.get("sales_lead_id") if existing_lead else lead_id,
        "csr_staff_id": None,
        "team_lead_staff_id": None,
        "location_id": location_id,
        "source": "WEBSITE_JOIN_FORM",
        "source_platform": "website",
        "campaign_name": "",
        "adset_or_adgroup": "",
        "source_reference": "public_register",
        "converted_at": now,
    }

    await _db.members.update_one(
        {"member_id": member_id},
        {"$set": {"sales_attribution": member_doc["sales_attribution"], "updated_at": now}},
    )
    
    return member_doc
