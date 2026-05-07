from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
import uuid
from datetime import datetime, timezone

router = APIRouter()
_db = None
_get_current_user = None

def init(database, auth_func):
    global _db, _get_current_user
    _db = database
    _get_current_user = auth_func

async def _require_owner(request):
    user = await _get_current_user(request)
    if user["role"] != "OWNER":
        raise HTTPException(403, "Owner access only")
    return user

# ─── Models ───────────────────────────────────────────────────────

class SiteSettingsUpdate(BaseModel):
    site_name: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    logo_image_path: Optional[str] = None
    hero_background_image_path: Optional[str] = None
    hero_headline: Optional[str] = None
    hero_subheadline: Optional[str] = None
    primary_cta: Optional[str] = None
    secondary_cta: Optional[str] = None
    default_meta_title: Optional[str] = None
    default_meta_description: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    primary_location_label: Optional[str] = None
    social_links: Optional[dict] = None

class DisciplineCreate(BaseModel):
    slug: str
    name: str
    short_tagline: str = ""
    hero_image_path: Optional[str] = None
    icon_image_path: Optional[str] = None
    full_description: str = ""
    benefits: List[str] = []
    ideal_for: str = ""
    difficulty_level: str = ""
    sample_schedule_text: str = ""
    cta_text: str = ""
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None

class DisciplineUpdate(BaseModel):
    name: Optional[str] = None
    short_tagline: Optional[str] = None
    hero_image_path: Optional[str] = None
    icon_image_path: Optional[str] = None
    full_description: Optional[str] = None
    benefits: Optional[List[str]] = None
    ideal_for: Optional[str] = None
    difficulty_level: Optional[str] = None
    sample_schedule_text: Optional[str] = None
    cta_text: Optional[str] = None
    is_active: Optional[bool] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None

class PricingPlanCreate(BaseModel):
    location_id: Optional[str] = None
    name: str
    billing_cycle: str = "MONTHLY"
    base_price: float = 0
    currency: str = "AED"
    description: str = ""
    includes_all_disciplines: bool = True
    benefits: List[str] = []
    promotion_type: str = "NONE"
    promotion_value: float = 0
    promotion_label: str = ""
    promotion_valid_until: Optional[str] = None
    is_featured: bool = False

class PricingPlanUpdate(BaseModel):
    location_id: Optional[str] = None
    name: Optional[str] = None
    billing_cycle: Optional[str] = None
    base_price: Optional[float] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    includes_all_disciplines: Optional[bool] = None
    benefits: Optional[List[str]] = None
    promotion_type: Optional[str] = None
    promotion_value: Optional[float] = None
    promotion_label: Optional[str] = None
    promotion_valid_until: Optional[str] = None
    is_featured: Optional[bool] = None
    is_active: Optional[bool] = None

class FAQCreate(BaseModel):
    category: str = "General"
    question: str
    answer: str = ""
    order: int = 0

class FAQUpdate(BaseModel):
    category: Optional[str] = None
    question: Optional[str] = None
    answer: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None

class StaticPageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None

class ContactSubmission(BaseModel):
    name: str
    email: str
    phone: str = ""
    location_id: Optional[str] = None
    discipline_slug: Optional[str] = None
    plan_id: Optional[str] = None
    message: str = ""
    source: str = "contact-page"

class BranchPublicUpdate(BaseModel):
    is_public: Optional[bool] = None
    public_title: Optional[str] = None
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    hero_image_path: Optional[str] = None
    google_maps_link: Optional[str] = None
    public_phone: Optional[str] = None
    public_email: Optional[str] = None
    opening_hours: Optional[list] = None
    amenities: Optional[List[str]] = None

# ─── PUBLIC APIs (No Auth) ────────────────────────────────────────

@router.get("/public/site-settings")
async def get_public_site_settings():
    doc = await _db.site_settings.find_one({}, {"_id": 0})
    return doc or {}

@router.get("/public/branches")
async def get_public_branches():
    return await _db.locations.find({"is_public": True, "is_deleted": False, "status": "active"}, {"_id": 0}).to_list(50)

@router.get("/public/branches/{location_id}")
async def get_public_branch(location_id: str):
    doc = await _db.locations.find_one({"location_id": location_id, "is_public": True, "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Branch not found")
    return doc

@router.get("/public/disciplines")
async def get_public_disciplines():
    return await _db.disciplines.find({"is_active": True}, {"_id": 0}).to_list(50)

@router.get("/public/disciplines/{slug}")
async def get_public_discipline(slug: str):
    doc = await _db.disciplines.find_one({"slug": slug, "is_active": True}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Discipline not found")
    return doc

@router.get("/public/pricing-plans")
async def get_public_pricing(location_id: Optional[str] = None):
    query = {"is_active": True}
    if location_id:
        query["$or"] = [{"location_id": location_id}, {"location_id": None}]
    return await _db.pricing_plans.find(query, {"_id": 0}).to_list(50)

@router.get("/public/faqs")
async def get_public_faqs():
    return await _db.faqs.find({"is_active": True}, {"_id": 0}).sort("order", 1).to_list(100)

@router.get("/public/static-pages/{slug}")
async def get_public_static_page(slug: str):
    doc = await _db.static_pages.find_one({"slug": slug, "is_active": True}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Page not found")
    return doc

@router.post("/public/contact", status_code=201)
async def submit_contact(data: ContactSubmission):
    submission_id = f"contact_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "submission_id": submission_id, "name": data.name, "email": data.email,
        "phone": data.phone, "location_id": data.location_id,
        "discipline_slug": data.discipline_slug, "plan_id": data.plan_id,
        "message": data.message, "source": data.source,
        "is_handled": False, "handled_by_user_id": None,
        "created_at": now
    }
    await _db.contact_submissions.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Thank you! We'll get back to you soon.", "submission_id": submission_id}

# ─── ADMIN APIs (Owner Auth) ─────────────────────────────────────

@router.get("/admin/site-settings")
async def admin_get_settings(request: Request):
    await _require_owner(request)
    doc = await _db.site_settings.find_one({}, {"_id": 0})
    return doc or {}

@router.patch("/admin/site-settings")
async def admin_update_settings(data: SiteSettingsUpdate, request: Request):
    await _require_owner(request)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.site_settings.update_one({}, {"$set": updates}, upsert=True)
    return await _db.site_settings.find_one({}, {"_id": 0})

# Disciplines Admin
@router.get("/admin/disciplines")
async def admin_list_disciplines(request: Request):
    await _require_owner(request)
    return await _db.disciplines.find({}, {"_id": 0}).to_list(50)

@router.post("/admin/disciplines", status_code=201)
async def admin_create_discipline(data: DisciplineCreate, request: Request):
    await _require_owner(request)
    existing = await _db.disciplines.find_one({"slug": data.slug})
    if existing:
        raise HTTPException(400, "Slug already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"discipline_id": f"disc_{uuid.uuid4().hex[:12]}", **data.model_dump(), "is_active": True, "created_at": now, "updated_at": now}
    await _db.disciplines.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.patch("/admin/disciplines/{slug}")
async def admin_update_discipline(slug: str, data: DisciplineUpdate, request: Request):
    await _require_owner(request)
    existing = await _db.disciplines.find_one({"slug": slug})
    if not existing:
        raise HTTPException(404, "Discipline not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.disciplines.update_one({"slug": slug}, {"$set": updates})
    return await _db.disciplines.find_one({"slug": slug}, {"_id": 0})

# Pricing Admin
@router.get("/admin/pricing-plans")
async def admin_list_pricing(request: Request):
    await _require_owner(request)
    return await _db.pricing_plans.find({}, {"_id": 0}).to_list(50)

@router.post("/admin/pricing-plans", status_code=201)
async def admin_create_pricing(data: PricingPlanCreate, request: Request):
    await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    doc = {"plan_id": f"plan_{uuid.uuid4().hex[:12]}", **data.model_dump(), "is_active": True, "created_at": now, "updated_at": now}
    await _db.pricing_plans.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.patch("/admin/pricing-plans/{plan_id}")
async def admin_update_pricing(plan_id: str, data: PricingPlanUpdate, request: Request):
    await _require_owner(request)
    existing = await _db.pricing_plans.find_one({"plan_id": plan_id})
    if not existing:
        raise HTTPException(404, "Plan not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.pricing_plans.update_one({"plan_id": plan_id}, {"$set": updates})
    return await _db.pricing_plans.find_one({"plan_id": plan_id}, {"_id": 0})

# FAQs Admin
@router.get("/admin/faqs")
async def admin_list_faqs(request: Request):
    await _require_owner(request)
    return await _db.faqs.find({}, {"_id": 0}).sort("order", 1).to_list(100)

@router.post("/admin/faqs", status_code=201)
async def admin_create_faq(data: FAQCreate, request: Request):
    await _require_owner(request)
    now = datetime.now(timezone.utc).isoformat()
    doc = {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", **data.model_dump(), "is_active": True, "created_at": now, "updated_at": now}
    await _db.faqs.insert_one(doc)
    doc.pop("_id", None)
    return doc

@router.patch("/admin/faqs/{faq_id}")
async def admin_update_faq(faq_id: str, data: FAQUpdate, request: Request):
    await _require_owner(request)
    existing = await _db.faqs.find_one({"faq_id": faq_id})
    if not existing:
        raise HTTPException(404, "FAQ not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.faqs.update_one({"faq_id": faq_id}, {"$set": updates})
    return await _db.faqs.find_one({"faq_id": faq_id}, {"_id": 0})

# Static Pages Admin
@router.get("/admin/static-pages")
async def admin_list_static_pages(request: Request):
    await _require_owner(request)
    return await _db.static_pages.find({}, {"_id": 0}).to_list(20)

@router.patch("/admin/static-pages/{slug}")
async def admin_update_static_page(slug: str, data: StaticPageUpdate, request: Request):
    await _require_owner(request)
    existing = await _db.static_pages.find_one({"slug": slug})
    if not existing:
        raise HTTPException(404, "Page not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["last_updated"] = datetime.now(timezone.utc).isoformat()[:10]
    await _db.static_pages.update_one({"slug": slug}, {"$set": updates})
    return await _db.static_pages.find_one({"slug": slug}, {"_id": 0})

# Branch Public Info Admin
@router.patch("/admin/locations/{location_id}/public-info")
async def admin_update_branch_public(location_id: str, data: BranchPublicUpdate, request: Request):
    user = await _require_owner(request)
    loc = await _db.locations.find_one({"location_id": location_id, "owner_id": user["user_id"], "is_deleted": False})
    if not loc:
        raise HTTPException(404, "Location not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.locations.update_one({"location_id": location_id}, {"$set": updates})
    return await _db.locations.find_one({"location_id": location_id}, {"_id": 0})

# Contact Submissions Admin
@router.get("/admin/contact-submissions")
async def admin_list_contacts(request: Request):
    await _require_owner(request)
    return await _db.contact_submissions.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.patch("/admin/contact-submissions/{submission_id}")
async def admin_handle_contact(submission_id: str, request: Request):
    user = await _require_owner(request)
    existing = await _db.contact_submissions.find_one({"submission_id": submission_id})
    if not existing:
        raise HTTPException(404, "Submission not found")
    await _db.contact_submissions.update_one(
        {"submission_id": submission_id},
        {"$set": {"is_handled": True, "handled_by_user_id": user["user_id"]}}
    )
    return await _db.contact_submissions.find_one({"submission_id": submission_id}, {"_id": 0})

# ─── Seed CMS Data ───────────────────────────────────────────────

@router.post("/seed-cms")
async def seed_cms():
    existing = await _db.site_settings.find_one({})
    if existing:
        return {"message": "CMS already seeded"}
    now = datetime.now(timezone.utc).isoformat()

    # Site Settings
    await _db.site_settings.insert_one({
        "site_name": "Spartans Martial Arts & Fitness",
        "primary_color": "#E53935", "secondary_color": "#000000",
        "logo_image_path": None,
        "hero_background_image_path": None,
        "hero_headline": "Unleash Your Inner Warrior",
        "hero_subheadline": "Train with elite coaches across 4 locations in Sharjah, Al Ain & Dubai. Unlimited classes with every membership.",
        "primary_cta": "Book a Free Trial", "secondary_cta": "View Disciplines",
        "default_meta_title": "Spartans Martial Arts & Fitness | Sharjah, Al Ain, Dubai",
        "default_meta_description": "Premier martial arts and fitness gym with locations in Sharjah, Al Ain & Dubai. Muay Thai, Boxing, MMA, CrossFit and more.",
        "contact_email": "info@spartans.ae", "contact_phone": "+971-6-555-0100",
        "primary_location_label": "Sharjah (Maliha & Citygate), Al Ain & Dubai",
        "social_links": {"instagram": "https://instagram.com/spartansuae", "facebook": "https://facebook.com/spartansuae", "tiktok": "https://tiktok.com/@spartansuae", "youtube": "", "whatsapp": "+971555550100"},
        "created_at": now, "updated_at": now
    })

    # Update locations with public info
    locs = await _db.locations.find({"is_deleted": False}, {"_id": 0}).to_list(10)
    amenities_map = {
        "Sharjah": ["Free Parking", "Showers & Lockers", "Ladies-Only Area", "Kids Zone", "Pro Shop"],
        "Al Ain": ["Free Parking", "Showers & Lockers", "Open Mat Area", "Cardio Zone"],
        "Dubai": ["Valet Parking", "Showers & Lockers", "Premium Lounge", "Ladies-Only Area", "Sauna"],
    }
    hours = [{"day": d, "open": "06:00", "close": "22:00"} for d in ["Monday", "Tuesday", "Wednesday", "Thursday"]] + \
            [{"day": "Friday", "open": "06:00", "close": "12:00"}, {"day": "Friday", "open": "16:00", "close": "22:00"}] + \
            [{"day": "Saturday", "open": "08:00", "close": "20:00"}, {"day": "Sunday", "open": "08:00", "close": "20:00"}]
    for loc in locs:
        city = loc.get("city", "")
        am = amenities_map.get(city, ["Free Parking", "Showers & Lockers"])
        await _db.locations.update_one({"location_id": loc["location_id"]}, {"$set": {
            "is_public": True, "public_title": loc["name"],
            "short_description": f"Premier martial arts training in {city}. World-class coaches, unlimited classes.",
            "full_description": f"<p>Welcome to {loc['name']}, your home for elite martial arts and fitness training in {city}. Our facility features state-of-the-art equipment, professional coaches, and a welcoming community for all skill levels.</p><p>Whether you're a beginner or a seasoned fighter, our programs are designed to challenge and inspire you every session.</p>",
            "hero_image_path": None, "google_maps_link": "",
            "public_phone": loc.get("phone", ""), "public_email": loc.get("email", ""),
            "opening_hours": hours, "amenities": am
        }})

    # Disciplines
    disciplines = [
        {"slug": "muay-thai", "name": "Muay Thai", "short_tagline": "The Art of Eight Limbs", "full_description": "<p>Muay Thai, known as the 'Art of Eight Limbs,' uses fists, elbows, knees, and shins for a complete striking system. Our program covers traditional techniques, clinch work, and conditioning.</p><p>Classes are structured for all levels, from complete beginners learning the basics to advanced fighters preparing for competition.</p>", "benefits": ["Full-body conditioning", "Self-defense skills", "Mental discipline & focus", "Stress relief", "Competition preparation"], "ideal_for": "Teens & Adults (14+)", "difficulty_level": "Beginner to Advanced", "sample_schedule_text": "Morning & evening sessions, 6 days a week", "cta_text": "Start Muay Thai Today"},
        {"slug": "boxing", "name": "Boxing", "short_tagline": "The Sweet Science", "full_description": "<p>Boxing at Spartans focuses on proper technique, footwork, and ring craft. Our coaches bring professional fight experience to every session.</p><p>From pad work and bag drills to sparring, you'll develop power, speed, and defensive skills in a structured, safe environment.</p>", "benefits": ["Cardiovascular fitness", "Hand-eye coordination", "Core strength", "Confidence building", "Weight management"], "ideal_for": "All ages (Kids, Teens, Adults)", "difficulty_level": "Beginner to Advanced", "sample_schedule_text": "Daily sessions available", "cta_text": "Start Boxing Today"},
        {"slug": "crossfit", "name": "CrossFit", "short_tagline": "Forge Elite Fitness", "full_description": "<p>Our CrossFit program combines Olympic weightlifting, gymnastics, and metabolic conditioning in constantly varied, high-intensity workouts.</p><p>Every WOD (Workout of the Day) is scalable to your fitness level, making CrossFit accessible to everyone from beginners to elite athletes.</p>", "benefits": ["Functional strength", "Metabolic conditioning", "Community & accountability", "Measurable progress", "Versatile fitness"], "ideal_for": "Adults (16+)", "difficulty_level": "All Levels (Scalable)", "sample_schedule_text": "Morning & evening WODs, Mon-Sat", "cta_text": "Start CrossFit Today"},
        {"slug": "mma", "name": "MMA", "short_tagline": "Complete Combat Training", "full_description": "<p>Mixed Martial Arts at Spartans integrates striking, wrestling, and grappling into a comprehensive fighting system.</p><p>Train all aspects of combat sports under experienced coaches who have competed at the highest levels.</p>", "benefits": ["Complete fighting system", "Explosive power & agility", "Ground game proficiency", "Mental toughness", "Self-defense mastery"], "ideal_for": "Teens & Adults (16+)", "difficulty_level": "Intermediate to Advanced", "sample_schedule_text": "Evening sessions, 5 days a week", "cta_text": "Start MMA Today"},
        {"slug": "bodybuilding", "name": "Bodybuilding", "short_tagline": "Sculpt Your Physique", "full_description": "<p>Our bodybuilding program focuses on hypertrophy training, proper form, and periodized programming to help you build the physique you want.</p><p>Whether you're preparing for competition or simply want to look and feel your best, our coaches provide personalized guidance.</p>", "benefits": ["Muscle hypertrophy", "Strength gains", "Body composition improvement", "Nutritional guidance", "Posing & stage prep"], "ideal_for": "Adults (16+)", "difficulty_level": "Beginner to Advanced", "sample_schedule_text": "Open gym with guided sessions", "cta_text": "Start Bodybuilding Today"},
        {"slug": "pilates", "name": "Pilates", "short_tagline": "Strengthen Your Core", "full_description": "<p>Pilates at Spartans emphasizes core strength, flexibility, and mindful movement. Our classes blend mat work with equipment-based exercises.</p><p>Perfect for rehabilitation, posture improvement, or as a complement to your combat training.</p>", "benefits": ["Core stability", "Improved posture", "Injury prevention", "Flexibility & mobility", "Mind-body connection"], "ideal_for": "All ages & fitness levels", "difficulty_level": "Beginner to Intermediate", "sample_schedule_text": "Morning sessions, 4 days a week", "cta_text": "Start Pilates Today"},
        {"slug": "hiit-boxing", "name": "HIIT Boxing", "short_tagline": "High Intensity. Maximum Results.", "full_description": "<p>Combine the technique of boxing with the intensity of HIIT for an explosive calorie-burning workout.</p><p>30-45 minute sessions that push your limits with bag work, pad drills, and bodyweight circuits.</p>", "benefits": ["Maximum calorie burn", "Improved endurance", "Boxing technique", "Time-efficient workouts", "Fun & energetic atmosphere"], "ideal_for": "All fitness levels", "difficulty_level": "All Levels", "sample_schedule_text": "Multiple daily sessions", "cta_text": "Try HIIT Boxing"},
        {"slug": "spinning", "name": "Spinning", "short_tagline": "Ride. Sweat. Transform.", "full_description": "<p>Indoor cycling at Spartans delivers high-energy, music-driven rides that torch calories and build leg strength.</p><p>Our certified instructors guide you through interval training, endurance rides, and sprint sessions.</p>", "benefits": ["Cardiovascular health", "Lower body strength", "Low joint impact", "Calorie burning", "Endurance building"], "ideal_for": "All fitness levels", "difficulty_level": "Beginner to Advanced", "sample_schedule_text": "Morning & evening rides, 5 days", "cta_text": "Start Spinning Today"},
        {"slug": "yoga", "name": "Yoga", "short_tagline": "Find Your Balance", "full_description": "<p>Yoga at Spartans offers a counterbalance to intense training. Our sessions focus on flexibility, recovery, and mental clarity.</p><p>From Vinyasa flow to Yin yoga, find the style that complements your training goals.</p>", "benefits": ["Flexibility & mobility", "Recovery & injury prevention", "Mental clarity & calm", "Improved breathing", "Better sleep quality"], "ideal_for": "All ages & levels", "difficulty_level": "Beginner to Intermediate", "sample_schedule_text": "Morning sessions, 3 days a week", "cta_text": "Start Yoga Today"},
    ]
    for d in disciplines:
        doc = {"discipline_id": f"disc_{uuid.uuid4().hex[:12]}", **d, "hero_image_path": None, "icon_image_path": None, "is_active": True, "meta_title": None, "meta_description": None, "created_at": now, "updated_at": now}
        await _db.disciplines.insert_one(doc)

    # Pricing Plans
    plans = [
        {"name": "Monthly Unlimited", "billing_cycle": "MONTHLY", "base_price": 399, "description": "Full access to all disciplines and branches", "benefits": ["Unlimited classes", "All disciplines included", "Access to all branches", "Locker & shower access", "Free trial class"], "is_featured": False, "promotion_type": "NONE", "promotion_value": 0, "promotion_label": ""},
        {"name": "3-Month Transformation", "billing_cycle": "QUARTERLY", "base_price": 999, "description": "Commit to your transformation with our most popular plan", "benefits": ["Unlimited classes", "All disciplines included", "Access to all branches", "1 personal training session/month", "Nutrition consultation", "Locker & shower access"], "is_featured": True, "promotion_type": "PERCENTAGE_DISCOUNT", "promotion_value": 17, "promotion_label": "Save 17%"},
        {"name": "Yearly All Access", "billing_cycle": "YEARLY", "base_price": 3499, "description": "The ultimate commitment at the best value", "benefits": ["Unlimited classes", "All disciplines included", "All branches access", "2 personal training sessions/month", "Quarterly nutrition consultation", "Priority booking", "Exclusive member events", "Free merchandise pack"], "is_featured": True, "promotion_type": "PERCENTAGE_DISCOUNT", "promotion_value": 27, "promotion_label": "Save 27%"},
        {"name": "Student Plan", "billing_cycle": "MONTHLY", "base_price": 249, "description": "Special rate for students with valid ID", "benefits": ["Unlimited classes", "All disciplines", "Single branch access", "Locker access"], "is_featured": False, "promotion_type": "FIXED_DISCOUNT", "promotion_value": 150, "promotion_label": "Student Discount"},
    ]
    for p in plans:
        doc = {"plan_id": f"plan_{uuid.uuid4().hex[:12]}", **p, "location_id": None, "currency": "AED", "includes_all_disciplines": True, "promotion_valid_until": None, "is_active": True, "meta_title": None, "meta_description": None, "created_at": now, "updated_at": now}
        await _db.pricing_plans.insert_one(doc)

    # FAQs
    faqs = [
        {"category": "Membership", "question": "What does the unlimited membership include?", "answer": "<p>Our unlimited membership gives you access to <strong>all classes across all disciplines</strong> at your chosen branch (or all branches with our Yearly plan). There are no class limits - train as much as you want!</p>", "order": 1},
        {"category": "Membership", "question": "Can I freeze my membership?", "answer": "<p>Yes, you can freeze your membership for up to 30 days per year. Contact your branch reception or use the customer portal to submit a freeze request.</p>", "order": 2},
        {"category": "Classes", "question": "Do I need to book classes in advance?", "answer": "<p>We recommend booking through our app or website to guarantee your spot, but walk-ins are welcome for most classes. Our subscription model means <strong>unlimited capacity</strong> - no class limits.</p>", "order": 3},
        {"category": "Classes", "question": "What should I bring to my first class?", "answer": "<p>Bring comfortable workout clothes, a towel, and a water bottle. For martial arts classes, we provide basic equipment. If you have your own gloves or wraps, feel free to bring them.</p>", "order": 4},
        {"category": "General", "question": "Are there separate sessions for women?", "answer": "<p>Yes! We offer dedicated <strong>ladies-only sessions</strong> at our Sharjah and Dubai branches, with female instructors. Check the schedule for specific times.</p>", "order": 5},
        {"category": "General", "question": "Is there parking available?", "answer": "<p>All our branches have <strong>free parking</strong>. Our Dubai branch also offers valet parking during peak hours.</p>", "order": 6},
        {"category": "Billing", "question": "What payment methods do you accept?", "answer": "<p>We accept cash, credit/debit cards, and bank transfers. Monthly memberships can be set up with automatic card payments for convenience.</p>", "order": 7},
        {"category": "General", "question": "Can kids join Spartans?", "answer": "<p>Absolutely! We have dedicated <strong>Kids programs</strong> (ages 5-12) including BJJ, Boxing, and general fitness. Our coaches are experienced in working with children and focus on discipline, confidence, and fun.</p>", "order": 8},
    ]
    for f in faqs:
        doc = {"faq_id": f"faq_{uuid.uuid4().hex[:12]}", **f, "is_active": True, "created_at": now, "updated_at": now}
        await _db.faqs.insert_one(doc)

    # Static Pages
    for slug, title, content in [
        ("privacy-policy", "Privacy Policy", "<h2>Privacy Policy</h2><p>Last updated: February 2026</p><p>Spartans Martial Arts & Fitness ('we', 'our', 'us') is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your personal information.</p><h3>Information We Collect</h3><p>We collect information you provide directly: name, email, phone number, date of birth, emergency contacts, and payment information when you register for a membership or class.</p><h3>How We Use Your Information</h3><p>We use your information to: manage your membership, send class confirmations and updates, process payments, improve our services, and comply with legal obligations.</p><h3>Data Security</h3><p>We implement appropriate security measures to protect your personal information against unauthorized access, alteration, or destruction.</p><h3>Contact Us</h3><p>For privacy-related questions, contact us at <strong>privacy@spartans.ae</strong>.</p>"),
        ("terms-and-conditions", "Terms & Conditions", "<h2>Terms & Conditions</h2><p>Last updated: February 2026</p><p>By using Spartans Martial Arts & Fitness facilities and services, you agree to the following terms:</p><h3>Membership</h3><p>Memberships are non-transferable. You must present valid ID at registration. Monthly memberships auto-renew unless cancelled with 30 days notice.</p><h3>Facility Rules</h3><p>All members must follow gym rules, respect staff and other members, and use equipment properly. Spartans reserves the right to revoke membership for violations.</p><h3>Liability</h3><p>Participation in martial arts and fitness activities involves inherent risks. By joining, you acknowledge these risks and release Spartans from liability for injuries sustained during normal use of facilities.</p><h3>Cancellation</h3><p>Monthly memberships can be cancelled with 30 days written notice. Quarterly and yearly plans are subject to the terms agreed at signup.</p>"),
    ]:
        await _db.static_pages.insert_one({"slug": slug, "title": title, "content": content, "is_active": True, "last_updated": now[:10], "created_at": now, "updated_at": now})

    return {"message": "CMS data seeded", "disciplines": 9, "pricing_plans": 4, "faqs": 8, "static_pages": 2}
