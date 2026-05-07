"""
SEO, Blog, and Email Settings API endpoints.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import re
import logging

router = APIRouter()
_db = None
_get_current_user = None
logger = logging.getLogger(__name__)


def init(database, get_current_user_fn=None):
    global _db, _get_current_user
    _db = database
    _get_current_user = get_current_user_fn


async def _require_owner(request: Request):
    user = await _get_current_user(request)
    if user.get("role") == "OWNER":
        return user
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.manage_public_site")
        return user
    raise HTTPException(403, "Owner access required")


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip('-')


# ─── SEO SETTINGS ────────────────────────────────────────────────

class PageSEOUpdate(BaseModel):
    page_path: str
    page_title: Optional[str] = None
    meta_description: Optional[str] = None
    meta_keywords: Optional[str] = None
    head_code: Optional[str] = None
    body_code: Optional[str] = None


class GlobalSEOUpdate(BaseModel):
    head_code: Optional[str] = None
    body_code: Optional[str] = None


@router.get("/admin/seo")
async def list_seo_settings(request: Request):
    await _require_owner(request)
    pages = await _db.page_seo.find({}, {"_id": 0}).to_list(100)
    global_seo = await _db.global_seo.find_one({"setting_id": "global"}, {"_id": 0})
    return {"pages": pages, "global_seo": global_seo or {"head_code": "", "body_code": ""}}


@router.patch("/admin/seo/page")
async def upsert_page_seo(data: PageSEOUpdate, request: Request):
    await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = now
    await _db.page_seo.update_one(
        {"page_path": data.page_path},
        {"$set": update, "$setOnInsert": {"created_at": now}},
        upsert=True
    )
    doc = await _db.page_seo.find_one({"page_path": data.page_path}, {"_id": 0})
    return doc


@router.patch("/admin/seo/global")
async def update_global_seo(data: GlobalSEOUpdate, request: Request):
    await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    update = data.model_dump(exclude_none=True)
    update["updated_at"] = now
    await _db.global_seo.update_one(
        {"setting_id": "global"},
        {"$set": update, "$setOnInsert": {"setting_id": "global", "created_at": now}},
        upsert=True
    )
    return await _db.global_seo.find_one({"setting_id": "global"}, {"_id": 0})


@router.get("/public/seo/{page_path:path}")
async def get_page_seo(page_path: str):
    """Public endpoint to get SEO data for a page."""
    page_seo = await _db.page_seo.find_one({"page_path": f"/{page_path.strip('/')}"}, {"_id": 0})
    global_seo = await _db.global_seo.find_one({"setting_id": "global"}, {"_id": 0})
    return {
        "page": page_seo or {},
        "global": global_seo or {"head_code": "", "body_code": ""}
    }


# ─── BLOGS ────────────────────────────────────────────────────────

SUPPORTED_LANGUAGES = ["en", "ar", "fr", "ru"]


def _get_language_from_request(request: Optional[Request]) -> str:
    if request is None:
        return "en"
    raw = (request.headers.get("accept-language") or "").strip().lower()
    if not raw:
        return "en"
    first = raw.split(",")[0].strip()
    if not first:
        return "en"
    code = first.split("-")[0].strip()
    return code if code in SUPPORTED_LANGUAGES else "en"


def _localize_blog(doc: Dict[str, Any], lang: str) -> Dict[str, Any]:
    if lang == "en":
        return doc
    translations = doc.get("translations")
    if not isinstance(translations, dict):
        return doc

    chosen = translations.get(lang)
    fallback = translations.get("en")
    if not isinstance(chosen, dict) and not isinstance(fallback, dict):
        return doc

    out = dict(doc)
    for field in ["title", "content_html", "excerpt", "seo_title", "seo_description", "seo_keywords"]:
        v = None
        if isinstance(chosen, dict):
            v = chosen.get(field)
        if not (isinstance(v, str) and v.strip()):
            if isinstance(fallback, dict):
                v = fallback.get(field)
        if isinstance(v, str) and v.strip():
            out[field] = v
    return out


class BlogTranslations(BaseModel):
    title: Optional[str] = None
    content_html: Optional[str] = None
    excerpt: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None


class BlogCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    content_html: str = ""
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    tags: List[str] = []
    status: str = "draft"
    is_featured: bool = False
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None
    og_image: Optional[str] = None
    translations: Optional[Dict[str, BlogTranslations]] = None


class BlogUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    content_html: Optional[str] = None
    excerpt: Optional[str] = None
    featured_image: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    is_featured: Optional[bool] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    seo_keywords: Optional[str] = None
    og_image: Optional[str] = None
    translations: Optional[Dict[str, BlogTranslations]] = None


@router.get("/admin/blogs")
async def list_blogs(request: Request, status: Optional[str] = None):
    await _require_owner(request)
    query = {}
    if status:
        query["status"] = status
    blogs = await _db.blogs.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"blogs": blogs}


@router.post("/admin/blogs")
async def create_blog(data: BlogCreate, request: Request):
    user = await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    slug = data.slug or _slugify(data.title)
    # Ensure unique slug
    existing = await _db.blogs.find_one({"slug": slug})
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:6]}"

    blog = {
        "blog_id": f"blog_{uuid.uuid4().hex[:12]}",
        "title": data.title,
        "slug": slug,
        "content_html": data.content_html,
        "excerpt": data.excerpt or "",
        "featured_image": data.featured_image,
        "tags": data.tags,
        "status": data.status,
        "is_featured": data.is_featured,
        "seo_title": data.seo_title or data.title,
        "seo_description": data.seo_description or data.excerpt or "",
        "seo_keywords": data.seo_keywords or "",
        "og_image": data.og_image or data.featured_image,
        "translations": data.model_dump().get("translations") or {},
        "author": user.get("name", "Admin"),
        "created_at": now,
        "updated_at": now,
    }
    await _db.blogs.insert_one(blog)
    blog.pop("_id", None)
    return blog


@router.patch("/admin/blogs/{blog_id}")
async def update_blog(blog_id: str, data: BlogUpdate, request: Request):
    await _require_owner(request)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    translations_update = update.pop("translations", None)
    if translations_update is not None:
        existing = await _db.blogs.find_one({"blog_id": blog_id}, {"_id": 0, "translations": 1})
        if not existing:
            raise HTTPException(404, "Blog not found")
        existing_translations = existing.get("translations") if isinstance(existing.get("translations"), dict) else {}
        merged = dict(existing_translations)
        if isinstance(translations_update, dict):
            for lang, payload in translations_update.items():
                if not isinstance(payload, dict):
                    continue
                current = merged.get(lang)
                merged[lang] = { **(current if isinstance(current, dict) else {}), **payload }
        update["translations"] = merged

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await _db.blogs.update_one({"blog_id": blog_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Blog not found")
    blog = await _db.blogs.find_one({"blog_id": blog_id}, {"_id": 0})
    return blog


@router.delete("/admin/blogs/{blog_id}")
async def delete_blog(blog_id: str, request: Request):
    await _require_owner(request)
    result = await _db.blogs.delete_one({"blog_id": blog_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Blog not found")
    return {"deleted": True}


# Public blog endpoints
@router.get("/public/blogs")
async def get_public_blogs(request: Request, featured: Optional[bool] = None, limit: int = 100):
    query = {"status": "published"}
    if featured is not None:
        query["is_featured"] = featured
    
    blogs = await _db.blogs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    lang = _get_language_from_request(request)
    return {"blogs": [_localize_blog(b, lang) for b in blogs]}


@router.get("/public/blogs/{slug}")
async def get_public_blog(slug: str, request: Request):
    blog = await _db.blogs.find_one({"slug": slug, "status": "published"}, {"_id": 0})
    if not blog:
        raise HTTPException(404, "Blog not found")
    lang = _get_language_from_request(request)
    return _localize_blog(blog, lang)


# ─── EMAIL SETTINGS ──────────────────────────────────────────────

class SMTPConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    use_tls: Optional[bool] = True
    from_email: Optional[str] = None
    from_name: Optional[str] = None


class EmailTemplateCreate(BaseModel):
    name: str
    subject: str
    body_html: str = ""
    variables: List[str] = []
    category: str = "custom"
    is_active: bool = True


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    variables: Optional[List[str]] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/admin/email/smtp")
async def get_smtp_config(request: Request):
    await _require_owner(request)
    config = await _db.email_settings.find_one({"setting_id": "smtp"}, {"_id": 0})
    if config:
        config["password"] = "••••••••" if config.get("password") else ""
    return config or {"host": "", "port": 587, "username": "", "password": "", "use_tls": True, "from_email": "", "from_name": ""}


@router.patch("/admin/email/smtp")
async def update_smtp_config(data: SMTPConfigUpdate, request: Request):
    await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    # Don't update password if masked
    if update.get("password") == "••••••••":
        del update["password"]
    update["updated_at"] = now
    await _db.email_settings.update_one(
        {"setting_id": "smtp"},
        {"$set": update, "$setOnInsert": {"setting_id": "smtp", "created_at": now}},
        upsert=True
    )
    config = await _db.email_settings.find_one({"setting_id": "smtp"}, {"_id": 0})
    config["password"] = "••••••••" if config.get("password") else ""
    return config


@router.post("/admin/email/test")
async def test_smtp(request: Request):
    """Send a test email via configured SMTP."""
    import smtplib
    from email.mime.text import MIMEText

    user = await _require_owner(request)
    config = await _db.email_settings.find_one({"setting_id": "smtp"}, {"_id": 0})
    if not config or not config.get("host"):
        raise HTTPException(400, "SMTP not configured")

    try:
        msg = MIMEText("This is a test email from Spartans Gym Management.")
        msg["Subject"] = "Test Email - Spartans Gym"
        msg["From"] = f"{config.get('from_name', 'Spartans')} <{config['from_email']}>"
        msg["To"] = user.get("email", config["username"])

        if config.get("use_tls"):
            server = smtplib.SMTP(config["host"], config.get("port", 587))
            server.starttls()
        else:
            server = smtplib.SMTP(config["host"], config.get("port", 25))
        server.login(config["username"], config["password"])
        server.send_message(msg)
        server.quit()
        return {"success": True, "message": f"Test email sent to {msg['To']}"}
    except Exception as e:
        raise HTTPException(400, f"SMTP error: {str(e)}")


# Variable Registry
@router.get("/admin/email/variables")
async def get_variable_registry(request: Request):
    await _require_owner(request)
    return {"variables": [
        {"key": "{{member_name}}", "description": "Member's full name"},
        {"key": "{{member_email}}", "description": "Member's email address"},
        {"key": "{{member_phone}}", "description": "Member's phone number"},
        {"key": "{{membership_plan}}", "description": "Membership plan name"},
        {"key": "{{membership_start}}", "description": "Membership start date"},
        {"key": "{{membership_end}}", "description": "Membership end date"},
        {"key": "{{payment_amount}}", "description": "Payment amount"},
        {"key": "{{payment_date}}", "description": "Payment date"},
        {"key": "{{gym_name}}", "description": "Gym/Location name"},
        {"key": "{{gym_phone}}", "description": "Gym phone number"},
        {"key": "{{gym_email}}", "description": "Gym email address"},
        {"key": "{{gym_address}}", "description": "Gym address"},
        {"key": "{{current_date}}", "description": "Current date"},
    ]}


@router.get("/admin/email/templates")
async def list_email_templates(request: Request):
    await _require_owner(request)
    templates = await _db.email_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"templates": templates}


@router.post("/admin/email/templates")
async def create_email_template(data: EmailTemplateCreate, request: Request):
    await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    template = {
        "template_id": f"tmpl_{uuid.uuid4().hex[:12]}",
        **data.model_dump(),
        "created_at": now,
        "updated_at": now,
    }
    await _db.email_templates.insert_one(template)
    template.pop("_id", None)
    return template


@router.patch("/admin/email/templates/{template_id}")
async def update_email_template(template_id: str, data: EmailTemplateUpdate, request: Request):
    await _require_owner(request)
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await _db.email_templates.update_one({"template_id": template_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Template not found")
    tmpl = await _db.email_templates.find_one({"template_id": template_id}, {"_id": 0})
    return tmpl


@router.delete("/admin/email/templates/{template_id}")
async def delete_email_template(template_id: str, request: Request):
    await _require_owner(request)
    result = await _db.email_templates.delete_one({"template_id": template_id})
    if result.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    return {"deleted": True}
