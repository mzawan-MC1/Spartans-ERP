from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import re

router = APIRouter()
_db = None
_get_current_user = None

# Supported languages for i18n
SUPPORTED_LANGUAGES = ["en", "ar"]
DEFAULT_LANGUAGE = "en"


def init(database, current_user_func):
    global _db, _get_current_user
    _db = database
    _get_current_user = current_user_func


async def _require_owner(request: Request):
    user = await _get_current_user(request)
    if user.get("role") == "OWNER":
        return user
    if user.get("role") == "OWNER_FULL":
        from rbac import require_permission
        await require_permission(request, "owner.manage_public_site")
        return user
    raise HTTPException(status_code=403, detail="Owner access only")


def _slugify(text: str) -> str:
    """Convert text to URL-friendly slug"""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    return text


# ─── i18n Translation Models ──────────────────────────────────────

class DisciplineTranslations(BaseModel):
    """Translatable fields for Discipline - matches DB field names"""
    name: Optional[str] = None
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    benefits: Optional[List[str]] = None
    suitable_for: Optional[str] = None
    # Additional SEO/marketing fields
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    cta_text: Optional[str] = None


class FAQTranslations(BaseModel):
    """Translatable fields for FAQ"""
    question: Optional[str] = None
    answer: Optional[str] = None


class PricingTranslations(BaseModel):
    """Translatable fields for Pricing Plan"""
    name: Optional[str] = None
    description: Optional[str] = None
    features: Optional[List[str]] = None
    promotion_label: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None


class StaticPageTranslations(BaseModel):
    """Translatable fields for Static Page"""
    title: Optional[str] = None
    content: Optional[str] = None
    meta_description: Optional[str] = None


class SiteSettingsTranslations(BaseModel):
    """Translatable fields for Site Settings"""
    hero_headline: Optional[str] = None
    hero_subheadline: Optional[str] = None
    primary_cta: Optional[str] = None
    secondary_cta: Optional[str] = None
    default_meta_title: Optional[str] = None
    default_meta_description: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    site_name: Optional[str] = None
    header_cta_text: Optional[str] = None
    header_cta_url: Optional[str] = None
    hero_primary_cta_text: Optional[str] = None
    hero_primary_cta_url: Optional[str] = None
    hero_secondary_cta_text: Optional[str] = None
    hero_secondary_cta_url: Optional[str] = None
    video_section_title: Optional[str] = None
    footer_description: Optional[str] = None
    footer_text: Optional[str] = None
    footer_quick_links_title: Optional[str] = None
    footer_contact_title: Optional[str] = None
    footer_follow_title: Optional[str] = None
    footer_privacy_label: Optional[str] = None
    footer_terms_label: Optional[str] = None


# ─── Site Settings ────────────────────────────────────────────────

class SiteSettingsUpdate(BaseModel):
    site_name: Optional[str] = None
    tagline: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    hero_image_url: Optional[str] = None
    hero_images: Optional[List[str]] = None
    # Video Section
    video_section_title: Optional[str] = None
    video_url: Optional[str] = None
    video_thumbnail: Optional[str] = None
    video_autoplay: Optional[bool] = None
    # Custom Stats Tiles
    custom_stats: Optional[List[Dict[str, Any]]] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_address: Optional[str] = None
    social_links: Optional[Dict[str, str]] = None
    footer_text: Optional[str] = None
    hero_primary_cta_text: Optional[str] = None
    hero_primary_cta_url: Optional[str] = None
    hero_secondary_cta_text: Optional[str] = None
    hero_secondary_cta_url: Optional[str] = None
    footer_quick_links_title: Optional[str] = None
    footer_contact_title: Optional[str] = None
    footer_follow_title: Optional[str] = None
    footer_privacy_label: Optional[str] = None
    footer_terms_label: Optional[str] = None
    # Header settings
    header_menu: Optional[List[Dict[str, Any]]] = None
    header_cta_text: Optional[str] = None
    header_cta_url: Optional[str] = None
    # Footer settings
    footer_logo_url: Optional[str] = None
    footer_description: Optional[str] = None
    footer_quick_links: Optional[List[Dict[str, Any]]] = None
    footer_contact: Optional[Dict[str, str]] = None
    # Google Reviews
    google_place_id: Optional[str] = None
    google_reviews_api_key: Optional[str] = None
    # Gallery
    gallery_images: Optional[List[Dict[str, Any]]] = None
    # i18n translations
    translations: Optional[Dict[str, SiteSettingsTranslations]] = None


@router.get("/admin/site-settings")
async def get_site_settings(request: Request):
    await _require_owner(request)
    settings = await _db.site_settings.find_one({"setting_id": "global"}, {"_id": 0})
    if not settings:
        return {"setting_id": "global", "site_name": "Spartans Martial Arts & Fitness", "translations": {}}
    return settings


@router.patch("/admin/site-settings")
async def update_site_settings(data: SiteSettingsUpdate, request: Request):
    await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    updates = {}
    
    for k, v in data.model_dump().items():
        if v is not None:
            if k == "translations":
                # Merge translations - filter out None values
                updates["translations"] = {
                    lang: {tk: tv for tk, tv in trans.items() if tv is not None} if isinstance(trans, dict) else trans
                    for lang, trans in v.items()
                }
            else:
                updates[k] = v
    
    updates["updated_at"] = now
    
    existing = await _db.site_settings.find_one({"setting_id": "global"})
    if existing:
        # Merge existing translations with new ones
        if "translations" in updates and existing.get("translations"):
            merged_translations = existing.get("translations", {})
            for lang, trans in updates["translations"].items():
                if lang in merged_translations:
                    merged_translations[lang].update(trans)
                else:
                    merged_translations[lang] = trans
            updates["translations"] = merged_translations
        await _db.site_settings.update_one({"setting_id": "global"}, {"$set": updates})
    else:
        updates["setting_id"] = "global"
        updates["created_at"] = now
        await _db.site_settings.insert_one(updates)
    
    return await _db.site_settings.find_one({"setting_id": "global"}, {"_id": 0})


# ─── Disciplines CRUD ─────────────────────────────────────────────

class DisciplineCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    short_description: str = ""
    full_description: str = ""
    image_url: Optional[str] = None
    icon: str = ""
    benefits: List[str] = []
    suitable_for: str = ""
    sort_order: int = 0
    # i18n translations
    translations: Optional[Dict[str, DisciplineTranslations]] = None


class DisciplineUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    image_url: Optional[str] = None
    icon: Optional[str] = None
    benefits: Optional[List[str]] = None
    suitable_for: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    # i18n translations
    translations: Optional[Dict[str, DisciplineTranslations]] = None


@router.get("/admin/disciplines")
async def list_disciplines(request: Request, include_inactive: bool = False):
    await _require_owner(request)
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    return await _db.disciplines.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)


@router.post("/admin/disciplines", status_code=201)
async def create_discipline(data: DisciplineCreate, request: Request):
    await _require_owner(request)
    discipline_id = f"disc_{uuid.uuid4().hex[:12]}"
    slug = data.slug or _slugify(data.name)
    now = datetime.now(timezone.utc).isoformat()
    
    # Check for duplicate slug
    existing = await _db.disciplines.find_one({"slug": slug})
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"
    
    # Build translations dict
    translations = {}
    if data.translations:
        for lang, trans in data.translations.items():
            translations[lang] = trans.model_dump(exclude_none=True) if hasattr(trans, 'model_dump') else trans
    
    doc = {
        "discipline_id": discipline_id,
        "name": data.name,
        "slug": slug,
        "short_description": data.short_description,
        "full_description": data.full_description,
        "image_url": data.image_url,
        "icon": data.icon,
        "benefits": data.benefits,
        "suitable_for": data.suitable_for,
        "sort_order": data.sort_order,
        "is_active": True,
        "translations": translations,
        "created_at": now,
        "updated_at": now
    }
    await _db.disciplines.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/admin/disciplines/{discipline_id}")
async def update_discipline(discipline_id: str, data: DisciplineUpdate, request: Request):
    await _require_owner(request)
    existing = await _db.disciplines.find_one({"discipline_id": discipline_id})
    if not existing:
        raise HTTPException(404, "Discipline not found")
    
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            if k == "translations":
                # Merge translations - filter out None values from incoming translations
                merged = existing.get("translations", {})
                for lang, trans in v.items():
                    # Filter out None values from the translation dict
                    trans_dict = {tk: tv for tk, tv in trans.items() if tv is not None} if isinstance(trans, dict) else trans
                    if lang in merged:
                        merged[lang].update(trans_dict)
                    else:
                        merged[lang] = trans_dict
                updates["translations"] = merged
            else:
                updates[k] = v
    
    if "name" in updates and "slug" not in updates:
        updates["slug"] = _slugify(updates["name"])
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await _db.disciplines.update_one({"discipline_id": discipline_id}, {"$set": updates})
    return await _db.disciplines.find_one({"discipline_id": discipline_id}, {"_id": 0})


@router.delete("/admin/disciplines/{discipline_id}")
async def delete_discipline(discipline_id: str, request: Request, permanent: bool = False):
    await _require_owner(request)
    existing = await _db.disciplines.find_one({"discipline_id": discipline_id})
    if not existing:
        raise HTTPException(404, "Discipline not found")
    
    if permanent:
        await _db.disciplines.delete_one({"discipline_id": discipline_id})
        return {"message": "Discipline permanently deleted"}
    else:
        await _db.disciplines.update_one(
            {"discipline_id": discipline_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "Discipline deactivated"}


# ─── Pricing Plans CRUD ───────────────────────────────────────────

class PricingPlanCreate(BaseModel):
    name: str
    price: float
    currency: str = "AED"
    billing_period: str = "monthly"  # Legacy field
    billing_cycle: str = "monthly"   # Unified field for member payments
    membership_type: str = Field(..., pattern="^(full_access|only_gym|kids)$")
    description: str = ""
    features: List[str] = []
    is_popular: bool = False
    sort_order: int = 0
    freeze_max_days: int = 0
    freeze_max_uses: int = 0
    # i18n translations
    translations: Optional[Dict[str, PricingTranslations]] = None


class PricingPlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    billing_period: Optional[str] = None  # Legacy field
    billing_cycle: Optional[str] = None   # Unified field for member payments
    membership_type: Optional[str] = Field(default=None, pattern="^(full_access|only_gym|kids)$")
    description: Optional[str] = None
    features: Optional[List[str]] = None
    is_popular: Optional[bool] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    freeze_max_days: Optional[int] = None
    freeze_max_uses: Optional[int] = None
    # i18n translations
    translations: Optional[Dict[str, PricingTranslations]] = None


@router.get("/admin/pricing")
async def list_pricing(request: Request, include_inactive: bool = False):
    await _require_owner(request)
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    return await _db.pricing_plans.find(query, {"_id": 0}).sort("sort_order", 1).to_list(50)


@router.post("/admin/pricing", status_code=201)
async def create_pricing(data: PricingPlanCreate, request: Request):
    await _require_owner(request)
    plan_id = f"plan_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    translations = {}
    if data.translations:
        for lang, trans in data.translations.items():
            translations[lang] = trans.model_dump(exclude_none=True) if hasattr(trans, 'model_dump') else trans
    
    # Use billing_cycle if provided, otherwise fall back to billing_period
    billing_cycle = data.billing_cycle or data.billing_period
    
    doc = {
        "plan_id": plan_id,
        "name": data.name,
        "price": data.price,
        "currency": data.currency,
        "billing_period": data.billing_period,
        "billing_cycle": billing_cycle,  # Store unified billing_cycle
        "membership_type": data.membership_type,
        "description": data.description,
        "features": data.features,
        "is_popular": data.is_popular,
        "sort_order": data.sort_order,
        "freeze_max_days": data.freeze_max_days,
        "freeze_max_uses": data.freeze_max_uses,
        "is_active": True,
        "translations": translations,
        "created_at": now,
        "updated_at": now
    }
    await _db.pricing_plans.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/admin/pricing/{plan_id}")
async def update_pricing(plan_id: str, data: PricingPlanUpdate, request: Request):
    await _require_owner(request)
    existing = await _db.pricing_plans.find_one({"plan_id": plan_id})
    if not existing:
        raise HTTPException(404, "Pricing plan not found")
    
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            if k == "translations":
                merged = existing.get("translations", {})
                for lang, trans in v.items():
                    # Filter out None values from the translation dict
                    trans_dict = {tk: tv for tk, tv in trans.items() if tv is not None} if isinstance(trans, dict) else trans
                    if lang in merged:
                        merged[lang].update(trans_dict)
                    else:
                        merged[lang] = trans_dict
                updates["translations"] = merged
            else:
                updates[k] = v
    
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.pricing_plans.update_one({"plan_id": plan_id}, {"$set": updates})
    return await _db.pricing_plans.find_one({"plan_id": plan_id}, {"_id": 0})


@router.delete("/admin/pricing/{plan_id}")
async def delete_pricing(plan_id: str, request: Request, permanent: bool = False):
    await _require_owner(request)
    existing = await _db.pricing_plans.find_one({"plan_id": plan_id})
    if not existing:
        raise HTTPException(404, "Pricing plan not found")
    
    if permanent:
        await _db.pricing_plans.delete_one({"plan_id": plan_id})
        return {"message": "Pricing plan permanently deleted"}
    else:
        await _db.pricing_plans.update_one(
            {"plan_id": plan_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "Pricing plan deactivated"}


async def require_manager_or_owner(request: Request):
    user = await _get_current_user(request)
    if user.get("role") not in ["OWNER", "LOCATION_MANAGER"]:
        raise HTTPException(status_code=403, detail="Manager or Owner access only")
    return user


# ─── Manager Branch FAQs ──────────────────────────────────────────

class FAQCreate(BaseModel):
    question: str
    answer: str
    category: str = "General"
    sort_order: int = 0
    is_featured: bool = False
    location_id: Optional[str] = None
    # i18n translations
    translations: Optional[Dict[str, FAQTranslations]] = None


class FAQUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    category: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    location_id: Optional[str] = None
    # i18n translations
    translations: Optional[Dict[str, FAQTranslations]] = None


@router.get("/admin/branches/{location_id}/faqs")
async def list_branch_faqs(location_id: str, request: Request, include_inactive: bool = False):
    user = await require_manager_or_owner(request)
    if user["role"] != "OWNER" and user.get("location_id") != location_id:
        raise HTTPException(403, "Not authorized to view FAQs for this location")
        
    query = {"location_id": location_id}
    if not include_inactive:
        query["is_active"] = {"$ne": False}
        
    return await _db.faqs.find(query, {"_id": 0}).sort("sort_order", 1).to_list(200)

@router.post("/admin/branches/{location_id}/faqs", status_code=201)
async def create_branch_faq(location_id: str, data: FAQCreate, request: Request):
    user = await require_manager_or_owner(request)
    if user["role"] != "OWNER" and user.get("location_id") != location_id:
        raise HTTPException(403, "Not authorized to create FAQs for this location")
        
    faq_id = f"faq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    translations = {}
    if data.translations:
        for lang, trans in data.translations.items():
            translations[lang] = trans.model_dump(exclude_none=True) if hasattr(trans, 'model_dump') else trans
    
    doc = {
        "faq_id": faq_id,
        "question": data.question,
        "answer": data.answer,
        "category": data.category,
        "sort_order": data.sort_order,
        "is_active": True,
        "is_featured": data.is_featured,
        "location_id": location_id,
        "translations": translations,
        "created_at": now,
        "updated_at": now
    }
    await _db.faqs.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.patch("/admin/branches/{location_id}/faqs/{faq_id}")
async def update_branch_faq(location_id: str, faq_id: str, data: FAQUpdate, request: Request):
    user = await require_manager_or_owner(request)
    if user["role"] != "OWNER" and user.get("location_id") != location_id:
        raise HTTPException(403, "Not authorized to update FAQs for this location")
        
    existing = await _db.faqs.find_one({"faq_id": faq_id, "location_id": location_id})
    if not existing:
        raise HTTPException(404, "FAQ not found for this location")
        
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None and k != "location_id":  # Prevent changing location_id
            if k == "translations":
                merged = existing.get("translations", {})
                for lang, trans in v.items():
                    trans_dict = {tk: tv for tk, tv in trans.items() if tv is not None} if isinstance(trans, dict) else trans
                    if lang in merged:
                        merged[lang].update(trans_dict)
                    else:
                        merged[lang] = trans_dict
                updates["translations"] = merged
            else:
                updates[k] = v
                
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.faqs.update_one({"faq_id": faq_id}, {"$set": updates})
    return await _db.faqs.find_one({"faq_id": faq_id}, {"_id": 0})

@router.delete("/admin/branches/{location_id}/faqs/{faq_id}")
async def delete_branch_faq(location_id: str, faq_id: str, request: Request, permanent: bool = False):
    user = await require_manager_or_owner(request)
    if user["role"] != "OWNER" and user.get("location_id") != location_id:
        raise HTTPException(403, "Not authorized to delete FAQs for this location")
        
    existing = await _db.faqs.find_one({"faq_id": faq_id, "location_id": location_id})
    if not existing:
        raise HTTPException(404, "FAQ not found for this location")
        
    if permanent:
        await _db.faqs.delete_one({"faq_id": faq_id})
        return {"message": "FAQ permanently deleted"}
    else:
        await _db.faqs.update_one(
            {"faq_id": faq_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "FAQ deactivated"}

# ─── Global FAQs CRUD ─────────────────────────────────────────────

@router.get("/admin/faqs")
async def list_faqs(request: Request, include_inactive: bool = False, location_id: Optional[str] = None):
    # Manager can see their own location's FAQs, owner sees global FAQs or filtered by location
    user = await require_manager_or_owner(request)
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    
    if user["role"] != "OWNER":
        query["location_id"] = user.get("location_id")
    else:
        # Owner by default sees global FAQs (location_id is None or exists: false)
        if location_id:
            query["location_id"] = location_id
        else:
            query["$or"] = [{"location_id": None}, {"location_id": {"$exists": False}}]
            
    return await _db.faqs.find(query, {"_id": 0}).sort("sort_order", 1).to_list(200)


@router.post("/admin/faqs", status_code=201)
async def create_faq(data: FAQCreate, request: Request):
    user = await require_manager_or_owner(request)
    
    # Force Location Managers to ONLY create FAQs for their location
    if user["role"] != "OWNER":
        data.location_id = user.get("location_id")
    # Force Owners to ONLY create Global FAQs (unless explicitly passing a location_id via admin dashboard)
    elif user["role"] == "OWNER" and not data.location_id:
        data.location_id = None
        
    faq_id = f"faq_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    translations = {}
    if data.translations:
        for lang, trans in data.translations.items():
            translations[lang] = trans.model_dump(exclude_none=True) if hasattr(trans, 'model_dump') else trans
    
    doc = {
        "faq_id": faq_id,
        "question": data.question,
        "answer": data.answer,
        "category": data.category,
        "sort_order": data.sort_order,
        "is_active": True,
        "is_featured": data.is_featured,
        "location_id": data.location_id,
        "translations": translations,
        "created_at": now,
        "updated_at": now
    }
    await _db.faqs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/admin/faqs/{faq_id}")
async def update_faq(faq_id: str, data: FAQUpdate, request: Request):
    user = await require_manager_or_owner(request)
    existing = await _db.faqs.find_one({"faq_id": faq_id})
    if not existing:
        raise HTTPException(404, "FAQ not found")
        
    if user["role"] != "OWNER" and existing.get("location_id") != user.get("location_id"):
        raise HTTPException(403, "Not authorized to update this FAQ")
    
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            if k == "translations":
                merged = existing.get("translations", {})
                for lang, trans in v.items():
                    # Filter out None values from the translation dict
                    trans_dict = {tk: tv for tk, tv in trans.items() if tv is not None} if isinstance(trans, dict) else trans
                    if lang in merged:
                        merged[lang].update(trans_dict)
                    else:
                        merged[lang] = trans_dict
                updates["translations"] = merged
            else:
                updates[k] = v
                
    # Keep owner modifications isolated from manager location IDs
    if user["role"] == "OWNER" and data.location_id is None and "location_id" not in updates:
        pass
        
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.faqs.update_one({"faq_id": faq_id}, {"$set": updates})
    return await _db.faqs.find_one({"faq_id": faq_id}, {"_id": 0})


@router.delete("/admin/faqs/{faq_id}")
async def delete_faq(faq_id: str, request: Request, permanent: bool = False):
    user = await require_manager_or_owner(request)
    existing = await _db.faqs.find_one({"faq_id": faq_id})
    if not existing:
        raise HTTPException(404, "FAQ not found")
        
    if user["role"] != "OWNER" and existing.get("location_id") != user.get("location_id"):
        raise HTTPException(403, "Not authorized to delete this FAQ")
    
    if permanent:
        await _db.faqs.delete_one({"faq_id": faq_id})
        return {"message": "FAQ permanently deleted"}
    else:
        await _db.faqs.update_one(
            {"faq_id": faq_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "FAQ deactivated"}


# ─── Static Pages CRUD ────────────────────────────────────────────

class StaticPageCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    content: str = ""
    meta_description: str = ""
    # i18n translations
    translations: Optional[Dict[str, StaticPageTranslations]] = None


class StaticPageUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    content: Optional[str] = None
    meta_description: Optional[str] = None
    is_active: Optional[bool] = None
    # i18n translations
    translations: Optional[Dict[str, StaticPageTranslations]] = None


@router.get("/admin/pages")
async def list_pages(request: Request, include_inactive: bool = False):
    await _require_owner(request)
    query = {} if include_inactive else {"is_active": {"$ne": False}}
    return await _db.static_pages.find(query, {"_id": 0}).to_list(50)


@router.post("/admin/pages", status_code=201)
async def create_page(data: StaticPageCreate, request: Request):
    await _require_owner(request)
    page_id = f"page_{uuid.uuid4().hex[:12]}"
    slug = data.slug or _slugify(data.title)
    now = datetime.now(timezone.utc).isoformat()
    
    existing = await _db.static_pages.find_one({"slug": slug})
    if existing:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"
    
    translations = {}
    if data.translations:
        for lang, trans in data.translations.items():
            translations[lang] = trans.model_dump(exclude_none=True) if hasattr(trans, 'model_dump') else trans
    
    doc = {
        "page_id": page_id,
        "title": data.title,
        "slug": slug,
        "content": data.content,
        "meta_description": data.meta_description,
        "is_active": True,
        "translations": translations,
        "created_at": now,
        "updated_at": now
    }
    await _db.static_pages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/admin/pages/{page_id}")
async def update_page(page_id: str, data: StaticPageUpdate, request: Request):
    await _require_owner(request)
    existing = await _db.static_pages.find_one({"page_id": page_id})
    if not existing:
        raise HTTPException(404, "Page not found")
    
    updates = {}
    for k, v in data.model_dump().items():
        if v is not None:
            if k == "translations":
                merged = existing.get("translations", {})
                for lang, trans in v.items():
                    # Filter out None values from the translation dict
                    trans_dict = {tk: tv for tk, tv in trans.items() if tv is not None} if isinstance(trans, dict) else trans
                    if lang in merged:
                        merged[lang].update(trans_dict)
                    else:
                        merged[lang] = trans_dict
                updates["translations"] = merged
            else:
                updates[k] = v
    
    if "title" in updates and "slug" not in updates:
        updates["slug"] = _slugify(updates["title"])
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.static_pages.update_one({"page_id": page_id}, {"$set": updates})
    return await _db.static_pages.find_one({"page_id": page_id}, {"_id": 0})


@router.delete("/admin/pages/{page_id}")
async def delete_page(page_id: str, request: Request, permanent: bool = False):
    await _require_owner(request)
    existing = await _db.static_pages.find_one({"page_id": page_id})
    if not existing:
        raise HTTPException(404, "Page not found")
    
    if permanent:
        await _db.static_pages.delete_one({"page_id": page_id})
        return {"message": "Page permanently deleted"}
    else:
        await _db.static_pages.update_one(
            {"page_id": page_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"message": "Page deactivated"}


# ─── Branch Public Settings ───────────────────────────────────────

class BranchTranslations(BaseModel):
    public_title: Optional[str] = None
    public_description: Optional[str] = None
    video_section_title: Optional[str] = None


class BranchPublicUpdate(BaseModel):
    is_public: Optional[bool] = None
    public_title: Optional[str] = None
    public_description: Optional[str] = None
    video_section_title: Optional[str] = None
    google_place_id: Optional[str] = None
    google_location_name: Optional[str] = None
    google_reviews_enabled: Optional[bool] = None
    hero_image_path: Optional[str] = None
    operating_hours: Optional[str] = None
    map_embed_url: Optional[str] = None
    amenities: Optional[List[str]] = None
    gallery_images: Optional[List[dict]] = None
    location_video_path: Optional[str] = None
    location_video_thumbnail_path: Optional[str] = None
    location_video_autoplay: Optional[bool] = None
    translations: Optional[Dict[str, BranchTranslations]] = None


@router.patch("/admin/branches/{location_id}/public")
async def update_branch_public(location_id: str, data: BranchPublicUpdate, request: Request):
    user = await require_manager_or_owner(request)
    
    loc_query = {"location_id": location_id, "is_deleted": False}
    if user["role"] == "OWNER":
        loc_query["owner_id"] = user["user_id"]
    else:
        if user.get("location_id") != location_id:
            raise HTTPException(403, "Not authorized for this location")

    loc = await _db.locations.find_one(loc_query)
    if not loc:
        raise HTTPException(404, "Location not found or access denied")
    
    updates = {}
    for k, v in data.model_dump().items():
        if v is None:
            continue
        if k == "translations":
            merged = loc.get("translations", {})
            for lang, trans in v.items():
                trans_dict = {tk: tv for tk, tv in trans.items() if tv is not None} if isinstance(trans, dict) else trans
                if lang in merged and isinstance(merged.get(lang), dict):
                    merged[lang].update(trans_dict)
                else:
                    merged[lang] = trans_dict
            updates["translations"] = merged
        else:
            updates[k] = v
    
    # Manager restrictions: Managers can't toggle is_public
    if user["role"] != "OWNER" and "is_public" in updates:
        del updates["is_public"]

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.locations.update_one({"location_id": location_id}, {"$set": updates})
    return await _db.locations.find_one({"location_id": location_id}, {"_id": 0})


# ─── Contact Submissions (Admin View) ─────────────────────────────

@router.get("/admin/contact-submissions")
async def list_contact_submissions(request: Request, status: Optional[str] = None):
    await _require_owner(request)
    query = {}
    if status:
        query["status"] = status
    return await _db.contact_submissions.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.patch("/admin/contact-submissions/{submission_id}")
async def update_submission_status(submission_id: str, request: Request, status: str = "READ"):
    await _require_owner(request)
    existing = await _db.contact_submissions.find_one({"submission_id": submission_id})
    if not existing:
        raise HTTPException(404, "Submission not found")
    await _db.contact_submissions.update_one(
        {"submission_id": submission_id},
        {"$set": {"status": status}}
    )
    return {"message": f"Status updated to {status}"}


# ─── Seed CMS Data ────────────────────────────────────────────────

@router.post("/admin/seed-cms")
async def seed_cms_data(request: Request):
    await _require_owner(request)
    
    # Check if already seeded
    existing = await _db.disciplines.find_one({})
    if existing:
        return {"message": "CMS data already seeded"}
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Seed Site Settings
    site_settings = {
        "setting_id": "global",
        "site_name": "Spartans Martial Arts & Fitness",
        "tagline": "Train Like a Warrior",
        "description": "Premier martial arts and fitness training centers across the UAE. Build strength, discipline, and confidence with world-class coaching.",
        "logo_url": None,
        "favicon_url": None,
        "hero_image_url": None,
        "contact_email": "info@spartans.ae",
        "contact_phone": "+971-50-000-0000",
        "contact_address": "Multiple Locations Across UAE",
        "social_links": {
            "instagram": "https://instagram.com/spartansuae",
            "facebook": "https://facebook.com/spartansuae",
            "youtube": "https://youtube.com/spartansuae"
        },
        "footer_text": "© 2024 Spartans Martial Arts & Fitness. All rights reserved.",
        "created_at": now,
        "updated_at": now
    }
    await _db.site_settings.insert_one(site_settings)
    
    # Seed Disciplines
    disciplines = [
        {
            "discipline_id": f"disc_{uuid.uuid4().hex[:12]}",
            "name": "Brazilian Jiu-Jitsu",
            "slug": "brazilian-jiu-jitsu",
            "short_description": "The gentle art of ground fighting and submission grappling",
            "full_description": "<p>Brazilian Jiu-Jitsu (BJJ) is a martial art focused on grappling and ground fighting. It emphasizes technique over strength, making it accessible to practitioners of all sizes and ages.</p><p>Our BJJ program covers fundamental positions, submissions, sweeps, and escapes. Whether you're a complete beginner or an experienced practitioner, our world-class coaches will help you progress at your own pace.</p>",
            "image_url": None,
            "icon": "🥋",
            "benefits": ["Self-defense skills", "Full-body workout", "Mental discipline", "Stress relief", "Community"],
            "suitable_for": "All ages (5+), all fitness levels",
            "sort_order": 1,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "discipline_id": f"disc_{uuid.uuid4().hex[:12]}",
            "name": "Kickboxing",
            "slug": "kickboxing",
            "short_description": "High-energy striking combining punches, kicks, and cardio",
            "full_description": "<p>Kickboxing is a dynamic striking art that combines boxing punches with powerful kicks. It's an excellent way to build cardiovascular fitness while learning practical self-defense techniques.</p><p>Our kickboxing classes cater to all levels, from beginners learning the basics to advanced fighters honing their skills. Get ready to sweat, punch, kick, and transform your body!</p>",
            "image_url": None,
            "icon": "🥊",
            "benefits": ["Cardio fitness", "Fat burning", "Self-defense", "Stress relief", "Coordination"],
            "suitable_for": "Adults & teens (13+)",
            "sort_order": 2,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "discipline_id": f"disc_{uuid.uuid4().hex[:12]}",
            "name": "Mixed Martial Arts",
            "slug": "mma",
            "short_description": "Complete combat system combining striking and grappling",
            "full_description": "<p>Mixed Martial Arts (MMA) is the ultimate combat sport, combining techniques from various martial arts including boxing, wrestling, jiu-jitsu, and Muay Thai.</p><p>Our MMA program is designed for those who want to become well-rounded fighters or simply experience the most comprehensive martial arts training available.</p>",
            "image_url": None,
            "icon": "⚔️",
            "benefits": ["Complete fighting system", "Elite conditioning", "Mental toughness", "Competition opportunities"],
            "suitable_for": "Adults (18+) with some martial arts experience",
            "sort_order": 3,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "discipline_id": f"disc_{uuid.uuid4().hex[:12]}",
            "name": "CrossFit",
            "slug": "crossfit",
            "short_description": "High-intensity functional fitness for everyday warriors",
            "full_description": "<p>CrossFit is a high-intensity fitness program that combines elements of cardio, weightlifting, and gymnastics. Each workout is different, keeping your body constantly challenged.</p><p>Our CrossFit classes are scalable to all fitness levels. Whether you're a complete beginner or a seasoned athlete, you'll find the support and challenge you need to reach your goals.</p>",
            "image_url": None,
            "icon": "💪",
            "benefits": ["Functional strength", "Weight loss", "Community support", "Measurable progress"],
            "suitable_for": "All fitness levels (14+)",
            "sort_order": 4,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
    ]
    await _db.disciplines.insert_many(disciplines)
    
    # Seed Pricing Plans
    pricing_plans = [
        {
            "plan_id": f"plan_{uuid.uuid4().hex[:12]}",
            "name": "Drop-In",
            "price": 75,
            "currency": "AED",
            "billing_period": "per class",
            "description": "Perfect for trying out a single class",
            "features": ["Access to any single class", "All equipment included", "Locker room access"],
            "is_popular": False,
            "sort_order": 1,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "plan_id": f"plan_{uuid.uuid4().hex[:12]}",
            "name": "Monthly Unlimited",
            "price": 699,
            "currency": "AED",
            "billing_period": "monthly",
            "description": "Unlimited access to all classes",
            "features": ["Unlimited classes per month", "All disciplines included", "Priority booking", "Free guest pass (1/month)", "Locker rental included"],
            "is_popular": True,
            "sort_order": 2,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "plan_id": f"plan_{uuid.uuid4().hex[:12]}",
            "name": "Annual Warrior",
            "price": 5999,
            "currency": "AED",
            "billing_period": "yearly",
            "description": "Best value for committed warriors",
            "features": ["All Monthly Unlimited benefits", "2 months FREE (save AED 1,400)", "Free Spartans merchandise", "Access to all locations", "VIP workshop access"],
            "is_popular": False,
            "sort_order": 3,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "plan_id": f"plan_{uuid.uuid4().hex[:12]}",
            "name": "Family Plan",
            "price": 1499,
            "currency": "AED",
            "billing_period": "monthly",
            "description": "Training for the whole family",
            "features": ["Up to 4 family members", "Kids & adult classes", "Family scheduling priority", "10% off merchandise", "Family events access"],
            "is_popular": False,
            "sort_order": 4,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
    ]
    await _db.pricing_plans.insert_many(pricing_plans)
    
    # Seed FAQs
    faqs = [
        {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", "question": "Do I need any prior experience to join?", "answer": "Absolutely not! Our programs are designed for all levels, from complete beginners to advanced practitioners. Our coaches will guide you through every step of your journey.", "category": "Getting Started", "sort_order": 1, "is_active": True, "created_at": now, "updated_at": now},
        {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", "question": "What should I bring to my first class?", "answer": "Just bring yourself, comfortable workout clothes, and a water bottle. All necessary equipment (gloves, pads, etc.) is provided for beginners. As you progress, you may want to invest in your own gear.", "category": "Getting Started", "sort_order": 2, "is_active": True, "created_at": now, "updated_at": now},
        {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", "question": "Can I try a class before committing?", "answer": "Yes! We offer a free trial class for first-time visitors. This is a great opportunity to experience our training environment and meet our coaches before making any commitment.", "category": "Getting Started", "sort_order": 3, "is_active": True, "created_at": now, "updated_at": now},
        {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", "question": "What are your operating hours?", "answer": "Our gyms are typically open from 6:00 AM to 10:00 PM, Saturday through Thursday. Friday hours may vary. Check your local branch for specific timings.", "category": "General", "sort_order": 4, "is_active": True, "created_at": now, "updated_at": now},
        {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", "question": "Can I freeze my membership?", "answer": "Yes, you can freeze your membership for up to 30 days per year with at least 7 days' notice. Medical freezes may be extended with appropriate documentation.", "category": "Membership", "sort_order": 5, "is_active": True, "created_at": now, "updated_at": now},
        {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", "question": "Do you offer personal training?", "answer": "Yes! We offer one-on-one personal training sessions with our expert coaches. This is perfect for accelerated learning or focused training goals. Contact your branch for pricing.", "category": "Training", "sort_order": 6, "is_active": True, "created_at": now, "updated_at": now}
    ]
    await _db.faqs.insert_many(faqs)
    
    # Seed Static Pages
    static_pages = [
        {
            "page_id": f"page_{uuid.uuid4().hex[:12]}",
            "title": "Privacy Policy",
            "slug": "privacy",
            "content": "<h2>Privacy Policy</h2><p>Last updated: January 2024</p><p>At Spartans Martial Arts & Fitness, we take your privacy seriously. This policy describes how we collect, use, and protect your personal information.</p><h3>Information We Collect</h3><p>We collect information you provide directly, such as your name, email, phone number, and payment information when you register for classes or memberships.</p><h3>How We Use Your Information</h3><p>We use your information to provide and improve our services, communicate with you about classes and promotions, and process payments.</p><h3>Contact Us</h3><p>If you have questions about this privacy policy, please contact us at privacy@spartans.ae</p>",
            "meta_description": "Privacy policy for Spartans Martial Arts & Fitness",
            "is_active": True,
            "created_at": now,
            "updated_at": now
        },
        {
            "page_id": f"page_{uuid.uuid4().hex[:12]}",
            "title": "Terms of Service",
            "slug": "terms",
            "content": "<h2>Terms of Service</h2><p>Last updated: January 2024</p><p>Welcome to Spartans Martial Arts & Fitness. By using our facilities and services, you agree to these terms.</p><h3>Membership</h3><p>Memberships are personal and non-transferable. You must be at least 18 years old to purchase a membership, or have parental consent if under 18.</p><h3>Facility Rules</h3><p>All members must follow gym etiquette, maintain cleanliness, and respect coaches and fellow members. Inappropriate behavior may result in membership termination.</p><h3>Liability Waiver</h3><p>Participation in martial arts and fitness activities carries inherent risks. Members participate at their own risk and must sign a liability waiver.</p>",
            "meta_description": "Terms of service for Spartans Martial Arts & Fitness",
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
    ]
    await _db.static_pages.insert_many(static_pages)
    
    return {
        "message": "CMS data seeded successfully",
        "disciplines": len(disciplines),
        "pricing_plans": len(pricing_plans),
        "faqs": len(faqs),
        "static_pages": len(static_pages)
    }
