"""
Bulk Member Import Module
Handles CSV-based bulk import of members with location isolation.
"""

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Query, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import csv
import io
import asyncio

router = APIRouter(prefix="/manager/members/import", tags=["Member Import"])

_db = None
_get_current_user = None
_pwd_context = None

def init(database, auth_func, pwd_context):
    global _db, _get_current_user, _pwd_context
    _db = database
    _get_current_user = auth_func
    _pwd_context = pwd_context


# ─── Models ────────────────────────────────────────────────────────

class ImportStartRequest(BaseModel):
    mode: str = Field(..., pattern="^(upsert|create_only)$")


class PreviewResponse(BaseModel):
    total_rows: int
    valid_rows: int
    error_rows: int
    preview_data: List[Dict[str, Any]]
    row_errors: List[Dict[str, Any]]
    columns_found: List[str]


# ─── Helpers ───────────────────────────────────────────────────────

REQUIRED_FIELDS = ["full_name"]
OPTIONAL_FIELDS = [
    "phone", "email", "gender", "dob", "address",
    "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relation",
    "medical_conditions", "medical_injuries", "medical_allergies", "medical_medications", "medical_notes",
    "membership_type", "program_name", "start_date", "end_date", "plan_name", "payment_status"
]
ALL_FIELDS = REQUIRED_FIELDS + OPTIONAL_FIELDS

CSV_TEMPLATE = """full_name,phone,email,gender,dob,address,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,medical_conditions,medical_injuries,medical_allergies,medical_medications,medical_notes,membership_type,program_name,start_date,end_date,plan_name,payment_status
John Doe,+971501234567,john@example.com,male,1990-01-15,123 Main St,Jane Doe,+971507654321,Spouse,None,None,None,None,,full_access,,2024-01-01,2024-12-31,Monthly Premium,paid
Sarah Smith,+971502345678,sarah@example.com,female,1985-05-20,456 Oak Ave,Mike Smith,+971508765432,Brother,Asthma,Previous knee injury,Peanuts,Ventolin inhaler,Check before intense cardio,dedicated_program,MMA Basics,2024-02-01,2024-05-01,Quarterly Premium,pending
"""


async def require_manager(request: Request):
    """Require authenticated manager."""
    user = await _get_current_user(request)
    if user["role"] != "LOCATION_MANAGER":
        raise HTTPException(403, "Only Location Managers can import members")
    if not user.get("location_id"):
        raise HTTPException(400, "Manager has no assigned location")
    return user


def parse_csv_content(content: str) -> tuple:
    """Parse CSV content and return rows and headers."""
    try:
        # Try to detect delimiter
        sniffer = csv.Sniffer()
        try:
            dialect = sniffer.sniff(content[:4096])
        except:
            dialect = csv.excel
        
        reader = csv.DictReader(io.StringIO(content), dialect=dialect)
        headers = reader.fieldnames or []
        rows = list(reader)
        return rows, headers
    except Exception as e:
        raise HTTPException(400, f"Failed to parse CSV: {str(e)}")


def validate_row(row: Dict[str, str], row_num: int, location_id: str, existing_phones: set, existing_emails: set) -> tuple:
    """
    Validate a single row.
    Returns: (is_valid, cleaned_data, errors)
    """
    errors = []
    cleaned = {}
    
    # Get and clean values
    full_name = (row.get("full_name") or "").strip()
    phone = (row.get("phone") or "").strip()
    email = (row.get("email") or "").strip().lower()
    
    # Required: full_name
    if not full_name:
        errors.append("full_name is required")
    else:
        cleaned["full_name"] = full_name
    
    # Required: phone OR email
    if not phone and not email:
        errors.append("phone or email is required")
    
    if phone:
        # Basic phone validation - allow various formats
        cleaned_phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        if len(cleaned_phone) < 7:
            errors.append(f"Invalid phone number: {phone}")
        else:
            cleaned["phone"] = phone
            # Check for duplicates in current batch
            if phone in existing_phones:
                errors.append(f"Duplicate phone in file: {phone}")
    
    if email:
        if "@" not in email or "." not in email.split("@")[-1]:
            errors.append(f"Invalid email: {email}")
        else:
            cleaned["email"] = email
            if email in existing_emails:
                errors.append(f"Duplicate email in file: {email}")
    
    # Optional fields
    gender = (row.get("gender") or "").strip().lower()
    if gender and gender not in ("male", "female"):
        errors.append(f"Invalid gender: {gender}. Must be male or female")
    else:
        cleaned["gender"] = gender
    
    dob = (row.get("dob") or "").strip()
    if dob:
        # Try to parse date
        try:
            datetime.strptime(dob, "%Y-%m-%d")
            cleaned["dob"] = dob
        except:
            try:
                datetime.strptime(dob, "%d/%m/%Y")
                # Convert to ISO format
                dt = datetime.strptime(dob, "%d/%m/%Y")
                cleaned["dob"] = dt.strftime("%Y-%m-%d")
            except:
                errors.append(f"Invalid date format for dob: {dob}. Use YYYY-MM-DD")
    
    cleaned["address"] = (row.get("address") or "").strip()
    
    # Emergency contact
    cleaned["emergency_contact"] = {
        "name": (row.get("emergency_contact_name") or "").strip(),
        "phone": (row.get("emergency_contact_phone") or "").strip(),
        "relation": (row.get("emergency_contact_relation") or "").strip(),
    }
    
    # Medical info
    cleaned["medical"] = {
        "conditions": (row.get("medical_conditions") or "").strip(),
        "injuries": (row.get("medical_injuries") or "").strip(),
        "allergies": (row.get("medical_allergies") or "").strip(),
        "medications": (row.get("medical_medications") or "").strip(),
        "notes": (row.get("medical_notes") or "").strip(),
        "doctor_name": "",
        "doctor_phone": "",
        "consent": True,  # Assumed consent for bulk imports
    }
    
    # Membership fields
    membership_type = (row.get("membership_type") or "").strip().lower()
    if membership_type == "kids_program":
        membership_type = "kids"
    if membership_type == "dedicated_program":
        errors.append("membership_type dedicated_program is no longer supported")
    if membership_type and membership_type not in ("full_access", "only_gym", "kids"):
        errors.append(f"Invalid membership_type: {membership_type}. Must be full_access, only_gym, or kids")
    else:
        cleaned["membership_type"] = membership_type or "full_access"
    
    cleaned["program_name"] = (row.get("program_name") or "").strip()
    
    start_date = (row.get("start_date") or "").strip()
    end_date = (row.get("end_date") or "").strip()
    
    if start_date:
        try:
            datetime.strptime(start_date, "%Y-%m-%d")
            cleaned["start_date"] = start_date
        except:
            errors.append(f"Invalid start_date format: {start_date}. Use YYYY-MM-DD")
    
    if end_date:
        try:
            datetime.strptime(end_date, "%Y-%m-%d")
            cleaned["end_date"] = end_date
        except:
            errors.append(f"Invalid end_date format: {end_date}. Use YYYY-MM-DD")
    
    cleaned["plan_name"] = (row.get("plan_name") or "").strip()
    
    payment_status = (row.get("payment_status") or "").strip().lower()
    if payment_status and payment_status not in ("pending", "paid"):
        errors.append(f"Invalid payment_status: {payment_status}. Must be pending or paid")
    else:
        cleaned["payment_status"] = payment_status or "pending"
    
    cleaned["location_id"] = location_id
    cleaned["row_num"] = row_num
    
    return (len(errors) == 0, cleaned, errors)


async def generate_member_no(location_id: str) -> str:
    """Generate unique member number for a location."""
    loc = await _db.locations.find_one({"location_id": location_id}, {"_id": 0, "name": 1})
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
    
    count = await _db.members.count_documents({"location_id": location_id})
    seq = count + 1
    return f"SP-{prefix}-{seq:04d}"


async def process_import_job(job_id: str, rows: List[Dict], mode: str, location_id: str, owner_id: str, created_by: str):
    """Background task to process import job."""
    import secrets
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update job status to processing
    await _db.import_jobs.update_one(
        {"job_id": job_id},
        {"$set": {"status": "processing", "started_at": now}}
    )
    
    success_count = 0
    failed_count = 0
    errors_list = []
    batch_size = 200
    
    # Get existing members for dedup
    existing_members = {}
    async for m in _db.members.find(
        {"location_id": location_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]},
        {"_id": 0, "member_id": 1, "phone": 1, "email": 1}
    ):
        if m.get("phone"):
            existing_members[("phone", m["phone"])] = m["member_id"]
        if m.get("email"):
            existing_members[("email", m["email"].lower())] = m["member_id"]
    
    # Get payment plans for matching
    payment_plans = {}
    async for p in _db.payment_plans.find({"location_id": location_id, "is_active": True}, {"_id": 0}):
        payment_plans[p["name"].lower()] = p
    
    # Get programs for matching
    programs = {}
    async for p in _db.programs.find({"location_id": location_id, "is_active": True}, {"_id": 0}):
        programs[p["name"].lower()] = p
    
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        
        for row in batch:
            row_num = row.get("row_num", i)
            try:
                # Check for existing member
                existing_member_id = None
                if row.get("phone"):
                    existing_member_id = existing_members.get(("phone", row["phone"]))
                if not existing_member_id and row.get("email"):
                    existing_member_id = existing_members.get(("email", row["email"].lower()))
                
                if existing_member_id and mode == "create_only":
                    failed_count += 1
                    errors_list.append({
                        "row": row_num,
                        "error": f"Duplicate member found (phone/email already exists)",
                        "data": {"full_name": row.get("full_name"), "phone": row.get("phone"), "email": row.get("email")}
                    })
                    continue
                
                if existing_member_id and mode == "upsert":
                    # Update existing member
                    update_data = {
                        "full_name": row["full_name"],
                        "gender": row.get("gender", ""),
                        "dob": row.get("dob"),
                        "address": row.get("address", ""),
                        "emergency_contact": row.get("emergency_contact", {}),
                        "medical": row.get("medical", {}),
                        "updated_at": now,
                    }
                    if row.get("phone"):
                        update_data["phone"] = row["phone"]
                    if row.get("email"):
                        update_data["email"] = row["email"]
                    
                    await _db.members.update_one(
                        {"member_id": existing_member_id},
                        {"$set": update_data}
                    )
                    
                    # Update membership if dates provided
                    if row.get("start_date") and row.get("end_date"):
                        existing_membership = await _db.memberships.find_one(
                            {"member_id": existing_member_id, "status": {"$in": ["active", "pending"]}}
                        )
                        if existing_membership:
                            membership_update = {
                                "type": row.get("membership_type", "full_access"),
                                "start_date": row["start_date"],
                                "end_date": row["end_date"],
                                "status": "active" if row.get("payment_status") == "paid" else "pending",
                                "updated_at": now,
                            }
                            # Match program
                            if row.get("program_name") and row.get("membership_type") == "dedicated_program":
                                prog = programs.get(row["program_name"].lower())
                                if prog:
                                    membership_update["program_id"] = prog["program_id"]
                            # Match plan
                            if row.get("plan_name"):
                                plan = payment_plans.get(row["plan_name"].lower())
                                if plan:
                                    membership_update["payment_plan_id"] = plan["plan_id"]
                            
                            await _db.memberships.update_one(
                                {"membership_id": existing_membership["membership_id"]},
                                {"$set": membership_update}
                            )
                    
                    success_count += 1
                else:
                    # Create new member
                    member_id = f"member_{uuid.uuid4().hex[:12]}"
                    member_no = await generate_member_no(location_id)
                    
                    member_doc = {
                        "member_id": member_id,
                        "location_id": location_id,
                        "member_no": member_no,
                        "full_name": row["full_name"],
                        "gender": row.get("gender", ""),
                        "dob": row.get("dob"),
                        "phone": row.get("phone", ""),
                        "email": row.get("email", ""),
                        "address": row.get("address", ""),
                        "emergency_contact": row.get("emergency_contact", {}),
                        "medical": row.get("medical", {}),
                        "profile_photo_url": None,
                        "is_active": True,
                        "deleted_at": None,
                        "created_by_user_id": created_by,
                        "created_at": now,
                        "updated_at": now,
                    }
                    
                    await _db.members.insert_one(member_doc)
                    
                    # Track for dedup within batch
                    if row.get("phone"):
                        existing_members[("phone", row["phone"])] = member_id
                    if row.get("email"):
                        existing_members[("email", row["email"].lower())] = member_id
                    
                    # Create user account if email provided
                    user_id = None
                    if row.get("email"):
                        user_id = f"user_{uuid.uuid4().hex[:12]}"
                        temp_password = secrets.token_urlsafe(8)
                        user_doc = {
                            "user_id": user_id,
                            "email": row["email"],
                            "name": row["full_name"],
                            "password_hash": _pwd_context.hash(temp_password),
                            "picture": None,
                            "role": "MEMBER",
                            "location_id": location_id,
                            "owner_id": owner_id,
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
                    
                    # Create membership if dates provided
                    if row.get("start_date") and row.get("end_date"):
                        membership_id = f"membership_{uuid.uuid4().hex[:12]}"
                        
                        membership_doc = {
                            "membership_id": membership_id,
                            "location_id": location_id,
                            "member_id": member_id,
                            "type": row.get("membership_type", "full_access"),
                            "program_id": None,
                            "start_date": row["start_date"],
                            "end_date": row["end_date"],
                            "payment_plan_id": None,
                            "status": "active" if row.get("payment_status") == "paid" else "pending",
                            "auto_renew": False,
                            "signed_agreement_id": None,
                            "created_at": now,
                            "updated_at": now,
                        }
                        
                        # Match program
                        if row.get("program_name") and row.get("membership_type") == "dedicated_program":
                            prog = programs.get(row["program_name"].lower())
                            if prog:
                                membership_doc["program_id"] = prog["program_id"]
                        
                        # Match plan
                        if row.get("plan_name"):
                            plan = payment_plans.get(row["plan_name"].lower())
                            if plan:
                                membership_doc["payment_plan_id"] = plan["plan_id"]
                        
                        await _db.memberships.insert_one(membership_doc)
                    
                    success_count += 1
                    
            except Exception as e:
                failed_count += 1
                errors_list.append({
                    "row": row_num,
                    "error": str(e),
                    "data": {"full_name": row.get("full_name"), "phone": row.get("phone"), "email": row.get("email")}
                })
        
        # Update progress
        processed = i + len(batch)
        await _db.import_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "processed": processed,
                "success": success_count,
                "failed": failed_count,
                "errors": errors_list[-100:],  # Keep last 100 errors
            }}
        )
    
    # Mark job as completed
    finished_at = datetime.now(timezone.utc).isoformat()
    final_status = "completed" if failed_count == 0 else ("failed" if success_count == 0 else "completed")
    
    await _db.import_jobs.update_one(
        {"job_id": job_id},
        {"$set": {
            "status": final_status,
            "processed": len(rows),
            "success": success_count,
            "failed": failed_count,
            "errors": errors_list,
            "finished_at": finished_at,
        }}
    )


# ─── Endpoints ─────────────────────────────────────────────────────

@router.get("/template")
async def download_template(request: Request):
    """Download CSV template for member import."""
    await require_manager(request)
    
    return {
        "template": CSV_TEMPLATE,
        "filename": "member_import_template.csv",
        "fields": {
            "required": REQUIRED_FIELDS,
            "optional": OPTIONAL_FIELDS,
            "notes": {
                "full_name": "Required. Member's full name",
                "phone": "Required if no email. Phone number with country code",
                "email": "Required if no phone. Email address for portal access",
                "gender": "Optional. male, female, or other",
                "dob": "Optional. Date of birth in YYYY-MM-DD format",
                "membership_type": "Optional. full_access or dedicated_program",
                "program_name": "Required if membership_type is dedicated_program",
                "start_date": "Optional. Membership start date in YYYY-MM-DD",
                "end_date": "Optional. Membership end date in YYYY-MM-DD",
                "plan_name": "Optional. Must match an existing payment plan name",
                "payment_status": "Optional. pending or paid",
            }
        }
    }


@router.post("/preview")
async def preview_import(request: Request, file: UploadFile = File(...)):
    """Preview CSV import - validates first 200 rows and returns preview."""
    user = await require_manager(request)
    location_id = user["location_id"]
    
    # Read file content
    content = await file.read()
    try:
        content_str = content.decode("utf-8-sig")  # Handle BOM
    except:
        try:
            content_str = content.decode("latin-1")
        except:
            raise HTTPException(400, "Unable to decode CSV file. Please use UTF-8 encoding.")
    
    # Parse CSV
    rows, headers = parse_csv_content(content_str)
    
    if not rows:
        raise HTTPException(400, "CSV file is empty or has no data rows")
    
    # Validate headers
    headers_lower = [h.lower().strip() for h in headers]
    missing_required = [f for f in REQUIRED_FIELDS if f not in headers_lower]
    if missing_required:
        raise HTTPException(400, f"Missing required columns: {', '.join(missing_required)}")
    
    # Check if phone or email column exists
    if "phone" not in headers_lower and "email" not in headers_lower:
        raise HTTPException(400, "CSV must have either 'phone' or 'email' column")
    
    # Preview first 200 rows
    preview_rows = rows[:200]
    preview_data = []
    row_errors = []
    seen_phones = set()
    seen_emails = set()
    
    for idx, row in enumerate(preview_rows):
        # Normalize keys to lowercase
        row_normalized = {k.lower().strip(): v for k, v in row.items()}
        row_num = idx + 2  # Account for header row
        
        is_valid, cleaned, errors = validate_row(row_normalized, row_num, location_id, seen_phones, seen_emails)
        
        if cleaned.get("phone"):
            seen_phones.add(cleaned["phone"])
        if cleaned.get("email"):
            seen_emails.add(cleaned["email"])
        
        preview_item = {
            "row_num": row_num,
            "full_name": cleaned.get("full_name", ""),
            "phone": cleaned.get("phone", ""),
            "email": cleaned.get("email", ""),
            "gender": cleaned.get("gender", ""),
            "membership_type": cleaned.get("membership_type", ""),
            "is_valid": is_valid,
        }
        preview_data.append(preview_item)
        
        if not is_valid:
            row_errors.append({
                "row_num": row_num,
                "errors": errors,
                "data": preview_item
            })
    
    return {
        "total_rows": len(rows),
        "preview_count": len(preview_rows),
        "valid_rows": len(preview_data) - len(row_errors),
        "error_rows": len(row_errors),
        "preview_data": preview_data,
        "row_errors": row_errors,
        "columns_found": headers,
    }


@router.post("/start")
async def start_import(
    request: Request, 
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Query("upsert", pattern="^(upsert|create_only)$")
):
    """Start the import job. Returns job ID for progress tracking."""
    user = await require_manager(request)
    location_id = user["location_id"]
    
    # Get owner_id from location
    loc = await _db.locations.find_one({"location_id": location_id}, {"_id": 0, "owner_id": 1})
    owner_id = loc["owner_id"] if loc else user.get("owner_id")
    
    # Read file content
    content = await file.read()
    try:
        content_str = content.decode("utf-8-sig")
    except:
        try:
            content_str = content.decode("latin-1")
        except:
            raise HTTPException(400, "Unable to decode CSV file. Please use UTF-8 encoding.")
    
    # Parse CSV
    rows, headers = parse_csv_content(content_str)
    
    if not rows:
        raise HTTPException(400, "CSV file is empty or has no data rows")
    
    # Validate all rows
    headers_lower = [h.lower().strip() for h in headers]
    
    valid_rows = []
    validation_errors = []
    seen_phones = set()
    seen_emails = set()
    
    for idx, row in enumerate(rows):
        row_normalized = {k.lower().strip(): v for k, v in row.items()}
        row_num = idx + 2
        
        is_valid, cleaned, errors = validate_row(row_normalized, row_num, location_id, seen_phones, seen_emails)
        
        if cleaned.get("phone"):
            seen_phones.add(cleaned["phone"])
        if cleaned.get("email"):
            seen_emails.add(cleaned["email"])
        
        if is_valid:
            valid_rows.append(cleaned)
        else:
            validation_errors.append({
                "row": row_num,
                "errors": errors,
                "data": {"full_name": cleaned.get("full_name", ""), "phone": cleaned.get("phone", ""), "email": cleaned.get("email", "")}
            })
    
    if not valid_rows:
        raise HTTPException(400, f"No valid rows to import. Found {len(validation_errors)} errors.")
    
    # Create import job
    job_id = f"import_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    
    job_doc = {
        "job_id": job_id,
        "type": "members",
        "location_id": location_id,
        "created_by": user["user_id"],
        "mode": mode,
        "status": "pending",
        "total": len(valid_rows),
        "processed": 0,
        "success": 0,
        "failed": len(validation_errors),
        "errors": validation_errors[:100],  # Initial validation errors
        "validation_errors": len(validation_errors),
        "started_at": None,
        "finished_at": None,
        "created_at": now,
    }
    
    await _db.import_jobs.insert_one(job_doc)
    
    # Start background processing
    background_tasks.add_task(
        process_import_job, 
        job_id, 
        valid_rows, 
        mode, 
        location_id, 
        owner_id,
        user["user_id"]
    )
    
    return {
        "job_id": job_id,
        "status": "pending",
        "total": len(valid_rows),
        "validation_errors": len(validation_errors),
        "message": f"Import job created. Processing {len(valid_rows)} valid rows..."
    }


@router.get("/{job_id}")
async def get_import_job(job_id: str, request: Request):
    """Get import job progress and status."""
    user = await require_manager(request)
    location_id = user["location_id"]
    
    job = await _db.import_jobs.find_one({
        "job_id": job_id,
        "location_id": location_id
    }, {"_id": 0})
    
    if not job:
        raise HTTPException(404, "Import job not found")
    
    # Calculate progress percentage
    progress = 0
    if job["total"] > 0:
        progress = round((job["processed"] / job["total"]) * 100, 1)
    
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "mode": job.get("mode", "upsert"),
        "total": job["total"],
        "processed": job["processed"],
        "success": job["success"],
        "failed": job["failed"],
        "validation_errors": job.get("validation_errors", 0),
        "progress": progress,
        "errors": job.get("errors", [])[:50],  # Return first 50 errors
        "total_errors": len(job.get("errors", [])),
        "started_at": job.get("started_at"),
        "finished_at": job.get("finished_at"),
        "created_at": job["created_at"],
    }


@router.get("/{job_id}/errors")
async def get_import_errors(job_id: str, request: Request):
    """Get all errors for an import job as downloadable CSV."""
    user = await require_manager(request)
    location_id = user["location_id"]
    
    job = await _db.import_jobs.find_one({
        "job_id": job_id,
        "location_id": location_id
    }, {"_id": 0})
    
    if not job:
        raise HTTPException(404, "Import job not found")
    
    errors = job.get("errors", [])
    
    # Create CSV content
    csv_lines = ["row_number,full_name,phone,email,error"]
    for err in errors:
        data = err.get("data", {})
        row = err.get("row", "")
        error_msg = "; ".join(err.get("errors", [])) if isinstance(err.get("errors"), list) else str(err.get("error", ""))
        # Escape CSV fields
        full_name = str(data.get("full_name", "")).replace('"', '""')
        phone = str(data.get("phone", "")).replace('"', '""')
        email = str(data.get("email", "")).replace('"', '""')
        error_msg = error_msg.replace('"', '""')
        csv_lines.append(f'{row},"{full_name}","{phone}","{email}","{error_msg}"')
    
    return {
        "csv_content": "\n".join(csv_lines),
        "filename": f"import_errors_{job_id}.csv",
        "total_errors": len(errors)
    }


@router.get("/jobs/list")
async def list_import_jobs(request: Request, limit: int = 20):
    """List recent import jobs for the manager's location."""
    user = await require_manager(request)
    location_id = user["location_id"]
    
    jobs = await _db.import_jobs.find(
        {"location_id": location_id},
        {"_id": 0, "errors": 0}  # Exclude errors array for list view
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return {"jobs": jobs}
