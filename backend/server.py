from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import re
import mimetypes
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
import random
from datetime import datetime, timezone, timedelta
import jwt
import httpx
import aiofiles
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

pwd_context = CustomPwdContext()

ROOT_DIR = Path(__file__).parent
ENV_FILE = ROOT_DIR / ".env"
ENV_LOADED = load_dotenv(ENV_FILE, override=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Auth config
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_DAYS = int(os.environ.get('JWT_EXPIRY_DAYS', '7'))


_environment_raw = os.environ.get("ENVIRONMENT", "").strip().lower()
if _environment_raw:
    ENVIRONMENT = _environment_raw
else:
    _cors_raw = os.environ.get("CORS_ORIGINS", "") or ""
    _cookie_secure_hint = (os.environ.get("COOKIE_SECURE") or "").strip().lower() == "true"
    _prod_host_hint = ("spartans.mc1services.com" in _cors_raw) or ("spartansapi.mc1services.com" in _cors_raw)
    ENVIRONMENT = "production" if (_cookie_secure_hint or _prod_host_hint) else "local"

IS_PRODUCTION = ENVIRONMENT in ("prod", "production")

# Cookie security config
# - Local dev over HTTP: Secure=false + SameSite=Lax (works without HTTPS)
# - Production over HTTPS: Secure=true + SameSite=None (required for cross-site cookies)
COOKIE_SECURE = True if IS_PRODUCTION else (os.environ.get("COOKIE_SECURE", "false").lower() == "true")

_cookie_samesite_raw = (os.environ.get("COOKIE_SAMESITE") or "").strip().lower()
if _cookie_samesite_raw:
    COOKIE_SAMESITE = _cookie_samesite_raw
else:
    COOKIE_SAMESITE = "none" if IS_PRODUCTION or COOKIE_SECURE else "lax"

def _set_session_cookie(response: Response, session_token: str):
    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE,
        path="/", max_age=JWT_EXPIRY_DAYS * 86400
    )

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup tasks
    try:
        await db.command("ping")
        logger.info("DB connected")
    except Exception as e:
        logger.error("DB connection failed: %s", str(e))
        raise

    logger.info("Starting up background tasks...")
    import asyncio
    import recurring_payments
    
    # Initialize background jobs module
    recurring_payments.init(db)
    task = asyncio.create_task(recurring_payments.start_scheduler())
    
    yield
    
    # Shutdown tasks
    logger.info("Shutting down background tasks...")
    task.cancel()

app = FastAPI(title="Spartans ERP API", version="1.0.0", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Security logger for audit trail
security_logger = logging.getLogger("security_audit")
security_logger.setLevel(logging.WARNING)

# ─── Pydantic Models ───────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    location_id: Optional[str] = None
    owner_id: Optional[str] = None
    is_active: bool = True

class LocationCreate(BaseModel):
    name: str
    address: str = ""
    city: str = ""
    country: str = "UAE"
    phone: str = ""
    email: str = ""
    logo_url: Optional[str] = None
    timezone: str = "Asia/Dubai"
    default_currency: str = "AED"
    slug: Optional[str] = None

class LocationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    timezone: Optional[str] = None
    default_currency: Optional[str] = None
    status: Optional[str] = None
    slug: Optional[str] = None

class LocationResponse(BaseModel):
    location_id: str
    owner_id: str
    name: str
    address: str
    city: str
    country: str
    phone: str
    email: str
    logo_url: Optional[str] = None
    timezone: str
    default_currency: str
    status: str
    is_deleted: bool
    created_at: str
    updated_at: str
    slug: Optional[str] = None

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

# ─── Auth Helpers ──────────────────────────────────────────────────

def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    # Check cookie first
    token = request.cookies.get("session_token")
    # Fallback to Authorization header
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if it's a session token (from Google OAuth)
    session_doc = await db.user_sessions.find_one(
        {"session_token": token}, {"_id": 0}
    )
    if session_doc:
        expires_at = session_doc["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        user_id = session_doc["user_id"]
    else:
        # Try JWT decode
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload["user_id"]
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="User deactivated")
    if user.get("role") == "OWNER" and user.get("owner_id") and user.get("owner_id") != user.get("user_id"):
        now = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"role": "OWNER_FULL", "updated_at": now}},
        )
        user["role"] = "OWNER_FULL"
    return user

def require_role(*roles):
    async def role_checker(request: Request):
        user = await get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return role_checker

# ─── Auth Endpoints ────────────────────────────────────────────────

class OwnerRegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    role: Optional[str] = None  # Accept but ignore - always OWNER for this endpoint


@api_router.post("/auth/register")
async def register_owner(data: OwnerRegisterRequest, request: Request, response: Response):
    """
    Register a new OWNER account. This endpoint is for gym/fitness center owners only.
    Role is always enforced as OWNER regardless of any role parameter provided.
    Members should use /api/public/register instead.
    """
    # Security: Log any attempt to specify a role (potential attack)
    if data.role and data.role != "OWNER":
        client_ip = request.client.host if request.client else "unknown"
        security_logger.warning(
            f"SECURITY_ALERT: Role escalation attempt on /auth/register | "
            f"IP: {client_ip} | Email: {data.email} | Attempted role: {data.role}"
        )
    
    email = (data.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    existing = await db.users.find_one({"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": pwd_context.hash(data.password),
        "picture": None,
        "role": "OWNER",  # SECURITY: Always OWNER - never trust client input
        "location_id": None,
        "owner_id": None,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    await db.users.insert_one(user_doc)
    
    logger.info(f"New OWNER account created: {data.email} (user_id: {user_id})")
    
    token = create_jwt_token(user_id)
    session_token = f"session_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS)).isoformat(),
        "created_at": now
    })
    
    _set_session_cookie(response, session_token)
    
    user_resp = {k: v for k, v in user_doc.items() if k not in ("password_hash", "_id")}
    return {"token": token, "user": user_resp}

@api_router.post("/auth/login")
async def login(data: UserLogin, response: Response):
    email_raw = (data.email or "").strip()
    if not email_raw:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    email_norm = email_raw.lower()
    user = await db.users.find_one({"email": {"$regex": f"^{re.escape(email_norm)}$", "$options": "i"}}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Please use Google login for this account")
    if not pwd_context.verify(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account deactivated")
    
    token = create_jwt_token(user["user_id"])
    session_token = f"session_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc).isoformat()
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS)).isoformat(),
        "created_at": now
    })
    
    _set_session_cookie(response, session_token)
    
    user_resp = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return {"token": token, "user": user_resp}

@api_router.get("/auth/session")
async def process_google_session(session_id: str, request: Request, response: Response):
    """
    Process Google OAuth session_id and create local session.
    
    For local development:
    - Set GOOGLE_OAUTH_ENABLED=false in .env to disable this endpoint
    - Use email/password login instead
    
    New users via Google OAuth are registered as OWNER (gym owner signup flow).
    Members should be created via /api/public/register or admin panel.
    """
    # Check if Google OAuth is enabled
    google_oauth_enabled = os.environ.get('GOOGLE_OAUTH_ENABLED', 'false').lower() == 'true'
    oauth_session_url = os.environ.get('GOOGLE_OAUTH_SESSION_URL', '')
    
    if not google_oauth_enabled or not oauth_session_url:
        raise HTTPException(status_code=503, detail="Google OAuth is disabled. Use email/password login.")
    
    async with httpx.AsyncClient() as http_client:
        try:
            resp = await http_client.get(
                oauth_session_url,
                headers={"X-Session-ID": session_id},
                timeout=10
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            session_data = resp.json()
        except httpx.RequestError:
            raise HTTPException(status_code=502, detail="Auth service unavailable")
    
    email = session_data["email"]
    name = session_data.get("name", "")
    picture = session_data.get("picture", "")
    
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    
    if existing:
        user_id = existing["user_id"]
        # SECURITY: Preserve existing role - do NOT allow role change via OAuth
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "updated_at": now}}
        )
        user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        logger.info(f"Google OAuth login for existing user: {email} (role: {user_doc.get('role')})")
    else:
        # New user via Google OAuth - create as OWNER (gym owner signup flow)
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "password_hash": None,
            "picture": picture,
            "role": "OWNER",  # SECURITY: New Google OAuth users are OWNER by default
            "location_id": None,
            "owner_id": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
        await db.users.insert_one(user_doc)
        logger.info(f"New OWNER account created via Google OAuth: {email} (user_id: {user_id})")
    
    session_token = f"session_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS)).isoformat(),
        "created_at": now
    })
    
    _set_session_cookie(response, session_token)
    
    token = create_jwt_token(user_id)
    user_resp = {k: v for k, v in user_doc.items() if k not in ("password_hash", "_id")}
    return {"token": token, "user": user_resp}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    user_resp = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return user_resp

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        bearer_token = auth_header[7:]
        await db.user_sessions.delete_one({"session_token": bearer_token})
    response.delete_cookie(key="session_token", path="/", secure=COOKIE_SECURE, samesite=COOKIE_SAMESITE)
    return {"message": "Logged out"}

# ─── Location Endpoints ───────────────────────────────────────────

@api_router.post("/locations", status_code=201)
async def create_location(data: LocationCreate, request: Request):
    user = await get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.manage_locations")
    elif user.get("role") != "OWNER":
        raise HTTPException(status_code=403, detail="Only owners can create locations")
    
    location_id = f"loc_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    loc_doc = {
        "location_id": location_id,
        "owner_id": owner_id,
        "name": data.name,
        "address": data.address,
        "city": data.city,
        "country": data.country,
        "phone": data.phone,
        "email": data.email,
        "logo_url": data.logo_url,
        "timezone": data.timezone,
        "default_currency": data.default_currency,
        "status": "active",
        "is_deleted": False,
        "created_at": now,
        "updated_at": now,
        "slug": data.slug
    }
    await db.locations.insert_one(loc_doc)
    loc_doc.pop("_id", None)
    return loc_doc

@api_router.get("/locations")
async def list_locations(request: Request):
    user = await get_current_user(request)
    if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
        owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
        locations = await db.locations.find(
            {"owner_id": owner_id, "is_deleted": False}, {"_id": 0}
        ).to_list(100)
    elif user.get("location_id"):
        # For any role that is tied to a specific location (MANAGER_*, RECEPTIONIST_*, INSTRUCTOR, etc.)
        locations = await db.locations.find(
            {"location_id": user.get("location_id"), "is_deleted": False}, {"_id": 0}
        ).to_list(10)
    else:
        locations = []
    return locations

@api_router.get("/locations/{location_id}")
async def get_location(location_id: str, request: Request):
    user = await get_current_user(request)
    loc = await db.locations.find_one(
        {"location_id": location_id, "is_deleted": False}, {"_id": 0}
    )
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    
    # Access control
    if user["role"] in ("OWNER", "OWNER_FULL"):
        owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
        if loc["owner_id"] != owner_id:
            raise HTTPException(status_code=403, detail="Not your location")
    if user["role"] not in ("OWNER", "OWNER_FULL") and user.get("location_id") != location_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return loc

@api_router.patch("/locations/{location_id}")
async def update_location(location_id: str, data: LocationUpdate, request: Request):
    user = await get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.manage_locations")
    elif user.get("role") != "OWNER":
        raise HTTPException(status_code=403, detail="Only owners can update locations")
    
    loc = await db.locations.find_one(
        {"location_id": location_id, "is_deleted": False}, {"_id": 0}
    )
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    if loc["owner_id"] != owner_id:
        raise HTTPException(status_code=403, detail="Not your location")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.locations.update_one(
        {"location_id": location_id},
        {"$set": update_data}
    )
    
    updated = await db.locations.find_one({"location_id": location_id}, {"_id": 0})
    return updated

@api_router.delete("/locations/{location_id}")
async def delete_location(location_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.manage_locations")
    elif user.get("role") != "OWNER":
        raise HTTPException(status_code=403, detail="Only owners can delete locations")
    
    loc = await db.locations.find_one(
        {"location_id": location_id, "is_deleted": False}, {"_id": 0}
    )
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    if loc["owner_id"] != owner_id:
        raise HTTPException(status_code=403, detail="Not your location")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.locations.update_one(
        {"location_id": location_id},
        {"$set": {"is_deleted": True, "status": "inactive", "updated_at": now}}
    )
    return {"message": "Location deleted"}


@api_router.post("/locations/{location_id}/restore")
async def restore_location(location_id: str, request: Request):
    """Restore a soft-deleted location"""
    user = await get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.manage_locations")
    elif user.get("role") != "OWNER":
        raise HTTPException(status_code=403, detail="Only owners can restore locations")
    
    loc = await db.locations.find_one(
        {"location_id": location_id, "is_deleted": True}, {"_id": 0}
    )
    if not loc:
        raise HTTPException(status_code=404, detail="Deleted location not found")
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    if loc["owner_id"] != owner_id:
        raise HTTPException(status_code=403, detail="Not your location")
    
    now = datetime.now(timezone.utc).isoformat()
    await db.locations.update_one(
        {"location_id": location_id},
        {"$set": {"is_deleted": False, "status": "active", "updated_at": now}}
    )
    return await db.locations.find_one({"location_id": location_id}, {"_id": 0})


@api_router.get("/locations/all/include-deleted")
async def list_all_locations_including_deleted(request: Request):
    """List all locations including deleted ones (Owner only)"""
    user = await get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.manage_locations")
    elif user.get("role") != "OWNER":
        raise HTTPException(status_code=403, detail="Only owners can view deleted locations")
    
    locations = await db.locations.find(
        {"owner_id": user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")},
        {"_id": 0}
    ).to_list(100)
    return locations

# ─── Users per location ───────────────────────────────────────────

@api_router.get("/locations/{location_id}/users")
async def get_location_users(location_id: str, request: Request):
    user = await get_current_user(request)
    loc = await db.locations.find_one({"location_id": location_id, "is_deleted": False}, {"_id": 0})
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    if user["role"] in ("OWNER", "OWNER_FULL"):
        owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
        if loc["owner_id"] != owner_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    users = await db.users.find(
        {"location_id": location_id, "is_active": True},
        {"_id": 0, "password_hash": 0}
    ).to_list(500)
    return users

# ─── Dashboard Stats ──────────────────────────────────────────────

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(request: Request):
    user = await get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.view_dashboard")
    elif user.get("role") != "OWNER":
        raise HTTPException(status_code=403, detail="Owner access only")
    
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    total_locations = await db.locations.count_documents({"owner_id": owner_id, "is_deleted": False})
    active_locations = await db.locations.count_documents({"owner_id": owner_id, "is_deleted": False, "status": "active"})
    total_managers = await db.users.count_documents({"owner_id": owner_id, "role": "LOCATION_MANAGER", "is_active": True})
    total_customers = await db.users.count_documents({"owner_id": owner_id, "role": "CUSTOMER", "is_active": True})
    
    return {
        "total_locations": total_locations,
        "active_locations": active_locations,
        "total_managers": total_managers,
        "total_customers": total_customers
    }

# ─── Analytics Dashboard ──────────────────────────────────────────

@api_router.get("/analytics/owner-dashboard")
async def get_owner_analytics(request: Request):
    user = await get_current_user(request)
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.view_all_locations_reports")
    elif user.get("role") != "OWNER":
        raise HTTPException(status_code=403, detail="Owner access only")
    
    owner_id = user["user_id"] if user.get("role") == "OWNER" else user.get("owner_id")
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    # ── Key Metrics ──
    total_active_members = await db.users.count_documents({
        "owner_id": owner_id, "role": "CUSTOMER", "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    new_members_this_month = await db.users.count_documents({
        "owner_id": owner_id, "role": "CUSTOMER",
        "created_at": {"$gte": month_start},
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    
    location_ids = [loc["location_id"] async for loc in db.locations.find(
        {"owner_id": owner_id, "is_deleted": False}, {"location_id": 1}
    )]
    
    total_instructors = await db.instructors.count_documents({
        "location_id": {"$in": location_ids}, "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    total_programs = await db.programs.count_documents({
        "location_id": {"$in": location_ids}, "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    total_active_schedules = await db.class_schedules.count_documents({
        "location_id": {"$in": location_ids}, "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    
    # Monthly Revenue (payroll + expenses)
    payroll_pipeline = [
        {"$match": {"location_id": {"$in": location_ids}, "period_start": {"$gte": month_start[:10]}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_payable"}}}
    ]
    payroll_agg = await db.payroll_records.aggregate(payroll_pipeline).to_list(1)
    monthly_payroll = payroll_agg[0]["total"] if payroll_agg else 0
    
    expense_pipeline = [
        {"$match": {"location_id": {"$in": location_ids}, "date": {"$gte": month_start[:10]}, "is_deleted": {"$ne": True}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    expense_agg = await db.expenses.aggregate(expense_pipeline).to_list(1)
    monthly_expenses = expense_agg[0]["total"] if expense_agg else 0
    
    # Attendance Rate
    total_bookings = await db.bookings.count_documents({"location_id": {"$in": location_ids}})
    total_attendance = await db.attendance_records.count_documents({"location_id": {"$in": location_ids}})
    attendance_rate = round((total_attendance / total_bookings * 100), 1) if total_bookings > 0 else 0
    
    # ── Members Growth (Last 6 months) ──
    members_growth = []
    for i in range(5, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        end_m = m + 1
        end_y = y
        if end_m > 12:
            end_m = 1
            end_y += 1
        start_dt = f"{y:04d}-{m:02d}-01T00:00:00+00:00"
        end_dt = f"{end_y:04d}-{end_m:02d}-01T00:00:00+00:00"
        count = await db.users.count_documents({
            "owner_id": owner_id, "role": "CUSTOMER",
            "created_at": {"$gte": start_dt, "$lt": end_dt}
        })
        month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        members_growth.append({"month": month_names[m-1], "members": count})
    
    # ── Revenue by Month (Last 6 months) ──
    revenue_by_month = []
    for i in range(5, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        end_m = m + 1
        end_y = y
        if end_m > 12:
            end_m = 1
            end_y += 1
        start_date = f"{y:04d}-{m:02d}-01"
        end_date = f"{end_y:04d}-{end_m:02d}-01"
        
        pay_agg = await db.payroll_records.aggregate([
            {"$match": {"location_id": {"$in": location_ids}, "period_start": {"$gte": start_date, "$lt": end_date}}},
            {"$group": {"_id": None, "total": {"$sum": "$total_payable"}}}
        ]).to_list(1)
        exp_agg = await db.expenses.aggregate([
            {"$match": {"location_id": {"$in": location_ids}, "date": {"$gte": start_date, "$lt": end_date}, "is_deleted": {"$ne": True}}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        
        month_names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
        revenue_by_month.append({
            "month": month_names[m-1],
            "payroll": pay_agg[0]["total"] if pay_agg else 0,
            "expenses": exp_agg[0]["total"] if exp_agg else 0,
        })
    
    # ── Attendance by Program (top 10) ──
    att_by_prog_pipeline = [
        {"$match": {"location_id": {"$in": location_ids}}},
        {"$group": {"_id": "$program_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15}
    ]
    att_by_prog = await db.attendance_records.aggregate(att_by_prog_pipeline).to_list(15)
    prog_ids = [a["_id"] for a in att_by_prog if a["_id"]]
    progs = {p["program_id"]: p["name"] async for p in db.programs.find({"program_id": {"$in": prog_ids}}, {"_id": 0, "program_id": 1, "name": 1})}
    # Consolidate by program name across locations
    att_merged = {}
    for a in att_by_prog:
        if not a["_id"]:
            continue
        name = progs.get(a["_id"], "Unknown")
        att_merged[name] = att_merged.get(name, 0) + a["count"]
    attendance_by_program = sorted(
        [{"program": k, "attendance": v} for k, v in att_merged.items()],
        key=lambda x: x["attendance"], reverse=True
    )[:10]
    
    # ── Top 5 Programs by Enrollment (bookings) ──
    top_prog_pipeline = [
        {"$match": {"location_id": {"$in": location_ids}, "status": {"$ne": "CANCELLED"}}},
        {"$group": {"_id": "$program_id", "enrollments": {"$sum": 1}}},
        {"$sort": {"enrollments": -1}},
        {"$limit": 10}
    ]
    top_progs = await db.bookings.aggregate(top_prog_pipeline).to_list(10)
    top_prog_ids = [t["_id"] for t in top_progs if t["_id"]]
    top_prog_names = {p["program_id"]: p["name"] async for p in db.programs.find({"program_id": {"$in": top_prog_ids}}, {"_id": 0, "program_id": 1, "name": 1})}
    # Consolidate by program name across locations
    top_merged = {}
    for t in top_progs:
        if not t["_id"]:
            continue
        name = top_prog_names.get(t["_id"], "Unknown")
        top_merged[name] = top_merged.get(name, 0) + t["enrollments"]
    top_programs = sorted(
        [{"program": k, "enrollments": v} for k, v in top_merged.items()],
        key=lambda x: x["enrollments"], reverse=True
    )[:5]
    
    # ── Location Breakdown ──
    location_stats = []
    for lid in location_ids:
        loc = await db.locations.find_one({"location_id": lid}, {"_id": 0, "name": 1})
        loc_members = await db.users.count_documents({
            "location_id": lid, "role": "CUSTOMER", "is_active": True,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        loc_staff = await db.staff.count_documents({
            "location_id": lid, "is_active": True,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        loc_programs = await db.programs.count_documents({
            "location_id": lid, "is_active": True,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        location_stats.append({
            "name": loc["name"] if loc else "Unknown",
            "members": loc_members,
            "staff": loc_staff,
            "programs": loc_programs
        })
    
    # ── Member Statistics (from members collection) ──
    # Total registered members
    total_registered_members = await db.members.count_documents({
        "location_id": {"$in": location_ids},
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    
    # Members by status
    active_members = await db.members.count_documents({
        "location_id": {"$in": location_ids},
        "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    inactive_members = await db.members.count_documents({
        "location_id": {"$in": location_ids},
        "is_active": False,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    })
    deleted_members = await db.members.count_documents({
        "location_id": {"$in": location_ids},
        "deleted_at": {"$ne": None}
    })
    
    # Membership statistics
    active_memberships = await db.memberships.count_documents({
        "location_id": {"$in": location_ids},
        "status": "active"
    })
    expired_memberships = await db.memberships.count_documents({
        "location_id": {"$in": location_ids},
        "status": "expired"
    })
    pending_memberships = await db.memberships.count_documents({
        "location_id": {"$in": location_ids},
        "status": "pending"
    })
    
    # Payment statistics
    total_revenue_pipeline = [
        {"$match": {"location_id": {"$in": location_ids}, "status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    revenue_agg = await db.payments.aggregate(total_revenue_pipeline).to_list(1)
    total_member_revenue = revenue_agg[0]["total"] if revenue_agg else 0
    
    pending_payments = await db.payments.count_documents({
        "location_id": {"$in": location_ids},
        "status": "pending"
    })
    
    # Member stats by location
    member_location_stats = []
    for lid in location_ids:
        loc = await db.locations.find_one({"location_id": lid}, {"_id": 0, "name": 1})
        loc_name = loc["name"] if loc else "Unknown"
        
        loc_total = await db.members.count_documents({
            "location_id": lid,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        loc_active = await db.members.count_documents({
            "location_id": lid, "is_active": True,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        loc_inactive = await db.members.count_documents({
            "location_id": lid, "is_active": False,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        loc_active_memberships = await db.memberships.count_documents({
            "location_id": lid, "status": "active"
        })
        loc_expired_memberships = await db.memberships.count_documents({
            "location_id": lid, "status": "expired"
        })
        loc_pending_memberships = await db.memberships.count_documents({
            "location_id": lid, "status": "pending"
        })
        
        # Revenue for this location
        loc_rev_agg = await db.payments.aggregate([
            {"$match": {"location_id": lid, "status": "paid"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
        ]).to_list(1)
        loc_revenue = loc_rev_agg[0]["total"] if loc_rev_agg else 0
        
        member_location_stats.append({
            "location_name": loc_name,
            "total_members": loc_total,
            "active_members": loc_active,
            "inactive_members": loc_inactive,
            "active_memberships": loc_active_memberships,
            "expired_memberships": loc_expired_memberships,
            "pending_memberships": loc_pending_memberships,
            "revenue": loc_revenue
        })
    
    return {
        "metrics": {
            "total_active_members": total_active_members,
            "new_members_this_month": new_members_this_month,
            "total_instructors": total_instructors,
            "total_programs": total_programs,
            "total_active_schedules": total_active_schedules,
            "monthly_payroll": monthly_payroll,
            "monthly_expenses": monthly_expenses,
            "attendance_rate": attendance_rate,
            "total_bookings": total_bookings,
            "total_locations": len(location_ids),
            # New member metrics
            "total_registered_members": total_registered_members,
            "active_registered_members": active_members,
            "inactive_registered_members": inactive_members,
            "deleted_registered_members": deleted_members,
            "active_memberships": active_memberships,
            "expired_memberships": expired_memberships,
            "pending_memberships": pending_memberships,
            "total_member_revenue": total_member_revenue,
            "pending_payments": pending_payments
        },
        "members_growth": members_growth,
        "revenue_by_month": revenue_by_month,
        "attendance_by_program": attendance_by_program,
        "top_programs": top_programs,
        "location_stats": location_stats,
        "member_location_stats": member_location_stats
    }


# ─── Seed Data ─────────────────────────────────────────────────────

@api_router.post("/seed")
async def seed_data():
    # Check if already seeded
    existing_owner = await db.users.find_one({"email": "owner@spartans.com"}, {"_id": 0})
    if existing_owner:
        return {"message": "Already seeded", "owner_email": "owner@spartans.com"}
    
    now = datetime.now(timezone.utc).isoformat()
    owner_id = f"user_{uuid.uuid4().hex[:12]}"
    
    # ─── Seed Roles ───
    # Ensure default roles exist and get IDs
    owner_role_id = None
    manager_role_id = None
    
    # We'll use the rbac module's default role definitions if possible, 
    # but since we are inside server.py and want to avoid circular deps or complex imports,
    # we'll fetch them from DB or create them if rbac seed hasn't run yet.
    # Ideally, we should call rbac's seed function, but here we just need the IDs.
    # Let's try to find them first.
    
    owner_role = await db.roles.find_one({"code": "OWNER_FULL"})
    manager_role = await db.roles.find_one({"code": "MANAGER_FULL"})
    
    # If roles don't exist, we rely on the user running /api/admin/roles/seed later,
    # OR we can just leave admin_role_ids empty for now and let them fix it.
    # But to prevent broken state, let's auto-seed roles here if missing.
    
    if not owner_role or not manager_role:
        # Import default roles structure dynamically to avoid top-level circular import issues
        from rbac import DEFAULT_ROLES
        
        for role_data in DEFAULT_ROLES:
            existing = await db.roles.find_one({"code": role_data["code"]})
            if not existing:
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
                if role_data["code"] == "OWNER_FULL":
                    owner_role_id = role_id
                elif role_data["code"] == "MANAGER_FULL":
                    manager_role_id = role_id
            else:
                if role_data["code"] == "OWNER_FULL":
                    owner_role_id = existing["role_id"]
                elif role_data["code"] == "MANAGER_FULL":
                    manager_role_id = existing["role_id"]
    else:
        owner_role_id = owner_role["role_id"]
        manager_role_id = manager_role["role_id"]

    # Create owner
    owner_doc = {
        "user_id": owner_id,
        "email": "owner@spartans.com",
        "name": "Khalid Al Rashid",
        "password_hash": pwd_context.hash("Spartans2024!"),
        "picture": None,
        "role": "OWNER",
        "location_id": None,
        "owner_id": None,
        "admin_role_ids": [owner_role_id] if owner_role_id else [],
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    await db.users.insert_one(owner_doc)
    
    # Location data
    location_configs = [
        {
            "name": "Spartans - Sharjah (Maliha)",
            "address": "Maliha Road, Industrial Area 15",
            "city": "Sharjah",
            "phone": "+971-6-555-0101",
            "email": "maliha@spartans.ae"
        },
        {
            "name": "Spartans - Sharjah (Citygate)",
            "address": "Citygate Mall, Al Majaz 3",
            "city": "Sharjah",
            "phone": "+971-6-555-0102",
            "email": "citygate@spartans.ae"
        },
        {
            "name": "Spartans - Al Ain",
            "address": "Towayya District, Near Al Ain Mall",
            "city": "Al Ain",
            "phone": "+971-3-555-0103",
            "email": "alain@spartans.ae"
        },
        {
            "name": "Spartans - Dubai",
            "address": "Al Quoz Industrial Area 3",
            "city": "Dubai",
            "phone": "+971-4-555-0104",
            "email": "dubai@spartans.ae"
        }
    ]
    
    locations = []
    for config in location_configs:
        loc_id = f"loc_{uuid.uuid4().hex[:12]}"
        loc_doc = {
            "location_id": loc_id,
            "owner_id": owner_id,
            "name": config["name"],
            "address": config["address"],
            "city": config["city"],
            "country": "UAE",
            "phone": config["phone"],
            "email": config["email"],
            "logo_url": None,
            "timezone": "Asia/Dubai",
            "default_currency": "AED",
            "status": "active",
            "is_deleted": False,
            "created_at": now,
            "updated_at": now
        }
        await db.locations.insert_one(loc_doc)
        locations.append(loc_doc)
    
    # Create managers and customers for each location
    manager_names = ["Ahmed Hassan", "Sara Al Maktoum", "Omar Farooq", "Fatima Zahra"]
    customer_names = [
        ["Rayan Khalil", "Noor Abbas", "Hamza Siddiqi"],
        ["Layla Mansour", "Youssef Amin", "Dania Haddad"],
        ["Tariq Nasser", "Aisha Qureshi", "Bilal Mahmoud"],
        ["Zara Sheikh", "Imran Ali", "Huda Bakri"]
    ]
    
    for i, loc in enumerate(locations):
        # Manager
        mgr_id = f"user_{uuid.uuid4().hex[:12]}"
        city_slug = loc["city"].lower().replace(" ", "")
        mgr_doc = {
            "user_id": mgr_id,
            "email": f"manager.{city_slug}{i+1}@spartans.ae",
            "name": manager_names[i],
            "password_hash": pwd_context.hash("Manager2024!"),
            "picture": None,
            "role": "LOCATION_MANAGER",
            "location_id": loc["location_id"],
            "owner_id": owner_id,
            "admin_role_ids": [manager_role_id] if manager_role_id else [],
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
        await db.users.insert_one(mgr_doc)
        
        # Customers
        for j, cust_name in enumerate(customer_names[i]):
            cust_id = f"user_{uuid.uuid4().hex[:12]}"
            cust_doc = {
                "user_id": cust_id,
                "email": f"customer.{city_slug}{i+1}.{j+1}@spartans.ae",
                "name": cust_name,
                "password_hash": pwd_context.hash("Customer2024!"),
                "picture": None,
                "role": "CUSTOMER",
                "location_id": loc["location_id"],
                "owner_id": owner_id,
                "is_active": True,
                "created_at": now,
                "updated_at": now
            }
            await db.users.insert_one(cust_doc)
    
    return {
        "message": "Seed data created successfully",
        "owner_email": "owner@spartans.com",
        "owner_password": "Spartans2024!",
        "locations_created": len(locations),
        "managers_created": len(locations),
        "customers_created": len(locations) * 3
    }

# ─── Health Check ──────────────────────────────────────────────────

@api_router.get("/")
async def root():
    return {"message": "Spartans API v1.0", "status": "running"}

# Section 2 routes (Programs, Schedules, Attendance)
from section2 import router as section2_router, init as section2_init
section2_init(db, get_current_user)
api_router.include_router(section2_router)

# Section 3 routes (Customer Portal)
from section3 import router as section3_router, init as section3_init
section3_init(db, get_current_user)
api_router.include_router(section3_router)

# Section 4 routes (HR & Finance)
from section4 import router as section4_router, init as section4_init
section4_init(db, get_current_user, pwd_context)
api_router.include_router(section4_router)

# Section 5 routes (Public Website & CMS)
from section5_public import router as section5_public_router, init as section5_public_init
section5_public_init(db)
api_router.include_router(section5_public_router)

from section5_admin import router as section5_admin_router, init as section5_admin_init
section5_admin_init(db, get_current_user)
api_router.include_router(section5_admin_router)

# Admin Features (SEO, Blogs, Email Settings)
from admin_features import router as admin_features_router, init as admin_features_init
admin_features_init(db, get_current_user)
api_router.include_router(admin_features_router)

# User Management routes
from user_management import router as user_mgmt_router, init as user_mgmt_init
user_mgmt_init(db, get_current_user)
api_router.include_router(user_mgmt_router)

# RBAC (Roles & Permissions) routes
from rbac import router as rbac_router, init as rbac_init
rbac_init(db, get_current_user)
api_router.include_router(rbac_router)

# Members Management routes
from members import router as members_router, init as members_init
members_init(db, get_current_user, pwd_context)
api_router.include_router(members_router)

# Member Import routes
from member_import import router as member_import_router, init as member_import_init
member_import_init(db, get_current_user, pwd_context)
api_router.include_router(member_import_router)

# Sales Module routes
from sales import router as sales_router, init as sales_init
sales_init(db, get_current_user, pwd_context)
api_router.include_router(sales_router)

# Payment Gateways routes
from payment_gateways import router as payment_gateways_router, init as payment_gateways_init
payment_gateways_init(db, get_current_user)
api_router.include_router(payment_gateways_router)

# Discipline supervisor requests workflow
from discipline_requests import router as discipline_requests_router, init as discipline_requests_init
discipline_requests_init(db, get_current_user)
api_router.include_router(discipline_requests_router)

# Coach portal routes
from coach_portal import router as coach_portal_router, init as coach_portal_init
coach_portal_init(db, get_current_user)
api_router.include_router(coach_portal_router)

# File upload endpoint
# File upload configuration
UPLOAD_DIR = Path(os.environ.get('UPLOAD_DIR', str(ROOT_DIR / "uploads")))
UPLOAD_DIR.mkdir(exist_ok=True)

mimetypes.add_type("image/webp", ".webp")

@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = Path(file.filename).suffix.lower()
    allowed = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".mp4", ".webm", ".ogg", ".mov", ".avi"}
    if ext not in allowed:
        raise HTTPException(400, f"File type {ext} not allowed. Use: {', '.join(allowed)}")
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOAD_DIR / filename
    async with aiofiles.open(filepath, "wb") as f:
        content = await file.read()
        await f.write(content)
    return {"url": f"/api/uploads/{filename}", "filename": filename}

@api_router.get("/uploads/{filename}")
async def get_upload(filename: str):
    safe_name = Path(filename).name
    file_path = (UPLOAD_DIR / safe_name).resolve()
    upload_root = UPLOAD_DIR.resolve()
    if file_path == upload_root or upload_root not in file_path.parents:
        raise HTTPException(400, "Invalid filename")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(404, "File not found")
    mime_type, _ = mimetypes.guess_type(str(file_path))
    if not mime_type:
        mime_type = "application/octet-stream"
    return FileResponse(path=str(file_path), media_type=mime_type)

@api_router.get("/health")
async def health():
    await db.command("ping")
    return {"status": "ok"}

# Include router
app.include_router(api_router)

def _dedupe_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for i in items:
        if i in seen:
            continue
        seen.add(i)
        out.append(i)
    return out


def _parse_cors_origins(raw: str) -> List[str]:
    if not raw:
        return []
    s = raw.strip()
    items = []
    if s.startswith("[") and s.endswith("]"):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                items = parsed
        except Exception:
            items = []
    if not items:
        items = s.split(",")
    cleaned = []
    for o in items:
        if o is None:
            continue
        v = str(o).strip().strip('"').strip("'").rstrip("/")
        if not v or v == "*":
            continue
        cleaned.append(v)
    return cleaned


_DEFAULT_LOCAL_CORS_ORIGINS = [
    "http://localhost:3010",
    "http://127.0.0.1:3010",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

_DEFAULT_PROD_CORS_ORIGINS = [
    "https://spartans.mc1services.com",
    "https://spartansapi.mc1services.com",
]

_DEFAULT_CORS_ORIGINS = _DEFAULT_PROD_CORS_ORIGINS if IS_PRODUCTION else _DEFAULT_LOCAL_CORS_ORIGINS

_env_cors = _parse_cors_origins(os.environ.get("CORS_ORIGINS", ""))
_cors_allow_origins = _dedupe_keep_order([*_DEFAULT_CORS_ORIGINS, *_env_cors])

_cors_kwargs = dict(
    allow_credentials=True,
    allow_origins=_cors_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
if not IS_PRODUCTION:
    _cors_kwargs["allow_origin_regex"] = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"

app.add_middleware(CORSMiddleware, **_cors_kwargs)

def _redact_mongo_url(value: str) -> str:
    v = (value or "").strip()
    if not v:
        return ""
    if v.startswith("mongodb://") or v.startswith("mongodb+srv://"):
        prefix, rest = v.split("://", 1)
        if "@" in rest:
            _, tail = rest.split("@", 1)
            return f"{prefix}://***:***@{tail}"
        return v
    return v

logger.info(
    "Startup config | env=%s | env_loaded=%s | port=%s | cookie_secure=%s | cookie_samesite=%s | cors_origins=%s | cors_local_regex=%s | db=%s | mongo=%s | env_file=%s",
    ENVIRONMENT or ("production" if IS_PRODUCTION else "local"),
    ENV_LOADED,
    os.environ.get("PORT", ""),
    COOKIE_SECURE,
    COOKIE_SAMESITE,
    ",".join(_cors_allow_origins),
    bool(_cors_kwargs.get("allow_origin_regex")),
    os.environ.get("DB_NAME", ""),
    _redact_mongo_url(os.environ.get("MONGO_URL", "")),
    str(ENV_FILE),
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
