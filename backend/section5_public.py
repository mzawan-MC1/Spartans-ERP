from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

router = APIRouter()
_db = None

# Supported languages for i18n
SUPPORTED_LANGUAGES = ["en", "ar", "fr", "ru"]
DEFAULT_LANGUAGE = "en"


def init(database):
    global _db
    _db = database


def _get_language(request: Request) -> str:
    """Extract language from Accept-Language header or query param"""
    # Check query param first
    lang = request.query_params.get("lang")
    if lang and lang in SUPPORTED_LANGUAGES:
        return lang
    
    # Check Accept-Language header
    accept_lang = request.headers.get("Accept-Language", "")
    for lang in SUPPORTED_LANGUAGES:
        if lang in accept_lang.lower():
            return lang
    
    return DEFAULT_LANGUAGE


def _localize_doc(doc: dict, lang: str, fields: List[str]) -> dict:
    """
    Apply translations to document.
    If translation exists for the field in the requested language, use it.
    Otherwise, fall back to the default (English) value.
    """
    if not doc or lang == DEFAULT_LANGUAGE:
        return doc
    
    translations = doc.get("translations", {})
    if not translations or lang not in translations:
        return doc
    
    lang_trans = translations.get(lang, {})
    result = doc.copy()
    
    for field in fields:
        # Map snake_case to the actual field names used in translations
        trans_key = field
        if trans_key in lang_trans and lang_trans[trans_key]:
            result[field] = lang_trans[trans_key]
    
    return result


def _localize_links(items: list, lang: str) -> list:
    if not items or lang == DEFAULT_LANGUAGE:
        return items
    out = []
    for item in items:
        if not isinstance(item, dict):
            out.append(item)
            continue
        translations = item.get("translations", {})
        if isinstance(translations, dict) and lang in translations:
            t = translations.get(lang) or {}
            if isinstance(t, dict) and t.get("label"):
                merged = item.copy()
                merged["label"] = t.get("label")
                out.append(merged)
                continue
        out.append(item)
    return out


def _localize_stats(items: list, lang: str) -> list:
    if not items or lang == DEFAULT_LANGUAGE:
        return items
    out = []
    for item in items:
        if not isinstance(item, dict):
            out.append(item)
            continue
        translations = item.get("translations", {})
        if isinstance(translations, dict) and lang in translations:
            t = translations.get(lang) or {}
            if isinstance(t, dict) and t.get("label"):
                merged = item.copy()
                merged["label"] = t.get("label")
                out.append(merged)
                continue
        out.append(item)
    return out


# ─── Public API Endpoints (No Auth Required) ──────────────────────

@router.get("/public/site-settings")
async def get_public_site_settings(request: Request):
    """Get public site settings (branding, contact, social)"""
    lang = _get_language(request)
    settings = await _db.site_settings.find_one({"setting_id": "global"}, {"_id": 0})
    if not settings:
        return {
            "setting_id": "global",
            "site_name": "Spartans Martial Arts & Fitness",
            "tagline": "Train Like a Warrior",
            "description": "Premier martial arts and fitness training across the UAE",
            "logo_url": None,
            "hero_image_url": None,
            "hero_images": [],
            "video_section_title": None,
            "video_url": None,
            "custom_stats": [],
            "contact_email": "info@spartans.ae",
            "contact_phone": "+971-50-000-0000",
            "social_links": {},
            "footer_text": "© 2024 Spartans Martial Arts & Fitness. All rights reserved.",
            "header_cta_text": "Get Started",
            "header_cta_url": "/contact",
            "hero_primary_cta_text": "Get Started",
            "hero_primary_cta_url": "/contact",
            "hero_secondary_cta_text": "Explore Disciplines",
            "hero_secondary_cta_url": "/disciplines",
            "footer_quick_links_title": "Quick Links",
            "footer_contact_title": "Contact Us",
            "footer_follow_title": "Follow Us",
            "footer_privacy_label": "Privacy Policy",
            "footer_terms_label": "Terms of Service",
        }
    
    # Apply translations
    localized_fields = [
        "site_name",
        "tagline",
        "description",
        "footer_text",
        "footer_description",
        "header_cta_text",
        "header_cta_url",
        "hero_headline",
        "hero_subheadline",
        "primary_cta",
        "secondary_cta",
        "hero_primary_cta_text",
        "hero_primary_cta_url",
        "hero_secondary_cta_text",
        "hero_secondary_cta_url",
        "default_meta_title",
        "default_meta_description",
        "video_section_title",
        "footer_quick_links_title",
        "footer_contact_title",
        "footer_follow_title",
        "footer_privacy_label",
        "footer_terms_label",
    ]
    localized = _localize_doc(settings, lang, localized_fields)
    if lang != DEFAULT_LANGUAGE:
        if isinstance(localized, dict) and localized.get("header_menu"):
            localized["header_menu"] = _localize_links(localized.get("header_menu", []), lang)
        if isinstance(localized, dict) and localized.get("footer_quick_links"):
            localized["footer_quick_links"] = _localize_links(localized.get("footer_quick_links", []), lang)
        if isinstance(localized, dict) and localized.get("custom_stats"):
            localized["custom_stats"] = _localize_stats(localized.get("custom_stats", []), lang)
    return localized


@router.get("/public/branches")
async def get_public_branches(request: Request):
    """Get all public branches/locations"""
    lang = _get_language(request)
    branches = await _db.locations.find(
        {"is_deleted": False, "status": "active", "is_public": {"$ne": False}},
        {"_id": 0, "location_id": 1, "name": 1, "address": 1, "city": 1, 
         "phone": 1, "email": 1, "public_title": 1, "public_description": 1,
         "video_section_title": 1, "location_video_path": 1, "location_video_thumbnail_path": 1, "location_video_autoplay": 1,
         "hero_image_path": 1, "operating_hours": 1, "map_embed_url": 1, "logo_url": 1, "slug": 1, "translations": 1}
    ).to_list(50)
    localized_fields = ["public_title", "public_description", "video_section_title"]
    return [_localize_doc(b, lang, localized_fields) for b in branches]


@router.get("/public/branches/{identifier}")
async def get_public_branch(identifier: str, request: Request):
    """Get a single public branch by ID or slug"""
    lang = _get_language(request)
    branch = await _db.locations.find_one(
        {"$or": [{"location_id": identifier}, {"slug": identifier}], "is_deleted": False, "status": "active", "is_public": {"$ne": False}},
        {"_id": 0, "location_id": 1, "name": 1, "address": 1, "city": 1, "country": 1,
         "phone": 1, "email": 1, "public_title": 1, "public_description": 1,
         "video_section_title": 1, "location_video_path": 1, "location_video_thumbnail_path": 1, "location_video_autoplay": 1,
         "hero_image_path": 1, "operating_hours": 1, "map_embed_url": 1, "amenities": 1, "logo_url": 1, "slug": 1, "gallery_images": 1, "translations": 1}
    )
    if not branch:
        raise HTTPException(404, "Branch not found")
    localized_fields = ["public_title", "public_description", "video_section_title"]
    return _localize_doc(branch, lang, localized_fields)


@router.get("/public/disciplines")
async def get_public_disciplines(request: Request):
    """Get all public disciplines"""
    lang = _get_language(request)
    disciplines = await _db.disciplines.find(
        {"is_active": True},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(50)
    
    # These field names must match DB schema + translation model
    localized_fields = ["name", "short_description", "full_description", "benefits", 
                        "suitable_for", "meta_title", "meta_description", "cta_text"]
    return [_localize_doc(d, lang, localized_fields) for d in disciplines]


@router.get("/public/disciplines/{slug}")
async def get_public_discipline(slug: str, request: Request):
    """Get a single discipline by slug"""
    lang = _get_language(request)
    discipline = await _db.disciplines.find_one(
        {"slug": slug, "is_active": True},
        {"_id": 0}
    )
    if not discipline:
        raise HTTPException(404, "Discipline not found")
    
    localized_fields = ["name", "short_description", "full_description", "benefits", 
                        "suitable_for", "meta_title", "meta_description", "cta_text"]
    return _localize_doc(discipline, lang, localized_fields)


@router.get("/public/pricing")
async def get_public_pricing(request: Request):
    """Get all public pricing plans"""
    lang = _get_language(request)
    plans = await _db.pricing_plans.find(
        {"is_active": True},
        {"_id": 0}
    ).sort("sort_order", 1).to_list(50)
    
    localized_fields = ["name", "description", "features", "promotion_label", 
                        "meta_title", "meta_description"]
    return [_localize_doc(p, lang, localized_fields) for p in plans]


@router.get("/public/faqs")
async def get_public_faqs(request: Request, featured: Optional[bool] = None, location_id: Optional[str] = None):
    """Get all public FAQs"""
    lang = _get_language(request)
    query = {"is_active": True}
    if featured is not None:
        query["is_featured"] = featured
    if location_id is not None:
        # Strict separation: location pages ONLY show FAQs belonging to that specific location.
        query["location_id"] = location_id
    else:
        # Main landing page/global pages ONLY show global FAQs.
        query["$or"] = [{"location_id": None}, {"location_id": {"$exists": False}}]

    faqs = await _db.faqs.find(
        query,
        {"_id": 0}
    ).sort("sort_order", 1).to_list(100)
    
    localized_fields = ["question", "answer"]
    return [_localize_doc(f, lang, localized_fields) for f in faqs]


@router.get("/public/pages/{slug}")
async def get_public_page(slug: str, request: Request):
    """Get a static page by slug (privacy, terms, about)"""
    lang = _get_language(request)
    page = await _db.static_pages.find_one(
        {"slug": slug, "is_active": True},
        {"_id": 0}
    )
    if not page:
        raise HTTPException(404, "Page not found")
    
    localized_fields = ["title", "content", "meta_description"]
    return _localize_doc(page, lang, localized_fields)


class ContactSubmission(BaseModel):
    name: str
    email: str
    phone: str = ""
    subject: str = ""
    message: str
    branch_id: Optional[str] = None


@router.post("/public/contact", status_code=201)
async def submit_contact(data: ContactSubmission):
    """Submit a contact form"""
    submission_id = f"contact_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "submission_id": submission_id,
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "subject": data.subject,
        "message": data.message,
        "branch_id": data.branch_id,
        "status": "NEW",
        "created_at": now
    }
    await _db.contact_submissions.insert_one(doc)

    import sales_identity
    email_norm = sales_identity.norm_email(data.email)
    phone_norm = sales_identity.norm_phone(data.phone)

    note = f"{data.subject}: {data.message}" if data.subject else data.message

    existing_member = await sales_identity.find_member_by_email_phone(_db, email_norm, phone_norm)

    existing_lead = await sales_identity.find_lead_by_email_phone(
        _db,
        email_norm,
        phone_norm,
        location_scope={"location_id": data.branch_id} if data.branch_id else None,
    )

    if existing_lead:
        await _db.sales_leads.update_one(
            {"sales_lead_id": existing_lead["sales_lead_id"]},
            {
                "$set": {"updated_at": now},
                "$addToSet": {"contact_submission_ids": submission_id, "tags": "website_contact_us"},
            },
        )
        ev_id = f"sle_{uuid.uuid4().hex[:12]}"
        await _db.sales_lead_events.insert_one(
            {
                "sales_lead_event_id": ev_id,
                "sales_lead_id": existing_lead["sales_lead_id"],
                "type": "INBOUND_CONTACT",
                "payload": {
                    "source": "WEBSITE_CONTACT_US",
                    "contact_submission_id": submission_id,
                    "note": note,
                },
                "actor_user_id": None,
                "actor_role": "PUBLIC",
                "actor_staff_id": None,
                "created_at": now,
            }
        )
    else:
        lead_id = f"lead_{uuid.uuid4().hex[:12]}"
        lead_doc = {
            "sales_lead_id": lead_id,
            "location_id": data.branch_id,
            "assigned_location_id": data.branch_id,
            "contact_submission_id": submission_id,
            "contact_submission_ids": [submission_id],
            "full_name": data.name,
            "phone": data.phone,
            "phone_number": data.phone,
            "phone_norm": phone_norm,
            "email": data.email,
            "email_norm": email_norm,
            "source": "WEBSITE_CONTACT_US",
            "source_platform": "website",
            "campaign_name": "",
            "adset_or_adgroup": "",
            "source_reference": submission_id,
            "source_ref": {"submission_id": submission_id},
            "discipline_slug": None,
            "plan_id": None,
            "status": "duplicate" if existing_member else "new",
            "pipeline_stage": "duplicate" if existing_member else "new",
            "assigned_team_id": None,
            "assigned_agent_staff_id": None,
            "assigned_csr_staff_id": None,
            "assigned_team_lead_staff_id": None,
            "last_contact_date": None,
            "next_follow_up_date": None,
            "notes": note,
            "gender": None,
            "address": "",
            "purpose": "",
            "program_interest": "",
            "membership_plan": "",
            "lead_priority": "MEDIUM",
            "lead_temperature": "warm",
            "temperature": "WARM",
            "preferred_contact_method": "",
            "preferred_contact_time": "",
            "tags": ["website_contact_us"],
            "linked_member_id": existing_member.get("member_id") if existing_member else None,
            "duplicate_of_lead_id": None,
            "membership_type": None,
            "membership_plan_id": None,
            "membership_start_date": None,
            "membership_end_date": None,
            "membership_price": None,
            "currency": "AED",
            "created_at": now,
            "updated_at": now,
        }
        await _db.sales_leads.insert_one(lead_doc)
        ev_id = f"sle_{uuid.uuid4().hex[:12]}"
        await _db.sales_lead_events.insert_one(
            {
                "sales_lead_event_id": ev_id,
                "sales_lead_id": lead_id,
                "type": "CREATED",
                "payload": {"source": "WEBSITE_CONTACT_US", "contact_submission_id": submission_id},
                "actor_user_id": None,
                "actor_role": "PUBLIC",
                "actor_staff_id": None,
                "created_at": now,
            }
        )

    return {"message": "Thank you for contacting us. We will get back to you soon.", "submission_id": submission_id}


# ─── Public Stats (for landing page) ──────────────────────────────

@router.get("/public/members/{member_id}/memberships")
async def get_public_member_memberships(member_id: str, location_id: str):
    """Get memberships for a member securely for the public join flow."""
    # We only return active or pending memberships to avoid leaking data
    memberships = await _db.memberships.find(
        {
            "member_id": member_id, 
            "location_id": location_id,
            "status": {"$in": ["active", "pending"]}
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    
    return {"memberships": memberships}

@router.get("/public/categories")
async def get_public_categories(location_id: str):
    """Get public categories for a location"""
    categories = await _db.program_categories.find(
        {"location_id": location_id, "is_active": True, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0}
    ).to_list(100)
    return categories

@router.get("/public/programs")
async def get_public_programs(location_id: str):
    """Get public programs for a location"""
    programs = await _db.programs.find(
        {"location_id": location_id, "is_active": True, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0}
    ).to_list(100)
    return programs

@router.get("/public/schedule")
async def get_public_schedule(location_id: str):
    """Get public schedule for a location"""
    # Fetch recurring class_schedules rather than specific class_sessions 
    # to show the general weekly blueprint for the location.
    schedules = await _db.class_schedules.find(
        {"location_id": location_id, "is_active": True},
        {"_id": 0}
    ).to_list(1000)
    
    # Map 'day_of_week' from integer to string for frontend compatibility if needed
    # (Assuming frontend expects it or we can just pass the raw data)
    # 0 = Monday, 1 = Tuesday ... 6 = Sunday in the python standard if that's what's used,
    # or just return as is and let frontend handle. Let's return as is.
    
    return schedules

@router.get("/public/stats")
async def get_public_stats():
    """Get public statistics for landing page"""
    branches = await _db.locations.count_documents({"is_deleted": False, "status": "active"})
    disciplines = await _db.disciplines.count_documents({"is_active": True})
    # Estimate members/programs
    programs = await _db.programs.count_documents({"is_active": True})
    instructors = await _db.instructors.count_documents({"is_active": True})
    return {
        "branches": branches,
        "disciplines": disciplines,
        "programs": programs,
        "instructors": instructors
    }


@router.get("/public/google-reviews")
async def get_google_reviews(request: Request):
    """Fetch Google Reviews via Places API (cached in DB)"""
    import httpx
    from datetime import timedelta

    settings = await _db.site_settings.find_one({"setting_id": "global"}, {"_id": 0})
    place_id = (settings or {}).get("google_place_id")
    api_key = (settings or {}).get("google_reviews_api_key")

    if not place_id or not api_key:
        return {"reviews": [], "rating": 0, "total_reviews": 0}

    # Check cache (refresh every 6 hours)
    cache = await _db.google_reviews_cache.find_one({"place_id": place_id}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if cache and cache.get("fetched_at"):
        fetched = cache["fetched_at"]
        if isinstance(fetched, str):
            fetched = datetime.fromisoformat(fetched.replace("Z", "+00:00"))
        if (now - fetched) < timedelta(hours=6):
            return {"reviews": cache.get("reviews", []), "rating": cache.get("rating", 0), "total_reviews": cache.get("total_reviews", 0)}

    # Fetch from Google
    try:
        url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=reviews,rating,user_ratings_total&key={api_key}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10)
            data = resp.json()

        result = data.get("result", {})
        reviews = result.get("reviews", [])
        rating = result.get("rating", 0)
        total_reviews = result.get("user_ratings_total", 0)

        # Cache in DB
        await _db.google_reviews_cache.update_one(
            {"place_id": place_id},
            {"$set": {"place_id": place_id, "reviews": reviews, "rating": rating, "total_reviews": total_reviews, "fetched_at": now.isoformat()}},
            upsert=True
        )
        return {"reviews": reviews, "rating": rating, "total_reviews": total_reviews}
    except Exception:
        if cache:
            return {"reviews": cache.get("reviews", []), "rating": cache.get("rating", 0), "total_reviews": cache.get("total_reviews", 0)}
        return {"reviews": [], "rating": 0, "total_reviews": 0}


@router.get("/public/branches/{identifier}/google-reviews")
async def get_branch_google_reviews(identifier: str, request: Request):
    import httpx
    from datetime import timedelta

    branch = await _db.locations.find_one(
        {"$or": [{"location_id": identifier}, {"slug": identifier}], "is_deleted": False, "status": "active", "is_public": {"$ne": False}},
        {"_id": 0, "google_place_id": 1, "google_location_name": 1, "google_reviews_enabled": 1}
    )

    place_id = (branch or {}).get("google_place_id")
    enabled = bool((branch or {}).get("google_reviews_enabled"))
    place_name = (branch or {}).get("google_location_name") or ""

    if not enabled or not place_id:
        return {"enabled": False, "place_name": place_name, "reviews": [], "rating": 0, "total_reviews": 0}

    settings = await _db.site_settings.find_one({"setting_id": "global"}, {"_id": 0})
    api_key = (settings or {}).get("google_reviews_api_key")
    if not api_key:
        return {"enabled": True, "place_name": place_name, "reviews": [], "rating": 0, "total_reviews": 0}

    cache = await _db.google_reviews_cache.find_one({"place_id": place_id}, {"_id": 0})
    now = datetime.now(timezone.utc)
    if cache and cache.get("fetched_at"):
        fetched = cache["fetched_at"]
        if isinstance(fetched, str):
            fetched = datetime.fromisoformat(fetched.replace("Z", "+00:00"))
        if (now - fetched) < timedelta(hours=6):
            return {
                "enabled": True,
                "place_name": place_name,
                "reviews": cache.get("reviews", []),
                "rating": cache.get("rating", 0),
                "total_reviews": cache.get("total_reviews", 0),
            }

    try:
        url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&fields=reviews,rating,user_ratings_total&key={api_key}"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=10)
            data = resp.json()

        result = data.get("result", {})
        reviews = result.get("reviews", [])
        rating = result.get("rating", 0)
        total_reviews = result.get("user_ratings_total", 0)

        await _db.google_reviews_cache.update_one(
            {"place_id": place_id},
            {"$set": {"place_id": place_id, "reviews": reviews, "rating": rating, "total_reviews": total_reviews, "fetched_at": now.isoformat()}},
            upsert=True
        )
        return {"enabled": True, "place_name": place_name, "reviews": reviews, "rating": rating, "total_reviews": total_reviews}
    except Exception:
        if cache:
            return {
                "enabled": True,
                "place_name": place_name,
                "reviews": cache.get("reviews", []),
                "rating": cache.get("rating", 0),
                "total_reviews": cache.get("total_reviews", 0),
            }
        return {"enabled": True, "place_name": place_name, "reviews": [], "rating": 0, "total_reviews": 0}


@router.get("/public/gallery")
async def get_public_gallery(request: Request, location_id: Optional[str] = None):
    """Get gallery images from site settings or branch"""
    if location_id:
        branch = await _db.locations.find_one({"location_id": location_id}, {"_id": 0, "gallery_images": 1})
        if branch and branch.get("gallery_images"):
            images = branch.get("gallery_images", [])
            active = [img for img in images if img.get("is_active", True)]
            active.sort(key=lambda x: x.get("sort_order", 0))
            return {"images": active}

    settings = await _db.site_settings.find_one({"setting_id": "global"}, {"_id": 0})
    images = (settings or {}).get("gallery_images", [])
    active = [img for img in images if img.get("is_active", True)]
    active.sort(key=lambda x: x.get("sort_order", 0))
    return {"images": active}
