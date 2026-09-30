"""
Sales Module - Teams, Agents & Lead Management
Handles sales teams per branch, agent assignments/transfers, and lead pipeline.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Tuple
import uuid
from datetime import datetime, timezone
import re
import os
import httpx
import sales_identity

router = APIRouter(prefix="/sales", tags=["Sales"])
_db = None
_get_current_user = None
_pwd_context = None


def init(database, auth_func, pwd_context=None):
    global _db, _get_current_user, _pwd_context
    _db = database
    _get_current_user = auth_func
    _pwd_context = pwd_context


@router.get("/_ping")
async def sales_ping():
    return {"ok": True, "ts": datetime.now(timezone.utc).isoformat()}


# ─── Permission Helpers ────────────────────────────────────────────

async def _get_user_permissions(user: dict) -> set:
    if user.get("role") in ("CUSTOMER", "MEMBER"):
        return set()
    admin_role_ids = user.get("admin_role_ids", [])
    if not admin_role_ids:
        return set()
    roles = await _db.roles.find(
        {"role_id": {"$in": admin_role_ids}, "is_active": True},
        {"_id": 0, "permissions": 1}
    ).to_list(100)
    perms = set()
    for r in roles:
        perms.update(r.get("permissions", []))
    return perms


async def _check_perm(user: dict, perm: str) -> bool:
    if user.get("role") == "OWNER":
        return True
    perms = await _get_user_permissions(user)
    if user.get("role") == "OWNER_FULL":
        if perm == "manager.view_sales_location":
            return ("owner.view_sales_all" in perms) or ("owner.manage_sales_all" in perms)
        if perm == "manager.manage_sales_location":
            return "owner.manage_sales_all" in perms
    return perm in perms


async def _require_sales(request, perm: str):
    user = await _get_current_user(request)
    if user.get("role") == "CUSTOMER" or user.get("role") == "MEMBER":
        raise HTTPException(403, "Staff access required")
    if not await _check_perm(user, perm):
        raise HTTPException(403, "Insufficient permissions")
    return user


def _norm_email(value: Optional[str]) -> str:
    return sales_identity.norm_email(value)


def _norm_phone(value: Optional[str]) -> str:
    return sales_identity.norm_phone(value)


def _norm_status(value: Optional[str]) -> str:
    s = (value or "").strip()
    if not s:
        return "new"
    v = s.lower().strip()
    v = v.replace(" ", "_")
    legacy = {
        "new": "new",
        "contacted": "under_discussion",
        "follow_up": "follow_up_pending",
        "trial_booked": "under_process",
        "trial_completed": "under_process",
        "won": "converted",
        "lost": "not_interested",
        "call_back": "call_back_requested",
        "call_back_requested": "call_back_requested",
        "under_discussion": "under_discussion",
        "under_process": "under_process",
        "follow_up_pending": "follow_up_pending",
        "no_response": "no_response",
        "not_interested": "not_interested",
        "canceled": "canceled",
        "duplicate": "duplicate",
        "transferred": "transferred",
        "converted": "converted",
    }
    return legacy.get(v, v)


WORKING_STATUSES = {
    "new",
    "under_discussion",
    "under_process",
    "call_back_requested",
    "follow_up_pending",
}


NOT_WORKING_STATUSES = {
    "canceled",
    "not_interested",
    "no_response",
    "duplicate",
}


def _lead_reporting_class(status: Optional[str]) -> str:
    s = _norm_status(status)
    if s == "converted":
        return "converted"
    if s == "transferred":
        return "transferred"
    if s in WORKING_STATUSES:
        return "working"
    if s in NOT_WORKING_STATUSES:
        return "not_working"
    return "working"


def _status_terms(values: List[str]) -> List[str]:
    out = set()
    for v in values or []:
        if not v:
            continue
        out.add(v)
        out.add(str(v).upper())
    return list(out)


WORKING_STATUS_TERMS = _status_terms(list(WORKING_STATUSES) + ["new", "contacted", "follow_up", "trial_booked", "trial_completed", "under_discussion", "under_process", "call_back", "call_back_requested", "follow_up_pending"])
NOT_WORKING_STATUS_TERMS = _status_terms(list(NOT_WORKING_STATUSES) + ["lost", "not_interested", "canceled", "duplicate", "no_response"])
CONVERTED_STATUS_TERMS = _status_terms(["converted", "won"])
TRANSFERRED_STATUS_TERMS = _status_terms(["transferred"])


def _parse_ymd(value: Optional[str]):
    s = (value or "").strip()
    if not s:
        return None
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if not m:
        return None
    try:
        return datetime.fromisoformat(m.group(1)).date()
    except Exception:
        return None


async def _owner_id_for_sla(user: dict, staff: Optional[dict], kind: str, *, location_id: Optional[str]) -> Optional[str]:
    if (kind or "").upper() == "OWNER":
        return _effective_owner_id(user)
    lid = location_id or user.get("location_id") or (staff or {}).get("location_id")
    if not lid:
        return None
    loc = await _db.locations.find_one({"location_id": lid, "is_deleted": False}, {"_id": 0, "owner_id": 1})
    return (loc or {}).get("owner_id")


async def _get_sla_settings(owner_id: Optional[str]) -> dict:
    defaults = {
        "csr_reminder_delay_days": 0,
        "team_lead_escalation_delay_days": 1,
        "manager_escalation_delay_days": 2,
    }
    if not owner_id:
        return defaults
    doc = await _db.sales_sla_settings.find_one({"owner_id": owner_id}, {"_id": 0})
    if not doc:
        return defaults
    out = dict(defaults)
    out.update({k: doc.get(k) for k in defaults.keys() if doc.get(k) is not None})
    return out


async def _follow_up_state_for_lead(lead: dict, *, settings: dict) -> dict:
    status = _norm_status(lead.get("status"))
    if status not in WORKING_STATUSES:
        return {"is_overdue": False, "overdue_days": 0, "reminder_state": "none", "escalation_level": 0}
    due = _parse_ymd(lead.get("next_follow_up_date"))
    if not due:
        return {"is_overdue": False, "overdue_days": 0, "reminder_state": "none", "escalation_level": 0}
    today = datetime.now(timezone.utc).date()
    overdue_days = (today - due).days
    if overdue_days <= 0:
        return {"is_overdue": False, "overdue_days": 0, "reminder_state": "none", "escalation_level": 0}

    last_touch = _parse_ymd(lead.get("last_touch_at") or lead.get("updated_at") or lead.get("created_at"))
    untouched = True
    if last_touch and last_touch > due:
        untouched = False

    csr_delay = int(settings.get("csr_reminder_delay_days") or 0)
    tl_delay = int(settings.get("team_lead_escalation_delay_days") or 1)
    mgr_delay = int(settings.get("manager_escalation_delay_days") or 2)

    escalation_level = 0
    if untouched and overdue_days >= mgr_delay:
        escalation_level = 2
    elif untouched and overdue_days >= tl_delay:
        escalation_level = 1

    reminder_state = "overdue" if overdue_days >= csr_delay else "none"
    out = {
        "is_overdue": True,
        "overdue_days": overdue_days,
        "reminder_state": reminder_state,
        "escalation_level": escalation_level,
        "escalated_to_kind": None,
        "escalated_to_staff_id": None,
        "escalated_to_name": None,
    }

    if escalation_level == 1:
        tl_id = lead.get("assigned_team_lead_staff_id")
        if not tl_id and (lead.get("assigned_team_id") or lead.get("assigned_csr_staff_id") or lead.get("assigned_agent_staff_id")):
            tl_id = await _infer_team_lead_staff_id(
                assigned_team_id=lead.get("assigned_team_id"),
                assigned_csr_staff_id=lead.get("assigned_csr_staff_id"),
                assigned_agent_staff_id=lead.get("assigned_agent_staff_id"),
            )
        out["escalated_to_kind"] = "TEAM_LEAD"
        out["escalated_to_staff_id"] = tl_id
        if tl_id:
            s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            out["escalated_to_name"] = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        return out

    if escalation_level == 2:
        supervisor_id = None
        if lead.get("assigned_team_id"):
            t = await _db.sales_teams.find_one({"sales_team_id": lead.get("assigned_team_id")}, {"_id": 0, "supervisor_staff_id": 1})
            supervisor_id = (t or {}).get("supervisor_staff_id") or None
        out["escalated_to_kind"] = "MANAGER"
        out["escalated_to_staff_id"] = supervisor_id
        if supervisor_id:
            s = await _db.staff.find_one({"staff_id": supervisor_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            out["escalated_to_name"] = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        return out

    return out


async def _get_staff_for_user(user: dict) -> Optional[dict]:
    staff_id = user.get("staff_id")
    if staff_id:
        return await _db.staff.find_one({"staff_id": staff_id}, {"_id": 0})
    return await _db.staff.find_one({"user_id": user.get("user_id")}, {"_id": 0})


async def _crm_actor(request: Request) -> Tuple[dict, Optional[dict], str]:
    user = await _get_current_user(request)
    if user.get("role") in ("CUSTOMER", "MEMBER"):
        raise HTTPException(403, "Staff access required")
    staff = await _get_staff_for_user(user)
    if staff and staff.get("is_sales") and staff.get("sales_role") in ("TEAM_LEAD", "AGENT", "CSR"):
        if staff.get("sales_role") == "TEAM_LEAD":
            return user, staff, "TEAM_LEAD"
        return user, staff, "CSR"
    if user.get("role") in ("OWNER", "OWNER_FULL"):
        return user, staff, "OWNER"
    if await _check_perm(user, "manager.view_sales_location") or await _check_perm(user, "manager.manage_sales_location"):
        return user, staff, "MANAGER"
    if user.get("location_id"):
        return user, staff, "MANAGER"
    return user, staff, "STAFF"


def _is_owner_kind(kind: str) -> bool:
    return (kind or "").upper() == "OWNER"


def _can_manage_sales(user: dict, kind: str) -> bool:
    if (kind or "").upper() in ("CSR", "TEAM_LEAD"):
        return True
    if user.get("role") in ("OWNER", "OWNER_FULL"):
        return True
    return False


async def _allowed_location_ids_for_actor(
    user: dict,
    staff: Optional[dict],
    kind: str,
    *,
    requested_location_id: Optional[str] = None,
) -> List[str]:
    k = (kind or "").upper()

    if k == "OWNER":
        if requested_location_id:
            await _verify_owner_loc(user, requested_location_id)
            return [requested_location_id]
        return await _owner_location_ids(user)

    if k in ("CSR", "TEAM_LEAD"):
        lids = set()
        if staff:
            if staff.get("location_id"):
                lids.add(staff["location_id"])
            for lid in (staff.get("supervised_location_ids") or []):
                if lid:
                    lids.add(lid)
        if staff and staff.get("staff_id"):
            teams = await _db.sales_teams.find(
                {"is_active": True, "$or": [{"team_lead_staff_id": staff["staff_id"]}, {"supervisor_staff_id": staff["staff_id"]}]},
                {"_id": 0, "location_id": 1},
            ).to_list(200)
            for t in teams:
                if t.get("location_id"):
                    lids.add(t["location_id"])
        if requested_location_id and lids and requested_location_id not in lids:
            raise HTTPException(403, "Access denied")
        if requested_location_id:
            return [requested_location_id]
        return list(lids)

    lids = set()
    if staff:
        for lid in (staff.get("supervised_location_ids") or []):
            if lid:
                lids.add(lid)
    if user.get("location_id"):
        lids.add(user["location_id"])
    if staff and staff.get("staff_id"):
        teams = await _db.sales_teams.find(
            {"is_active": True, "supervisor_staff_id": staff["staff_id"]},
            {"_id": 0, "location_id": 1},
        ).to_list(200)
        for t in teams:
            if t.get("location_id"):
                lids.add(t["location_id"])

    if not lids:
        raise HTTPException(403, "Access denied")
    if requested_location_id and requested_location_id not in lids:
        raise HTTPException(403, "Access denied")
    if requested_location_id:
        return [requested_location_id]
    return list(lids)


async def _team_ids_for_team_lead(team_lead_staff_id: str) -> List[str]:
    if not team_lead_staff_id:
        return []
    teams = await _db.sales_teams.find(
        {"is_active": True, "$or": [{"team_lead_staff_id": team_lead_staff_id}, {"supervisor_staff_id": team_lead_staff_id}]},
        {"_id": 0, "sales_team_id": 1},
    ).to_list(200)
    return [t.get("sales_team_id") for t in teams if t.get("sales_team_id")]


async def _csr_ids_reporting_to_team_lead(team_lead_staff_id: str) -> List[str]:
    if not team_lead_staff_id:
        return []
    ids = set()
    members = await _db.sales_team_members.find(
        {"is_active": True, "reports_to_staff_id": team_lead_staff_id, "member_type": {"$in": ["AGENT", "CSR"]}},
        {"_id": 0, "staff_id": 1},
    ).to_list(500)
    for m in members:
        if m.get("staff_id"):
            ids.add(m["staff_id"])
    staff_rows = await _db.staff.find(
        {"is_active": True, "reports_to_staff_id": team_lead_staff_id, "is_sales": True, "sales_role": {"$in": ["AGENT", "CSR"]}},
        {"_id": 0, "staff_id": 1},
    ).to_list(500)
    for s in staff_rows:
        if s.get("staff_id"):
            ids.add(s["staff_id"])
    return list(ids)


async def _require_crm_view(request: Request):
    user, staff, kind = await _crm_actor(request)
    if kind in ("CSR", "TEAM_LEAD"):
        return user, staff, kind
    if await _check_perm(user, "manager.view_sales_location"):
        return user, staff, kind
    raise HTTPException(403, "Insufficient permissions")


async def _require_crm_manage(request: Request):
    user, staff, kind = await _crm_actor(request)
    if kind in ("CSR", "TEAM_LEAD"):
        return user, staff, kind
    if await _check_perm(user, "manager.manage_sales_location"):
        return user, staff, kind
    raise HTTPException(403, "Insufficient permissions")


async def _lead_visibility_query(user: dict, staff: Optional[dict], kind: str, *, location_id: Optional[str] = None) -> Dict[str, Any]:
    query: Dict[str, Any] = {}

    if kind == "CSR":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        query["$or"] = [
            {"assigned_agent_staff_id": staff["staff_id"]},
            {"assigned_csr_staff_id": staff["staff_id"]},
        ]
        if location_id:
            query["location_id"] = location_id
        return query

    if kind == "TEAM_LEAD":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        team_ids = await _team_ids_for_team_lead(staff["staff_id"])
        csr_ids = await _csr_ids_reporting_to_team_lead(staff["staff_id"])
        or_terms: List[Dict[str, Any]] = [
            {"assigned_agent_staff_id": staff["staff_id"]},
            {"assigned_csr_staff_id": staff["staff_id"]},
        ]
        if team_ids:
            or_terms.append({"assigned_team_id": {"$in": team_ids}})
        if csr_ids:
            or_terms.append({"assigned_agent_staff_id": {"$in": csr_ids}})
            or_terms.append({"assigned_csr_staff_id": {"$in": csr_ids}})
        query["$or"] = or_terms
        if location_id:
            query["location_id"] = location_id
        return query

    if user.get("location_id"):
        lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
        query["location_id"] = {"$in": lids} if len(lids) > 1 else lids[0]
        return query

    if user.get("role") in ("OWNER", "OWNER_FULL"):
        lids = await _allowed_location_ids_for_actor(user, staff, "OWNER", requested_location_id=location_id)
        query["location_id"] = {"$in": lids} if len(lids) > 1 else lids[0]
        return query

    if staff and staff.get("staff_id") and await _check_perm(user, "manager.view_sales_location"):
        lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
        query["location_id"] = {"$in": lids} if len(lids) > 1 else lids[0]
        return query

    raise HTTPException(403, "Access denied")


async def _write_lead_event(*, lead_id: str, event_type: str, user: dict, staff: Optional[dict], payload: Dict[str, Any]):
    now = datetime.now(timezone.utc).isoformat()
    ev_id = f"sle_{uuid.uuid4().hex[:12]}"
    doc = {
        "sales_lead_event_id": ev_id,
        "sales_lead_id": lead_id,
        "type": event_type,
        "payload": payload or {},
        "actor_user_id": user.get("user_id"),
        "actor_role": user.get("role"),
        "actor_staff_id": (staff or {}).get("staff_id"),
        "created_at": now,
    }
    await _db.sales_lead_events.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _find_member_by_email_phone(email_norm: str, phone_norm: str) -> Optional[dict]:
    return await sales_identity.find_member_by_email_phone(_db, email_norm, phone_norm)


async def _find_lead_by_email_phone(email_norm: str, phone_norm: str, *, location_scope: Optional[Dict[str, Any]] = None) -> Optional[dict]:
    return await sales_identity.find_lead_by_email_phone(_db, email_norm, phone_norm, location_scope=location_scope)


async def _infer_team_lead_staff_id(
    *,
    assigned_team_id: Optional[str],
    assigned_csr_staff_id: Optional[str],
    assigned_agent_staff_id: Optional[str],
) -> Optional[str]:
    if assigned_team_id:
        t = await _db.sales_teams.find_one({"sales_team_id": assigned_team_id}, {"_id": 0, "team_lead_staff_id": 1})
        if t and t.get("team_lead_staff_id"):
            return t.get("team_lead_staff_id")
    csr_id = assigned_csr_staff_id or assigned_agent_staff_id
    if not csr_id:
        return None
    m = await _db.sales_team_members.find_one(
        {"staff_id": csr_id, "is_active": True, "is_primary_team": True},
        {"_id": 0, "member_type": 1, "reports_to_staff_id": 1, "sales_team_id": 1},
    )
    if m:
        if m.get("member_type") == "TEAM_LEAD":
            return csr_id
        if m.get("reports_to_staff_id"):
            return m.get("reports_to_staff_id")
        if m.get("sales_team_id"):
            t = await _db.sales_teams.find_one({"sales_team_id": m.get("sales_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
            if t and t.get("team_lead_staff_id"):
                return t.get("team_lead_staff_id")
    return None


async def _normalize_and_infer_lead_updates(*, base: dict, updates: dict) -> dict:
    out = dict(updates or {})
    if "location_id" in out and "assigned_location_id" not in out:
        out["assigned_location_id"] = out.get("location_id")
    if "assigned_location_id" in out and "location_id" not in out and out.get("assigned_location_id"):
        out["location_id"] = out.get("assigned_location_id")
    if "phone" in out:
        out["phone_norm"] = _norm_phone(out.get("phone"))
        out["phone_number"] = out.get("phone")
    if "email" in out:
        out["email_norm"] = _norm_email(out.get("email"))
    if "status" in out and "pipeline_stage" not in out:
        out["pipeline_stage"] = out.get("status")
    if "status" in out:
        out["status"] = _norm_status(out.get("status"))
        out["pipeline_stage"] = _norm_status(out.get("pipeline_stage") or out.get("status"))
    if "pipeline_stage" in out:
        out["pipeline_stage"] = _norm_status(out.get("pipeline_stage"))
    if "gender" in out and out.get("gender") is not None:
        out["gender"] = (out.get("gender") or "").strip().lower() or None
    if "purpose" in out and out.get("purpose") is not None:
        out["purpose"] = (out.get("purpose") or "").strip().lower()
    if "lead_priority" in out and out.get("lead_priority") is not None:
        out["lead_priority"] = (out.get("lead_priority") or "MEDIUM").upper()
    if "temperature" in out and out.get("temperature") is not None:
        out["lead_temperature"] = (out.get("temperature") or "").lower()
        out["temperature"] = (out.get("temperature") or "").upper()

    if "assigned_agent_staff_id" in out and "assigned_csr_staff_id" not in out:
        out["assigned_csr_staff_id"] = out.get("assigned_agent_staff_id") or None
    if "assigned_csr_staff_id" in out and "assigned_agent_staff_id" not in out:
        out["assigned_agent_staff_id"] = out.get("assigned_csr_staff_id") or None

    next_team_id = out.get("assigned_team_id") if "assigned_team_id" in out else base.get("assigned_team_id")
    next_csr_id = out.get("assigned_csr_staff_id") if "assigned_csr_staff_id" in out else base.get("assigned_csr_staff_id")
    next_agent_id = out.get("assigned_agent_staff_id") if "assigned_agent_staff_id" in out else base.get("assigned_agent_staff_id")
    if ("assigned_team_id" in out) or ("assigned_csr_staff_id" in out) or ("assigned_agent_staff_id" in out):
        out["assigned_team_lead_staff_id"] = await _infer_team_lead_staff_id(
            assigned_team_id=next_team_id,
            assigned_csr_staff_id=next_csr_id,
            assigned_agent_staff_id=next_agent_id,
        )

    if "assigned_team_id" in out and not out.get("assigned_team_id"):
        out["assigned_team_id"] = None
    if "assigned_team_lead_staff_id" in out and not out.get("assigned_team_lead_staff_id"):
        out["assigned_team_lead_staff_id"] = None
    if "assigned_agent_staff_id" in out and not out.get("assigned_agent_staff_id"):
        out["assigned_agent_staff_id"] = None
    if "assigned_csr_staff_id" in out and not out.get("assigned_csr_staff_id"):
        out["assigned_csr_staff_id"] = None
    return out


def _effective_owner_id(user: dict) -> Optional[str]:
    if user.get("role") == "OWNER":
        return user.get("user_id")
    if user.get("role") == "OWNER_FULL":
        return user.get("owner_id")
    return None


async def _owner_location_ids(user):
    owner_id = _effective_owner_id(user)
    if not owner_id:
        raise HTTPException(403, "Access denied")
    locs = await _db.locations.find(
        {"owner_id": owner_id, "is_deleted": False},
        {"_id": 0, "location_id": 1}
    ).to_list(100)
    return [loc["location_id"] for loc in locs]


async def _verify_owner_loc(user, lid):
    if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
        owner_id = _effective_owner_id(user)
        if not owner_id:
            raise HTTPException(403, "Access denied")
        loc = await _db.locations.find_one(
            {"location_id": lid, "owner_id": owner_id, "is_deleted": False}
        )
        if not loc:
            raise HTTPException(403, "Access denied")
        return loc
    return None


async def _resolve_location(user, request=None, body_lid=None, required=True):
    if user.get("location_id"):
        return user["location_id"]
    lid = body_lid or (request.query_params.get("location_id") if request else None)
    if not lid:
        if required:
            raise HTTPException(400, "location_id required")
        return None
    await _verify_owner_loc(user, lid)
    return lid


async def _check_team_access(user, team):
    if user.get("location_id") and team["location_id"] != user["location_id"]:
        raise HTTPException(403, "Access denied")
    if user["role"] == "OWNER" or user["role"] == "OWNER_FULL":
        await _verify_owner_loc(user, team["location_id"])


# ─── Pydantic Models ──────────────────────────────────────────────

class SalesTeamCreate(BaseModel):
    location_id: str = ""
    name: str
    description: str = ""
    team_lead_staff_id: str = ""
    supervisor_staff_id: str = ""
    supervisor_role: str = ""

class SalesTeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    team_lead_staff_id: Optional[str] = None
    is_active: Optional[bool] = None
    supervisor_staff_id: Optional[str] = None
    supervisor_role: Optional[str] = None

class TeamMemberAdd(BaseModel):
    staff_id: str
    member_type: str = "AGENT"  # CSR/AGENT or TEAM_LEAD
    reports_to_staff_id: str = ""

class TransferRequest(BaseModel):
    target_location_id: str
    target_team_id: str

class SalesLeadCreate(BaseModel):
    model_config = {"populate_by_name": True}
    location_id: str = ""
    full_name: str
    phone: str = Field("", alias="phone_number")
    email: str = ""
    source: str = "MANUAL_CSR_ENTRY"
    source_platform: str = ""
    campaign_name: str = ""
    adset_or_adgroup: str = ""
    source_reference: str = ""
    source_ref: Optional[Dict[str, Any]] = None
    discipline_slug: str = ""
    plan_id: str = ""
    assigned_team_id: str = ""
    assigned_agent_staff_id: str = ""
    notes: str = ""
    gender: Optional[str] = None
    address: str = ""
    purpose: str = ""
    program_interest: str = ""
    membership_plan: str = ""
    lead_priority: str = "MEDIUM"
    temperature: str = "WARM"
    preferred_contact_method: str = ""
    preferred_contact_time: str = ""
    tags: List[str] = []
    assigned_csr_staff_id: str = ""
    assigned_team_lead_staff_id: str = ""
    assigned_location_id: str = ""

class SalesLeadUpdate(BaseModel):
    model_config = {"populate_by_name": True}
    location_id: Optional[str] = None
    status: Optional[str] = None
    pipeline_stage: Optional[str] = None
    assigned_team_id: Optional[str] = None
    assigned_agent_staff_id: Optional[str] = None
    last_contact_date: Optional[str] = None
    next_follow_up_date: Optional[str] = None
    notes: Optional[str] = None
    membership_type: Optional[str] = None
    membership_plan_id: Optional[str] = None
    membership_start_date: Optional[str] = None
    membership_end_date: Optional[str] = None
    membership_price: Optional[float] = None
    currency: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = Field(None, alias="phone_number")
    email: Optional[str] = None
    source: Optional[str] = None
    source_platform: Optional[str] = None
    campaign_name: Optional[str] = None
    adset_or_adgroup: Optional[str] = None
    source_reference: Optional[str] = None
    source_ref: Optional[Dict[str, Any]] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    purpose: Optional[str] = None
    program_interest: Optional[str] = None
    membership_plan: Optional[str] = None
    lead_priority: Optional[str] = None
    temperature: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    preferred_contact_time: Optional[str] = None
    tags: Optional[List[str]] = None
    linked_member_id: Optional[str] = None
    duplicate_of_lead_id: Optional[str] = None
    assigned_csr_staff_id: Optional[str] = None
    assigned_team_lead_staff_id: Optional[str] = None
    assigned_location_id: Optional[str] = None

class LeadStatusUpdate(BaseModel):
    status: str
    note: str = ""
    reason_category: Optional[str] = None
    reason_comment: Optional[str] = None


class LeadActivityCreate(BaseModel):
    activity_type: str = Field(..., min_length=2, max_length=50)
    note: str = ""
    next_action_date: Optional[str] = None


class LeadTransferRequest(BaseModel):
    target_location_id: Optional[str] = None
    target_team_id: Optional[str] = None
    target_agent_staff_id: Optional[str] = None
    note: str = ""


class LeadConvertRequest(BaseModel):
    gender: str = Field(..., pattern="^(male|female)$")
    password: Optional[str] = None
    address: str = ""
    accept_terms: bool = False
    agreement_id: Optional[str] = None
    purpose: str = "self"
    program_interest: str = ""
    membership_plan: str = ""


class LeadMergeRequest(BaseModel):
    source_lead_id: str


class LeadAttachmentCreate(BaseModel):
    file_url: str
    file_name: str = ""
    attachment_type: str = "other"
    note: str = ""


class SLASettingsUpdate(BaseModel):
    csr_reminder_delay_days: int = 0
    team_lead_escalation_delay_days: int = 1
    manager_escalation_delay_days: int = 2


MAQSAM_SECRET_MASK = "••••••••"


class MaqsamSettingsUpdate(BaseModel):
    is_enabled: bool = False
    base_url: str = ""
    access_key_id: str = ""
    access_secret: str = ""
    contacts_enabled: Optional[bool] = None
    contacts_lang: Optional[str] = None
    contacts_custom_fields_format: Optional[str] = None
    contacts_include_pagination: Optional[bool] = None
    contacts_field_mappings: Optional[Dict[str, str]] = None


class MaqsamAgentMappingUpdate(BaseModel):
    mapping_enabled: bool = True
    mapped_staff_id: Optional[str] = None
    mapped_role: Optional[str] = None  # CSR, TEAM_LEAD, OTHER
    mapped_location_id: Optional[str] = None
    mapped_team_lead_staff_id: Optional[str] = None


class MaqsamContactUpsert(BaseModel):
    name: str = ""
    phone: str = ""
    high_priority: bool = False
    custom_fields: Optional[Dict[str, Any]] = None


class MaqsamContactPatch(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    high_priority: Optional[bool] = None
    custom_fields: Optional[Dict[str, Any]] = None


class MaqsamContactLinkRequest(BaseModel):
    target_kind: str = ""  # lead | member
    target_id: str = ""
    note: str = ""


class MaqsamContactCreateLeadRequest(BaseModel):
    location_id: Optional[str] = None
    assigned_team_id: Optional[str] = None
    assigned_agent_staff_id: Optional[str] = None
    assigned_team_lead_staff_id: Optional[str] = None


class TeamMemberUpdate(BaseModel):
    member_type: Optional[str] = None  # TEAM_LEAD or AGENT
    reports_to_staff_id: Optional[str] = None
    can_act_as_csr: Optional[bool] = None
    supervised_location_ids: Optional[List[str]] = None
    reporting_manager_type: Optional[str] = None
    reporting_manager_staff_id: Optional[str] = None


class BulkLeadImportRow(BaseModel):
    model_config = {"populate_by_name": True}
    full_name: str = ""
    phone: str = Field("", alias="phone_number")
    email: str = ""
    source: str = "BULK_IMPORT"
    location_id: str = Field("", alias="assigned_location_id")
    notes: str = ""
    gender: Optional[str] = None
    address: str = ""
    purpose: str = ""
    program_interest: str = ""
    membership_plan: str = ""
    lead_priority: str = "MEDIUM"
    temperature: str = "WARM"
    tags: List[str] = []


class BulkLeadImportRequest(BaseModel):
    rows: List[BulkLeadImportRow]


# ─── Sales Teams CRUD ─────────────────────────────────────────────

@router.get("/teams")
async def list_sales_teams(
    request: Request,
    location_id: Optional[str] = None,
    is_active: Optional[bool] = None
):
    user, staff, kind = await _require_crm_view(request)
    query: Dict[str, Any] = {}

    k = (kind or "").upper()
    if k == "CSR":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        member_q: Dict[str, Any] = {"staff_id": staff["staff_id"], "is_active": True}
        if location_id:
            member_q["location_id"] = location_id
        memberships = await _db.sales_team_members.find(member_q, {"_id": 0, "sales_team_id": 1}).to_list(50)
        team_ids = [m.get("sales_team_id") for m in memberships if m.get("sales_team_id")]
        query["sales_team_id"] = {"$in": team_ids} if team_ids else "__none__"
    elif k == "TEAM_LEAD":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        team_ids = await _team_ids_for_team_lead(staff["staff_id"])
        if location_id:
            query["location_id"] = location_id
        query["$or"] = [
            {"sales_team_id": {"$in": team_ids}} if team_ids else {"sales_team_id": "__none__"},
            {"team_lead_staff_id": staff["staff_id"]},
            {"supervisor_staff_id": staff["staff_id"]},
        ]
    else:
        lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
        query["location_id"] = {"$in": lids} if len(lids) > 1 else lids[0]

    if is_active is not None:
        query["is_active"] = is_active

    teams = await _db.sales_teams.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    team_ids = [t.get("sales_team_id") for t in teams if t.get("sales_team_id")]
    lead_ids = list({t.get("team_lead_staff_id") for t in teams if t.get("team_lead_staff_id")})
    location_ids = list({t.get("location_id") for t in teams if t.get("location_id")})

    counts_by_team = {}
    if team_ids:
        counts = await _db.sales_team_members.aggregate([
            {"$match": {"sales_team_id": {"$in": team_ids}, "is_active": True}},
            {"$group": {"_id": "$sales_team_id", "member_count": {"$sum": 1}}},
        ]).to_list(len(team_ids))
        counts_by_team = {c.get("_id"): int(c.get("member_count", 0)) for c in counts if c.get("_id")}

    leads_by_id = {}
    if lead_ids:
        leads = await _db.staff.find(
            {"staff_id": {"$in": lead_ids}},
            {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1},
        ).to_list(len(lead_ids))
        leads_by_id = {s.get("staff_id"): s for s in leads if s.get("staff_id")}

    locs_by_id = {}
    if location_ids:
        locs = await _db.locations.find(
            {"location_id": {"$in": location_ids}},
            {"_id": 0, "location_id": 1, "name": 1, "city": 1},
        ).to_list(len(location_ids))
        locs_by_id = {l.get("location_id"): l for l in locs if l.get("location_id")}

    for t in teams:
        t["member_count"] = int(counts_by_team.get(t.get("sales_team_id"), 0))
        t["team_lead"] = leads_by_id.get(t.get("team_lead_staff_id")) if t.get("team_lead_staff_id") else None
        loc = locs_by_id.get(t.get("location_id"))
        t["location_name"] = loc.get("name") if loc else "Unknown"
        t["location_city"] = loc.get("city", "") if loc else ""

    return {"teams": teams, "total": len(teams)}


@router.post("/teams", status_code=201)
async def create_sales_team(data: SalesTeamCreate, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")
    lid = await _resolve_location(user, body_lid=data.location_id or None)
    now = datetime.now(timezone.utc).isoformat()

    if data.team_lead_staff_id:
        staff = await _db.staff.find_one({
            "staff_id": data.team_lead_staff_id, "location_id": lid,
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        if not staff:
            raise HTTPException(400, "Team lead staff not found at this location")
        await _db.staff.update_one(
            {"staff_id": data.team_lead_staff_id},
            {"$set": {"is_sales": True, "sales_role": "TEAM_LEAD", "updated_at": now}}
        )

    team_id = f"steam_{uuid.uuid4().hex[:12]}"
    doc = {
        "sales_team_id": team_id,
        "location_id": lid,
        "name": data.name,
        "description": data.description,
        "team_lead_staff_id": data.team_lead_staff_id or None,
        "supervisor_staff_id": data.supervisor_staff_id or None,
        "supervisor_role": data.supervisor_role or None,
        "is_active": True,
        "created_by_user_id": user["user_id"],
        "created_at": now,
        "updated_at": now,
    }
    await _db.sales_teams.insert_one(doc)
    doc.pop("_id", None)

    if data.team_lead_staff_id:
        m_id = f"stm_{uuid.uuid4().hex[:12]}"
        m_doc = {
            "sales_team_member_id": m_id,
            "location_id": lid,
            "sales_team_id": team_id,
            "staff_id": data.team_lead_staff_id,
            "member_type": "TEAM_LEAD",
            "is_primary_team": True,
            "active_from": now,
            "active_to": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await _db.sales_team_members.insert_one(m_doc)

    return doc


@router.get("/teams/{team_id}")
async def get_sales_team(team_id: str, request: Request):
    user = await _require_sales(request, "manager.view_sales_location")
    team = await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Sales team not found")
    await _check_team_access(user, team)

    members = await _db.sales_team_members.find(
        {"sales_team_id": team_id, "is_active": True}, {"_id": 0}
    ).to_list(50)
    staff_ids = list({m.get("staff_id") for m in members if m.get("staff_id")})
    staff_by_id = {}
    if staff_ids:
        staff_docs = await _db.staff.find(
            {"staff_id": {"$in": staff_ids}},
            {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1,
             "email": 1, "phone": 1, "profile_image_path": 1, "role": 1}
        ).to_list(len(staff_ids))
        staff_by_id = {s.get("staff_id"): s for s in staff_docs if s.get("staff_id")}
    for m in members:
        m["staff"] = staff_by_id.get(m.get("staff_id"))
    team["members"] = members

    loc = await _db.locations.find_one(
        {"location_id": team["location_id"]}, {"_id": 0, "name": 1, "city": 1}
    )
    team["location_name"] = loc["name"] if loc else "Unknown"
    team["location_city"] = loc.get("city", "") if loc else ""
    return team


@router.patch("/teams/{team_id}")
async def update_sales_team(team_id: str, data: SalesTeamUpdate, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")
    team = await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Sales team not found")
    await _check_team_access(user, team)

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "team_lead_staff_id" in updates:
        s = await _db.staff.find_one({
            "staff_id": updates["team_lead_staff_id"],
            "location_id": team["location_id"],
            "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
        })
        if not s:
            raise HTTPException(400, "Team lead staff not found at this location")
        now_ts = datetime.now(timezone.utc).isoformat()
        await _db.staff.update_one(
            {"staff_id": updates["team_lead_staff_id"]},
            {"$set": {"is_sales": True, "sales_role": "TEAM_LEAD", "updated_at": now_ts}}
        )
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.sales_teams.update_one({"sales_team_id": team_id}, {"$set": updates})
    return await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})


@router.patch("/teams/{team_id}/deactivate")
async def deactivate_sales_team(team_id: str, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")
    team = await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Sales team not found")
    await _check_team_access(user, team)

    now = datetime.now(timezone.utc).isoformat()
    await _db.sales_teams.update_one(
        {"sales_team_id": team_id},
        {"$set": {"is_active": False, "updated_at": now}}
    )
    await _db.sales_team_members.update_many(
        {"sales_team_id": team_id, "is_active": True},
        {"$set": {"is_active": False, "active_to": now, "updated_at": now}}
    )
    return {"message": "Sales team deactivated"}


# ─── Sales Team Members ───────────────────────────────────────────

@router.get("/teams/{team_id}/members")
async def list_team_members(team_id: str, request: Request, include_history: bool = False):
    user = await _require_sales(request, "manager.view_sales_location")
    team = await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Sales team not found")
    await _check_team_access(user, team)

    query = {"sales_team_id": team_id}
    if not include_history:
        query["is_active"] = True
    members = await _db.sales_team_members.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    staff_ids = list({m.get("staff_id") for m in members if m.get("staff_id")})
    staff_by_id = {}
    if staff_ids:
        staff_docs = await _db.staff.find(
            {"staff_id": {"$in": staff_ids}},
            {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1,
             "email": 1, "phone": 1, "profile_image_path": 1, "role": 1}
        ).to_list(len(staff_ids))
        staff_by_id = {s.get("staff_id"): s for s in staff_docs if s.get("staff_id")}
    for m in members:
        m["staff"] = staff_by_id.get(m.get("staff_id"))
    return {"members": members, "total": len(members)}


@router.post("/teams/{team_id}/members", status_code=201)
async def add_team_member(team_id: str, data: TeamMemberAdd, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")
    team = await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})
    if not team:
        raise HTTPException(404, "Sales team not found")
    await _check_team_access(user, team)

    if data.member_type not in ("TEAM_LEAD", "AGENT", "CSR"):
        raise HTTPException(400, "member_type must be TEAM_LEAD or AGENT/CSR")

    staff_query = {"staff_id": data.staff_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}
    if data.member_type != "TEAM_LEAD":
        staff_query["location_id"] = team["location_id"]
    staff = await _db.staff.find_one(staff_query)
    if not staff:
        raise HTTPException(400, "Staff not found at this location")

    existing = await _db.sales_team_members.find_one({
        "sales_team_id": team_id, "staff_id": data.staff_id, "is_active": True
    })
    if existing:
        raise HTTPException(400, "Staff already active in this team")

    now = datetime.now(timezone.utc).isoformat()
    effective_role = "AGENT" if data.member_type == "CSR" else data.member_type
    await _db.staff.update_one(
        {"staff_id": data.staff_id},
        {"$set": {"is_sales": True, "sales_role": effective_role, "updated_at": now}}
    )

    m_id = f"stm_{uuid.uuid4().hex[:12]}"
    doc = {
        "sales_team_member_id": m_id,
        "location_id": team["location_id"],
        "sales_team_id": team_id,
        "staff_id": data.staff_id,
        "member_type": effective_role,
        "reports_to_staff_id": data.reports_to_staff_id or None,
        "reporting_manager_type": team.get("supervisor_role") or None,
        "reporting_manager_staff_id": team.get("supervisor_staff_id") or None,
        "is_team_lead": effective_role == "TEAM_LEAD",
        "can_act_as_csr": effective_role == "TEAM_LEAD",
        "supervised_location_ids": [team["location_id"]] if effective_role == "TEAM_LEAD" else [],
        "is_primary_team": True,
        "active_from": now,
        "active_to": None,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await _db.sales_team_members.insert_one(doc)
    doc.pop("_id", None)

    if data.member_type == "TEAM_LEAD":
        await _db.sales_teams.update_one(
            {"sales_team_id": team_id},
            {"$set": {"team_lead_staff_id": data.staff_id, "updated_at": now}}
        )

    return doc


@router.patch("/teams/{team_id}/members/{member_id}/deactivate")
async def deactivate_team_member(team_id: str, member_id: str, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")
    member = await _db.sales_team_members.find_one({
        "sales_team_member_id": member_id, "sales_team_id": team_id, "is_active": True
    }, {"_id": 0})
    if not member:
        raise HTTPException(404, "Team member not found")
    team = await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})
    await _check_team_access(user, team)

    now = datetime.now(timezone.utc).isoformat()
    await _db.sales_team_members.update_one(
        {"sales_team_member_id": member_id},
        {"$set": {"is_active": False, "active_to": now, "updated_at": now}}
    )
    return {"message": "Team member removed"}


@router.patch("/teams/{team_id}/members/{member_id}")
async def update_team_member(team_id: str, member_id: str, data: TeamMemberUpdate, request: Request):
    """Update a team member's role (TEAM_LEAD / AGENT)"""
    user = await _require_sales(request, "manager.manage_sales_location")
    member = await _db.sales_team_members.find_one({
        "sales_team_member_id": member_id, "sales_team_id": team_id, "is_active": True
    }, {"_id": 0})
    if not member:
        raise HTTPException(404, "Team member not found")
    team = await _db.sales_teams.find_one({"sales_team_id": team_id}, {"_id": 0})
    await _check_team_access(user, team)

    updates = {}
    now = datetime.now(timezone.utc).isoformat()

    if data.member_type:
        if data.member_type not in ("TEAM_LEAD", "AGENT", "CSR"):
            raise HTTPException(400, "member_type must be TEAM_LEAD or AGENT/CSR")
        updates["member_type"] = "AGENT" if data.member_type == "CSR" else data.member_type

        # Update staff sales_role
        await _db.staff.update_one(
            {"staff_id": member["staff_id"]},
            {"$set": {"sales_role": updates["member_type"], "updated_at": now}}
        )

        # If promoting to TEAM_LEAD, update team's team_lead_staff_id
        if updates["member_type"] == "TEAM_LEAD":
            # Demote existing team lead if any
            existing_leads = await _db.sales_team_members.find({
                "sales_team_id": team_id,
                "member_type": "TEAM_LEAD",
                "is_active": True,
                "sales_team_member_id": {"$ne": member_id}
            }).to_list(10)
            for el in existing_leads:
                await _db.sales_team_members.update_one(
                    {"sales_team_member_id": el["sales_team_member_id"]},
                    {"$set": {"member_type": "AGENT", "updated_at": now}}
                )
                await _db.staff.update_one(
                    {"staff_id": el["staff_id"]},
                    {"$set": {"sales_role": "AGENT", "updated_at": now}}
                )
            # Update team's team_lead_staff_id
            await _db.sales_teams.update_one(
                {"sales_team_id": team_id},
                {"$set": {"team_lead_staff_id": member["staff_id"], "updated_at": now}}
            )
        # If demoting from TEAM_LEAD, clear team's team_lead_staff_id if it matches
        elif member["member_type"] == "TEAM_LEAD" and updates["member_type"] == "AGENT":
            if team.get("team_lead_staff_id") == member["staff_id"]:
                await _db.sales_teams.update_one(
                    {"sales_team_id": team_id},
                    {"$set": {"team_lead_staff_id": None, "updated_at": now}}
                )

    if data.reports_to_staff_id is not None:
        updates["reports_to_staff_id"] = data.reports_to_staff_id or None

    if data.can_act_as_csr is not None:
        updates["can_act_as_csr"] = bool(data.can_act_as_csr)

    if data.supervised_location_ids is not None:
        updates["supervised_location_ids"] = data.supervised_location_ids or []

    if data.reporting_manager_type is not None:
        updates["reporting_manager_type"] = data.reporting_manager_type or None

    if data.reporting_manager_staff_id is not None:
        updates["reporting_manager_staff_id"] = data.reporting_manager_staff_id or None

    if "member_type" in updates:
        updates["is_team_lead"] = updates["member_type"] == "TEAM_LEAD"
        if updates["member_type"] == "TEAM_LEAD" and "supervised_location_ids" not in updates:
            updates["supervised_location_ids"] = list({team.get("location_id")}.union(set((member.get("supervised_location_ids") or [])))) if team.get("location_id") else (member.get("supervised_location_ids") or [])
        if updates["member_type"] == "TEAM_LEAD" and "can_act_as_csr" not in updates:
            updates["can_act_as_csr"] = True
        if updates["member_type"] != "TEAM_LEAD":
            updates.setdefault("supervised_location_ids", [])
            updates.setdefault("can_act_as_csr", False)

    if not updates:
        raise HTTPException(400, "No fields to update")

    updates["updated_at"] = now
    await _db.sales_team_members.update_one(
        {"sales_team_member_id": member_id},
        {"$set": updates}
    )
    return await _db.sales_team_members.find_one({"sales_team_member_id": member_id}, {"_id": 0})


# ─── Agent Transfer ────────────────────────────────────────────────

@router.post("/members/{member_id}/transfer")
async def transfer_agent(member_id: str, data: TransferRequest, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")

    current = await _db.sales_team_members.find_one(
        {"sales_team_member_id": member_id, "is_active": True}, {"_id": 0}
    )
    if not current:
        raise HTTPException(404, "Active team member not found")
    cur_team = await _db.sales_teams.find_one(
        {"sales_team_id": current["sales_team_id"]}, {"_id": 0}
    )
    if not cur_team:
        raise HTTPException(404, "Current team not found")

    if user.get("location_id"):
        if cur_team["location_id"] != user["location_id"]:
            raise HTTPException(403, "Access denied")
        if data.target_location_id != user["location_id"]:
            raise HTTPException(403, "Cross-location transfers require Owner access")
    elif user.get("role") in ("OWNER", "OWNER_FULL"):
        await _verify_owner_loc(user, cur_team["location_id"])
        await _verify_owner_loc(user, data.target_location_id)
    else:
        raise HTTPException(403, "Access denied")

    target_team = await _db.sales_teams.find_one({
        "sales_team_id": data.target_team_id,
        "location_id": data.target_location_id,
        "is_active": True,
    }, {"_id": 0})
    if not target_team:
        raise HTTPException(400, "Target team not found or inactive at target location")

    now = datetime.now(timezone.utc).isoformat()
    await _db.sales_team_members.update_one(
        {"sales_team_member_id": member_id},
        {"$set": {"is_active": False, "active_to": now, "updated_at": now}}
    )

    new_id = f"stm_{uuid.uuid4().hex[:12]}"
    new_doc = {
        "sales_team_member_id": new_id,
        "location_id": data.target_location_id,
        "sales_team_id": data.target_team_id,
        "staff_id": current["staff_id"],
        "member_type": current["member_type"],
        "is_primary_team": True,
        "active_from": now,
        "active_to": None,
        "is_active": True,
        "transferred_from_team_id": current["sales_team_id"],
        "transferred_from_location_id": cur_team["location_id"],
        "created_at": now,
        "updated_at": now,
    }
    await _db.sales_team_members.insert_one(new_doc)
    new_doc.pop("_id", None)

    if data.target_location_id != cur_team["location_id"]:
        await _db.staff.update_one(
            {"staff_id": current["staff_id"]},
            {"$set": {"location_id": data.target_location_id, "updated_at": now}}
        )

    return {"message": "Agent transferred", "new_membership": new_doc}


# ─── Sales Leads CRUD ─────────────────────────────────────────────

VALID_LEAD_STATUSES = [
    "new",
    "converted",
    "canceled",
    "not_interested",
    "under_discussion",
    "under_process",
    "call_back_requested",
    "follow_up_pending",
    "no_response",
    "duplicate",
    "transferred",
]

LOST_REASON_REQUIRED_STATUSES = {"canceled", "not_interested", "no_response", "duplicate"}

VALID_LEAD_SOURCES = [
    "WEBSITE_CONTACT_US",
    "WEBSITE_JOIN_FORM",
    "MANUAL_CSR_ENTRY",
    "BULK_IMPORT",
    "META",
    "TIKTOK",
    "SNAPCHAT",
    "MAQSAM",
    "WEBSITE",
    "FACEBOOK_AD",
    "INSTAGRAM_AD",
    "WHATSAPP",
    "CALL",
    "WALK_IN",
    "REFERRAL",
    "OTHER",
]


@router.get("/leads")
async def list_sales_leads(
    request: Request,
    location_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_team_id: Optional[str] = None,
    assigned_agent_staff_id: Optional[str] = None,
    source: Optional[str] = None,
    working_group: Optional[str] = None,
    gender: Optional[str] = None,
    purpose: Optional[str] = None,
    program_interest: Optional[str] = None,
    membership_plan: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 200,
    skip: int = 0,
):
    user, staff, kind = await _require_crm_view(request)
    query = await _lead_visibility_query(user, staff, kind, location_id=location_id)
    active_filter = {"is_merged": {"$ne": True}, "$or": [{"is_active": True}, {"is_active": {"$exists": False}}]}
    if "$and" in query and isinstance(query.get("$and"), list):
        query["$and"].append(active_filter)
    else:
        query["$and"] = [active_filter]

    if status:
        query["status"] = _norm_status(status)
    if assigned_team_id:
        query["assigned_team_id"] = assigned_team_id
    if assigned_agent_staff_id:
        query["assigned_agent_staff_id"] = assigned_agent_staff_id
    if source:
        query["source"] = source
    if working_group:
        wg = (working_group or "").strip().lower()
        if wg == "working":
            query["status"] = {"$in": WORKING_STATUS_TERMS}
        elif wg == "not_working":
            query["status"] = {"$in": NOT_WORKING_STATUS_TERMS}
        elif wg == "converted":
            query["status"] = {"$in": CONVERTED_STATUS_TERMS}
        elif wg == "transferred":
            query["status"] = {"$in": TRANSFERRED_STATUS_TERMS}
    if gender:
        query["gender"] = (gender or "").strip().lower()
    if purpose:
        query["purpose"] = (purpose or "").strip().lower()
    if program_interest:
        query["program_interest"] = program_interest
    if membership_plan:
        query["membership_plan"] = membership_plan
    if date_from:
        query.setdefault("created_at", {})["$gte"] = date_from
    if date_to:
        query.setdefault("created_at", {})["$lte"] = date_to

    total = await _db.sales_leads.count_documents(query)
    leads = await _db.sales_leads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    tl_team_ids: set = set()
    tl_csr_ids: set = set()
    actor_staff_id = (staff or {}).get("staff_id")
    if kind == "TEAM_LEAD" and actor_staff_id:
        tl_team_ids = set(await _team_ids_for_team_lead(actor_staff_id))
        tl_csr_ids = set(await _csr_ids_reporting_to_team_lead(actor_staff_id))

    owner_id = await _owner_id_for_sla(user, staff, kind, location_id=location_id)
    sla_settings = await _get_sla_settings(owner_id)

    for ld in leads:
        ld["status"] = _norm_status(ld.get("status"))
        ld["pipeline_stage"] = _norm_status(ld.get("pipeline_stage") or ld.get("status"))
        rc = _lead_reporting_class(ld.get("status"))
        ld["reporting_class"] = rc
        ld["working_group"] = rc
        ld["follow_up_state"] = await _follow_up_state_for_lead(ld, settings=sla_settings)
        bucket = "branch"
        if kind == "CSR" and actor_staff_id:
            bucket = "direct"
        elif kind == "TEAM_LEAD" and actor_staff_id:
            assigned_id = ld.get("assigned_csr_staff_id") or ld.get("assigned_agent_staff_id")
            if assigned_id == actor_staff_id:
                bucket = "direct"
            elif (assigned_id and assigned_id in tl_csr_ids) or (ld.get("assigned_team_id") and ld.get("assigned_team_id") in tl_team_ids):
                bucket = "team"
            else:
                bucket = "branch"
        ld["owner_bucket"] = bucket
        if ld.get("assigned_agent_staff_id"):
            ag = await _db.staff.find_one(
                {"staff_id": ld["assigned_agent_staff_id"]},
                {"_id": 0, "first_name": 1, "last_name": 1}
            )
            ld["assigned_agent_name"] = f"{ag['first_name']} {ag['last_name']}" if ag else None
        else:
            ld["assigned_agent_name"] = None
        if ld.get("assigned_team_id"):
            tm = await _db.sales_teams.find_one(
                {"sales_team_id": ld["assigned_team_id"]}, {"_id": 0, "name": 1}
            )
            ld["assigned_team_name"] = tm["name"] if tm else None
        else:
            ld["assigned_team_name"] = None
        loc = await _db.locations.find_one(
            {"location_id": ld["location_id"]}, {"_id": 0, "name": 1}
        )
        ld["location_name"] = loc["name"] if loc else "Unassigned"

    return {"leads": leads, "total": total}


@router.get("/leads/{lead_id}")
async def get_sales_lead(lead_id: str, request: Request):
    user, staff, kind = await _require_crm_view(request)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    check = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not check:
        raise HTTPException(403, "Access denied")

    owner_id = await _owner_id_for_sla(user, staff, kind, location_id=lead.get("location_id"))
    sla_settings = await _get_sla_settings(owner_id)
    lead["follow_up_state"] = await _follow_up_state_for_lead(lead, settings=sla_settings)

    if lead.get("assigned_agent_staff_id"):
        lead["assigned_agent"] = await _db.staff.find_one(
            {"staff_id": lead["assigned_agent_staff_id"]},
            {"_id": 0, "first_name": 1, "last_name": 1, "email": 1, "phone": 1}
        )
    if lead.get("assigned_team_id"):
        lead["assigned_team"] = await _db.sales_teams.find_one(
            {"sales_team_id": lead["assigned_team_id"]},
            {"_id": 0, "name": 1, "sales_team_id": 1}
        )
    if lead.get("contact_submission_id"):
        lead["contact_submission"] = await _db.contact_submissions.find_one(
            {"submission_id": lead["contact_submission_id"]}, {"_id": 0}
        )
    loc = await _db.locations.find_one(
        {"location_id": lead.get("location_id")}, {"_id": 0, "name": 1, "city": 1}
    )
    lead["location_name"] = loc["name"] if loc else "Unassigned"
    lead["status"] = _norm_status(lead.get("status"))
    lead["pipeline_stage"] = _norm_status(lead.get("pipeline_stage") or lead.get("status"))
    rc = _lead_reporting_class(lead.get("status"))
    lead["reporting_class"] = rc
    lead["working_group"] = rc if rc in ("working", "not_working", "converted", "transferred") else "other"
    return lead


@router.get("/leads/{lead_id}/timeline")
async def get_lead_timeline(lead_id: str, request: Request, limit: int = 200):
    user, staff, kind = await _require_crm_view(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")
    events = await _db.sales_lead_events.find(
        {"sales_lead_id": lead_id}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return {"lead": {"sales_lead_id": lead_id}, "events": events}


@router.post("/leads", status_code=201)
async def create_sales_lead(data: SalesLeadCreate, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    lid = data.location_id or None
    if kind in ("CSR", "TEAM_LEAD"):
        if not staff:
            raise HTTPException(403, "Sales staff record not found")
        lid = lid or staff.get("location_id")
        if not lid:
            raise HTTPException(400, "location_id required")
    else:
        lid = await _resolve_location(user, body_lid=lid)
    now = datetime.now(timezone.utc).isoformat()

    email_norm = _norm_email(data.email)
    phone_norm = _norm_phone(data.phone)
    loc_scope = {"location_id": lid} if lid else None

    existing_member = await _find_member_by_email_phone(email_norm, phone_norm)
    if existing_member:
        loc = await _db.locations.find_one({"location_id": existing_member.get("location_id")}, {"_id": 0, "name": 1, "owner_id": 1})
        sales_attr = existing_member.get("sales_attribution") or {}
        csr_id = sales_attr.get("csr_staff_id")
        tl_id = sales_attr.get("team_lead_staff_id")
        csr_name = None
        tl_name = None
        if csr_id:
            s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        if tl_id:
            s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        member_id = existing_member.get("member_id")
        linked_lead = None
        if member_id:
            linked_lead = await _db.sales_leads.find_one({"linked_member_id": member_id}, {"_id": 0})
        if not linked_lead:
            linked_lead = await _find_lead_by_email_phone(email_norm, phone_norm, location_scope={"location_id": existing_member.get("location_id")} if existing_member.get("location_id") else None)
        linked = None
        if linked_lead:
            linked_team = None
            if linked_lead.get("assigned_team_id"):
                linked_team = await _db.sales_teams.find_one(
                    {"sales_team_id": linked_lead.get("assigned_team_id")},
                    {"_id": 0, "name": 1, "team_lead_staff_id": 1, "supervisor_staff_id": 1, "supervisor_role": 1},
                )
            linked_team_lead_id = linked_lead.get("assigned_team_lead_staff_id") or (linked_team or {}).get("team_lead_staff_id")
            linked_csr_id = linked_lead.get("assigned_csr_staff_id") or linked_lead.get("assigned_agent_staff_id")
            linked_csr_name = None
            linked_team_lead_name = None
            linked_supervisor_name = None
            linked_supervisor_id = (linked_team or {}).get("supervisor_staff_id")
            if linked_csr_id:
                s = await _db.staff.find_one({"staff_id": linked_csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                linked_csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            if linked_team_lead_id:
                s = await _db.staff.find_one({"staff_id": linked_team_lead_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                linked_team_lead_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            if linked_supervisor_id:
                s = await _db.staff.find_one({"staff_id": linked_supervisor_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                linked_supervisor_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            linked = {
                "existing_lead_id": linked_lead.get("sales_lead_id"),
                "existing_lead_status": _norm_status(linked_lead.get("status")),
                "existing_lead_reporting_class": _lead_reporting_class(linked_lead.get("status")),
                "assigned_team_id": linked_lead.get("assigned_team_id"),
                "assigned_team_name": (linked_team or {}).get("name") or None,
                "assigned_csr_staff_id": linked_csr_id,
                "assigned_csr_name": linked_csr_name,
                "assigned_team_lead_staff_id": linked_team_lead_id,
                "assigned_team_lead_name": linked_team_lead_name,
                "current_supervisor_staff_id": linked_supervisor_id,
                "current_supervisor_name": linked_supervisor_name,
                "current_supervisor_role": (linked_team or {}).get("supervisor_role") or None,
            }
        raise HTTPException(
            status_code=409,
            detail={
                "kind": "member_exists",
                "message": "Email/phone already belongs to an existing member",
                "member_id": member_id,
                "location_id": existing_member.get("location_id"),
                "location_name": (loc or {}).get("name") or None,
                "location_owner_id": (loc or {}).get("owner_id") or None,
                "member_name": existing_member.get("full_name") or None,
                "member_status": existing_member.get("status") or existing_member.get("membership_status") or None,
                "current_csr_staff_id": csr_id,
                "current_csr_name": csr_name,
                "current_team_lead_staff_id": tl_id,
                "current_team_lead_name": tl_name,
                "linked": linked,
            },
        )

    existing_lead = await _find_lead_by_email_phone(email_norm, phone_norm, location_scope=loc_scope)
    if existing_lead:
        team_lead_staff_id = existing_lead.get("assigned_team_lead_staff_id")
        if not team_lead_staff_id and existing_lead.get("assigned_team_id"):
            t = await _db.sales_teams.find_one({"sales_team_id": existing_lead.get("assigned_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
            team_lead_staff_id = (t or {}).get("team_lead_staff_id")
        csr_id = existing_lead.get("assigned_csr_staff_id") or existing_lead.get("assigned_agent_staff_id")
        csr_name = None
        tl_name = None
        if csr_id:
            s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        if team_lead_staff_id:
            s = await _db.staff.find_one({"staff_id": team_lead_staff_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        loc = await _db.locations.find_one({"location_id": existing_lead.get("location_id")}, {"_id": 0, "name": 1, "owner_id": 1})
        team_name = None
        supervisor_staff_id = None
        supervisor_role = None
        supervisor_name = None
        if existing_lead.get("assigned_team_id"):
            tm = await _db.sales_teams.find_one({"sales_team_id": existing_lead.get("assigned_team_id")}, {"_id": 0, "name": 1, "supervisor_staff_id": 1, "supervisor_role": 1})
            team_name = (tm or {}).get("name") or None
            supervisor_staff_id = (tm or {}).get("supervisor_staff_id") or None
            supervisor_role = (tm or {}).get("supervisor_role") or None
        if supervisor_staff_id:
            s = await _db.staff.find_one({"staff_id": supervisor_staff_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            supervisor_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        raise HTTPException(
            status_code=409,
            detail={
                "kind": "lead_duplicate",
                "message": "Duplicate lead exists for this email/phone",
                "existing_lead_id": existing_lead.get("sales_lead_id"),
                "existing_lead_status": _norm_status(existing_lead.get("status")),
                "existing_lead_reporting_class": _lead_reporting_class(existing_lead.get("status")),
                "assigned_agent_staff_id": existing_lead.get("assigned_agent_staff_id"),
                "assigned_csr_staff_id": csr_id,
                "assigned_csr_name": csr_name,
                "assigned_team_id": existing_lead.get("assigned_team_id"),
                "assigned_team_name": team_name,
                "assigned_team_lead_staff_id": team_lead_staff_id,
                "assigned_team_lead_name": tl_name,
                "location_id": existing_lead.get("location_id"),
                "location_name": (loc or {}).get("name") or None,
                "location_owner_id": (loc or {}).get("owner_id") or None,
                "current_supervisor_staff_id": supervisor_staff_id,
                "current_supervisor_name": supervisor_name,
                "current_supervisor_role": supervisor_role,
            },
        )

    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    init_status = "new"
    doc = {
        "sales_lead_id": lead_id,
        "location_id": lid,
        "assigned_location_id": lid,
        "contact_submission_id": None,
        "contact_submission_ids": [],
        "full_name": data.full_name,
        "phone": data.phone,
        "phone_number": data.phone,
        "phone_norm": phone_norm,
        "email": data.email,
        "email_norm": email_norm,
        "source": data.source,
        "source_platform": data.source_platform,
        "campaign_name": data.campaign_name,
        "adset_or_adgroup": data.adset_or_adgroup,
        "source_reference": data.source_reference,
        "source_ref": data.source_ref or {},
        "discipline_slug": data.discipline_slug or None,
        "plan_id": data.plan_id or None,
        "status": init_status,
        "pipeline_stage": init_status,
        "assigned_team_id": data.assigned_team_id or None,
        "assigned_agent_staff_id": data.assigned_agent_staff_id or (staff.get("staff_id") if kind in ("CSR", "TEAM_LEAD") and staff else None),
        "assigned_csr_staff_id": data.assigned_csr_staff_id or data.assigned_agent_staff_id or (staff.get("staff_id") if kind in ("CSR", "TEAM_LEAD") and staff else None),
        "assigned_team_lead_staff_id": data.assigned_team_lead_staff_id or None,
        "last_contact_date": None,
        "next_follow_up_date": None,
        "notes": data.notes,
        "gender": (data.gender or None),
        "address": data.address,
        "purpose": data.purpose or "self",
        "program_interest": data.program_interest or (data.discipline_slug or ""),
        "membership_plan": data.membership_plan,
        "lead_priority": (data.lead_priority or "MEDIUM").upper(),
        "lead_temperature": (data.temperature or "WARM").lower(),
        "temperature": (data.temperature or "WARM").upper(),
        "preferred_contact_method": data.preferred_contact_method,
        "preferred_contact_time": data.preferred_contact_time,
        "tags": data.tags or [],
        "linked_member_id": None,
        "duplicate_of_lead_id": None,
        "membership_type": None,
        "membership_plan_id": None,
        "membership_start_date": None,
        "membership_end_date": None,
        "membership_price": None,
        "currency": "AED",
        "created_at": now,
        "updated_at": now,
        "last_touch_at": now,
    }
    doc = await _normalize_and_infer_lead_updates(base={}, updates=doc)
    await _db.sales_leads.insert_one(doc)
    doc.pop("_id", None)
    await _write_lead_event(
        lead_id=lead_id,
        event_type="CREATED",
        user=user,
        staff=staff,
        payload={
            "source": doc.get("source"),
            "location_id": doc.get("location_id"),
            "assigned_team_id": doc.get("assigned_team_id"),
            "assigned_agent_staff_id": doc.get("assigned_agent_staff_id"),
        },
    )
    return doc


@router.patch("/leads/{lead_id}")
async def update_sales_lead(lead_id: str, data: SalesLeadUpdate, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")

    if kind == "CSR":
        restricted = {"location_id", "assigned_location_id", "assigned_team_id", "assigned_agent_staff_id", "assigned_csr_staff_id", "assigned_team_lead_staff_id"}
        if any(k in updates for k in restricted):
            raise HTTPException(403, "CSRs cannot reassign leads")

    next_email_norm = _norm_email(updates.get("email")) if "email" in updates else (lead.get("email_norm") or _norm_email(lead.get("email")))
    next_phone_norm = _norm_phone(updates.get("phone")) if "phone" in updates else (lead.get("phone_norm") or _norm_phone(lead.get("phone")))
    next_location_id = updates.get("location_id") or updates.get("assigned_location_id") or lead.get("location_id")

    identity_changed = False
    if "email" in updates:
        identity_changed = True
    if "phone" in updates:
        identity_changed = True
    if "location_id" in updates or "assigned_location_id" in updates:
        identity_changed = True

    if identity_changed and (next_email_norm or next_phone_norm):
        existing_member = await _find_member_by_email_phone(next_email_norm, next_phone_norm)
        if existing_member and existing_member.get("member_id") != lead.get("linked_member_id"):
            loc = await _db.locations.find_one({"location_id": existing_member.get("location_id")}, {"_id": 0, "name": 1, "owner_id": 1})
            sales_attr = existing_member.get("sales_attribution") or {}
            csr_id = sales_attr.get("csr_staff_id")
            tl_id = sales_attr.get("team_lead_staff_id")
            csr_name = None
            tl_name = None
            if csr_id:
                s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            if tl_id:
                s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            member_id = existing_member.get("member_id")
            linked_lead = None
            if member_id:
                linked_lead = await _db.sales_leads.find_one({"linked_member_id": member_id}, {"_id": 0})
            if not linked_lead:
                linked_lead = await _find_lead_by_email_phone(next_email_norm, next_phone_norm, location_scope={"location_id": existing_member.get("location_id")} if existing_member.get("location_id") else None)
            linked = None
            if linked_lead:
                linked_team = None
                if linked_lead.get("assigned_team_id"):
                    linked_team = await _db.sales_teams.find_one(
                        {"sales_team_id": linked_lead.get("assigned_team_id")},
                        {"_id": 0, "name": 1, "team_lead_staff_id": 1, "supervisor_staff_id": 1, "supervisor_role": 1},
                    )
                linked_team_lead_id = linked_lead.get("assigned_team_lead_staff_id") or (linked_team or {}).get("team_lead_staff_id")
                linked_csr_id = linked_lead.get("assigned_csr_staff_id") or linked_lead.get("assigned_agent_staff_id")
                linked_csr_name = None
                linked_team_lead_name = None
                linked_supervisor_name = None
                linked_supervisor_id = (linked_team or {}).get("supervisor_staff_id")
                if linked_csr_id:
                    s = await _db.staff.find_one({"staff_id": linked_csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                    linked_csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
                if linked_team_lead_id:
                    s = await _db.staff.find_one({"staff_id": linked_team_lead_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                    linked_team_lead_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
                if linked_supervisor_id:
                    s = await _db.staff.find_one({"staff_id": linked_supervisor_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                    linked_supervisor_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
                linked = {
                    "existing_lead_id": linked_lead.get("sales_lead_id"),
                    "existing_lead_status": _norm_status(linked_lead.get("status")),
                    "existing_lead_reporting_class": _lead_reporting_class(linked_lead.get("status")),
                    "assigned_team_id": linked_lead.get("assigned_team_id"),
                    "assigned_team_name": (linked_team or {}).get("name") or None,
                    "assigned_csr_staff_id": linked_csr_id,
                    "assigned_csr_name": linked_csr_name,
                    "assigned_team_lead_staff_id": linked_team_lead_id,
                    "assigned_team_lead_name": linked_team_lead_name,
                    "current_supervisor_staff_id": linked_supervisor_id,
                    "current_supervisor_name": linked_supervisor_name,
                    "current_supervisor_role": (linked_team or {}).get("supervisor_role") or None,
                }
            raise HTTPException(
                status_code=409,
                detail={
                    "kind": "member_exists",
                    "message": "Email/phone already belongs to an existing member",
                    "member_id": member_id,
                    "location_id": existing_member.get("location_id"),
                    "location_name": (loc or {}).get("name") or None,
                    "location_owner_id": (loc or {}).get("owner_id") or None,
                    "member_name": existing_member.get("full_name") or None,
                    "member_status": existing_member.get("status") or existing_member.get("membership_status") or None,
                    "current_csr_staff_id": csr_id,
                    "current_csr_name": csr_name,
                    "current_team_lead_staff_id": tl_id,
                    "current_team_lead_name": tl_name,
                    "linked": linked,
                },
            )

        existing_lead = await _find_lead_by_email_phone(next_email_norm, next_phone_norm, location_scope={"location_id": next_location_id} if next_location_id else None)
        if existing_lead and existing_lead.get("sales_lead_id") != lead_id:
            team_lead_staff_id = existing_lead.get("assigned_team_lead_staff_id")
            if not team_lead_staff_id and existing_lead.get("assigned_team_id"):
                t = await _db.sales_teams.find_one({"sales_team_id": existing_lead.get("assigned_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
                team_lead_staff_id = (t or {}).get("team_lead_staff_id")
            csr_id = existing_lead.get("assigned_csr_staff_id") or existing_lead.get("assigned_agent_staff_id")
            csr_name = None
            tl_name = None
            if csr_id:
                s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            if team_lead_staff_id:
                s = await _db.staff.find_one({"staff_id": team_lead_staff_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            loc = await _db.locations.find_one({"location_id": existing_lead.get("location_id")}, {"_id": 0, "name": 1, "owner_id": 1})
            team_name = None
            supervisor_staff_id = None
            supervisor_role = None
            supervisor_name = None
            if existing_lead.get("assigned_team_id"):
                tm = await _db.sales_teams.find_one({"sales_team_id": existing_lead.get("assigned_team_id")}, {"_id": 0, "name": 1, "supervisor_staff_id": 1, "supervisor_role": 1})
                team_name = (tm or {}).get("name") or None
                supervisor_staff_id = (tm or {}).get("supervisor_staff_id") or None
                supervisor_role = (tm or {}).get("supervisor_role") or None
            if supervisor_staff_id:
                s = await _db.staff.find_one({"staff_id": supervisor_staff_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                supervisor_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            raise HTTPException(
                status_code=409,
                detail={
                    "kind": "lead_duplicate",
                    "message": "Duplicate lead exists for this email/phone",
                    "existing_lead_id": existing_lead.get("sales_lead_id"),
                    "existing_lead_status": _norm_status(existing_lead.get("status")),
                    "existing_lead_reporting_class": _lead_reporting_class(existing_lead.get("status")),
                    "assigned_agent_staff_id": existing_lead.get("assigned_agent_staff_id"),
                    "assigned_csr_staff_id": csr_id,
                    "assigned_csr_name": csr_name,
                    "assigned_team_id": existing_lead.get("assigned_team_id"),
                    "assigned_team_name": team_name,
                    "assigned_team_lead_staff_id": team_lead_staff_id,
                    "assigned_team_lead_name": tl_name,
                    "location_id": existing_lead.get("location_id"),
                    "location_name": (loc or {}).get("name") or None,
                    "location_owner_id": (loc or {}).get("owner_id") or None,
                    "current_supervisor_staff_id": supervisor_staff_id,
                    "current_supervisor_name": supervisor_name,
                    "current_supervisor_role": supervisor_role,
                },
            )

    updates = await _normalize_and_infer_lead_updates(base=lead, updates=updates)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["last_touch_at"] = updates["updated_at"]
    await _db.sales_leads.update_one({"sales_lead_id": lead_id}, {"$set": updates})
    await _write_lead_event(
        lead_id=lead_id,
        event_type="UPDATED",
        user=user,
        staff=staff,
        payload={"fields": list(updates.keys())},
    )
    return await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0})


@router.patch("/leads/{lead_id}/status")
async def update_lead_status(lead_id: str, data: LeadStatusUpdate, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    next_status = _norm_status(data.status)
    if next_status not in VALID_LEAD_STATUSES:
        raise HTTPException(400, f"Invalid status. Must be one of: {VALID_LEAD_STATUSES}")

    reason_comment = (data.reason_comment or data.note or "").strip()
    reason_category = (data.reason_category or "").strip().lower() or None
    if next_status in LOST_REASON_REQUIRED_STATUSES and not reason_comment:
        raise HTTPException(400, "Reason is required for this status")

    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")

    old_status = _norm_status(lead.get("status"))
    now = datetime.now(timezone.utc).isoformat()
    
    update_doc: Dict[str, Any] = {"status": next_status, "pipeline_stage": next_status, "updated_at": now, "last_touch_at": now}
    if next_status in LOST_REASON_REQUIRED_STATUSES:
        update_doc["last_closed_reason"] = {
            "status": next_status,
            "category": reason_category,
            "comment": reason_comment,
            "at": now,
            "by_user_id": user.get("user_id"),
            "by_staff_id": (staff or {}).get("staff_id"),
        }
    await _db.sales_leads.update_one(
        {"sales_lead_id": lead_id},
        {"$set": update_doc}
    )
    await _write_lead_event(
        lead_id=lead_id,
        event_type="STATUS_CHANGED",
        user=user,
        staff=staff,
        payload={
            "old_status": old_status,
            "new_status": next_status,
            "note": reason_comment if next_status in LOST_REASON_REQUIRED_STATUSES else (data.note or ""),
            "reason_category": reason_category,
            "reason_comment": reason_comment if next_status in LOST_REASON_REQUIRED_STATUSES else None,
        },
    )
    
    # Revenue Integration: Auto-create finance transaction when lead is marked WON
    if next_status == "converted" and old_status != "converted":
        fresh = await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0})
        if fresh:
            if not fresh.get("assigned_team_lead_staff_id") or not (fresh.get("assigned_csr_staff_id") or fresh.get("assigned_agent_staff_id")):
                inferred = await _normalize_and_infer_lead_updates(base=fresh, updates={
                    "assigned_team_id": fresh.get("assigned_team_id"),
                    "assigned_csr_staff_id": fresh.get("assigned_csr_staff_id"),
                    "assigned_agent_staff_id": fresh.get("assigned_agent_staff_id"),
                })
                await _db.sales_leads.update_one({"sales_lead_id": lead_id}, {"$set": {"assigned_team_lead_staff_id": inferred.get("assigned_team_lead_staff_id")}})
                fresh = await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0})
            await _create_sales_revenue_transaction(fresh or lead, user)
    
    return await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0})


@router.post("/leads/{lead_id}/activities", status_code=201)
async def add_lead_activity(lead_id: str, data: LeadActivityCreate, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")
    if data.next_action_date:
        await _db.sales_leads.update_one(
            {"sales_lead_id": lead_id},
            {"$set": {"next_follow_up_date": data.next_action_date, "updated_at": datetime.now(timezone.utc).isoformat(), "last_touch_at": datetime.now(timezone.utc).isoformat()}},
        )
    else:
        await _db.sales_leads.update_one(
            {"sales_lead_id": lead_id},
            {"$set": {"updated_at": datetime.now(timezone.utc).isoformat(), "last_touch_at": datetime.now(timezone.utc).isoformat()}},
        )
    ev = await _write_lead_event(
        lead_id=lead_id,
        event_type="ACTIVITY",
        user=user,
        staff=staff,
        payload={
            "activity_type": data.activity_type,
            "note": data.note or "",
            "next_action_date": data.next_action_date,
        },
    )
    return ev


@router.post("/leads/{lead_id}/transfer")
async def transfer_lead(lead_id: str, data: LeadTransferRequest, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Sales lead not found")
        if kind != "CSR" or not staff or not staff.get("location_id") or lead.get("location_id") != staff.get("location_id"):
            raise HTTPException(403, "Access denied")

    updates: Dict[str, Any] = {}
    if kind == "CSR":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        if data.target_location_id or data.target_team_id:
            raise HTTPException(403, "CSRs cannot transfer across branch/team")
        if data.target_agent_staff_id and data.target_agent_staff_id != staff["staff_id"]:
            raise HTTPException(403, "CSRs can only transfer to themselves")

    if kind == "TEAM_LEAD":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        target_lid = data.target_location_id or lead.get("location_id")
        await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=target_lid)
        if data.target_team_id:
            allowed_team_ids = set(await _team_ids_for_team_lead(staff["staff_id"]))
            if data.target_team_id not in allowed_team_ids:
                raise HTTPException(403, "Access denied")
        if data.target_agent_staff_id:
            csr_ids = set(await _csr_ids_reporting_to_team_lead(staff["staff_id"]))
            csr_ids.add(staff["staff_id"])
            if data.target_agent_staff_id not in csr_ids:
                raise HTTPException(403, "Access denied")

    if kind not in ("CSR", "TEAM_LEAD"):
        target_lid = data.target_location_id or lead.get("location_id") or None
        await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=target_lid)
        if data.target_team_id:
            team = await _db.sales_teams.find_one({"sales_team_id": data.target_team_id, "is_active": True}, {"_id": 0, "location_id": 1})
            if not team:
                raise HTTPException(400, "Target team not found")
            if target_lid and team.get("location_id") != target_lid:
                raise HTTPException(400, "Target team must belong to target branch")
        if data.target_agent_staff_id and target_lid:
            s = await _db.staff.find_one({"staff_id": data.target_agent_staff_id, "location_id": target_lid, "is_active": True}, {"_id": 0, "staff_id": 1})
            if not s:
                raise HTTPException(400, "Target staff not found at target branch")

    if data.target_location_id:
        updates["location_id"] = data.target_location_id
        updates["assigned_location_id"] = data.target_location_id
    if data.target_team_id is not None:
        updates["assigned_team_id"] = data.target_team_id or None
    if data.target_agent_staff_id is not None:
        updates["assigned_agent_staff_id"] = data.target_agent_staff_id or None
        updates["assigned_csr_staff_id"] = data.target_agent_staff_id or None
    if not updates:
        raise HTTPException(400, "No transfer fields provided")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["last_touch_at"] = updates["updated_at"]
    if _norm_status(lead.get("status")) != "converted":
        updates["status"] = "transferred"
        updates["pipeline_stage"] = "transferred"

    target_loc = updates.get("location_id", lead.get("location_id"))
    email_norm = lead.get("email_norm") or _norm_email(lead.get("email"))
    phone_norm = lead.get("phone_norm") or _norm_phone(lead.get("phone"))
    dup_q = {"location_id": target_loc, "sales_lead_id": {"$ne": lead_id}}
    or_terms = []
    if email_norm:
        or_terms.append({"email_norm": email_norm})
    if phone_norm:
        or_terms.append({"phone_norm": phone_norm})
    if or_terms:
        dup_q["$or"] = or_terms
        existing_in_target = await _db.sales_leads.find_one(dup_q, {"_id": 0})
        if existing_in_target:
            raise HTTPException(
                status_code=409,
                detail={
                    "kind": "lead_duplicate_in_target",
                    "message": "A matching lead already exists in the target branch",
                    "existing_lead_id": existing_in_target.get("sales_lead_id"),
                    "location_id": existing_in_target.get("location_id"),
                    "assigned_agent_staff_id": existing_in_target.get("assigned_agent_staff_id"),
                    "assigned_team_id": existing_in_target.get("assigned_team_id"),
                },
            )

    updates = await _normalize_and_infer_lead_updates(base=lead, updates=updates)
    await _db.sales_leads.update_one({"sales_lead_id": lead_id}, {"$set": updates})
    await _write_lead_event(
        lead_id=lead_id,
        event_type="TRANSFER",
        user=user,
        staff=staff,
        payload={
            "from": {
                "location_id": lead.get("location_id"),
                "assigned_team_id": lead.get("assigned_team_id"),
                "assigned_agent_staff_id": lead.get("assigned_agent_staff_id"),
            },
            "to": {
                "location_id": updates.get("location_id", lead.get("location_id")),
                "assigned_team_id": updates.get("assigned_team_id", lead.get("assigned_team_id")),
                "assigned_agent_staff_id": updates.get("assigned_agent_staff_id", lead.get("assigned_agent_staff_id")),
            },
            "note": data.note or "",
        },
    )
    return await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0})


@router.post("/leads/{lead_id}/merge")
async def merge_lead(lead_id: str, data: LeadMergeRequest, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    source_id = (data.source_lead_id or "").strip()
    if not source_id:
        raise HTTPException(400, "source_lead_id required")
    if source_id == lead_id:
        raise HTTPException(400, "Cannot merge a lead into itself")

    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    target = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not target:
        raise HTTPException(404, "Target lead not found")
    source = await _db.sales_leads.find_one({"sales_lead_id": source_id, **vis_q}, {"_id": 0})
    if not source:
        raise HTTPException(404, "Source lead not found")
    if source.get("is_merged") or source.get("merged_into_lead_id") or source.get("is_active") is False:
        raise HTTPException(400, "Source lead is already inactive/merged")

    t_member = target.get("linked_member_id")
    s_member = source.get("linked_member_id")
    if t_member and s_member and t_member != s_member:
        raise HTTPException(409, "Both leads are linked to different members")

    now = datetime.now(timezone.utc).isoformat()

    merged_fields: List[str] = []
    updates: Dict[str, Any] = {}

    def _has_value(v):
        if v is None:
            return False
        if isinstance(v, str):
            return bool(v.strip())
        if isinstance(v, list):
            return len(v) > 0
        if isinstance(v, dict):
            return len(v) > 0
        return True

    def _fill_if_empty(field: str):
        if _has_value(target.get(field)):
            return
        v = source.get(field)
        if not _has_value(v):
            return
        updates[field] = v
        merged_fields.append(field)

    for f in [
        "full_name",
        "email",
        "email_norm",
        "phone",
        "phone_number",
        "phone_norm",
        "gender",
        "address",
        "purpose",
        "program_interest",
        "membership_plan",
        "source",
        "source_platform",
        "campaign_name",
        "adset_or_adgroup",
        "source_reference",
        "source_ref",
        "next_follow_up_date",
        "last_contact_date",
        "assigned_location_id",
        "location_id",
        "assigned_team_id",
        "assigned_agent_staff_id",
        "assigned_csr_staff_id",
        "assigned_team_lead_staff_id",
        "linked_member_id",
    ]:
        _fill_if_empty(f)

    t_tags = list(target.get("tags") or [])
    s_tags = list(source.get("tags") or [])
    if s_tags:
        merged = []
        seen = set()
        for x in (t_tags + s_tags):
            v = (x or "").strip()
            if not v:
                continue
            k = v.lower()
            if k in seen:
                continue
            seen.add(k)
            merged.append(v)
        if merged != t_tags:
            updates["tags"] = merged
            merged_fields.append("tags")

    t_cs = list(target.get("contact_submission_ids") or [])
    s_cs = list(source.get("contact_submission_ids") or [])
    if s_cs:
        merged = []
        seen = set()
        for x in (t_cs + s_cs):
            if not x:
                continue
            if x in seen:
                continue
            seen.add(x)
            merged.append(x)
        if merged != t_cs:
            updates["contact_submission_ids"] = merged
            merged_fields.append("contact_submission_ids")

    s_notes = (source.get("notes") or "").strip()
    if s_notes:
        t_notes = (target.get("notes") or "").strip()
        prefix = f"[MERGED FROM {source_id}]"
        block = f"{prefix}\n{s_notes}"
        if block not in t_notes:
            updates["notes"] = (t_notes + "\n\n" + block).strip() if t_notes else block
            merged_fields.append("notes")

    merged_from = list(target.get("merged_from_lead_ids") or [])
    if source_id not in merged_from:
        merged_from.append(source_id)
        updates["merged_from_lead_ids"] = merged_from
        merged_fields.append("merged_from_lead_ids")

    if updates:
        updates["updated_at"] = now
        await _db.sales_leads.update_one({"sales_lead_id": lead_id}, {"$set": updates})

    await _db.sales_leads.update_one(
        {"sales_lead_id": source_id},
        {"$set": {"is_active": False, "is_merged": True, "merged_into_lead_id": lead_id, "merged_at": now, "merged_by_user_id": user.get("user_id"), "merged_by_staff_id": (staff or {}).get("staff_id"), "updated_at": now}},
    )

    await _db.sales_lead_events.update_many(
        {"sales_lead_id": source_id},
        {"$set": {"sales_lead_id": lead_id, "payload._origin_sales_lead_id": source_id}},
    )
    await _db.sales_lead_attachments.update_many(
        {"sales_lead_id": source_id},
        {"$set": {"sales_lead_id": lead_id}},
    )

    await _write_lead_event(
        lead_id=lead_id,
        event_type="MERGED",
        user=user,
        staff=staff,
        payload={
            "source_lead_id": source_id,
            "target_lead_id": lead_id,
            "merged_fields": merged_fields,
            "merged_at": now,
            "source_snapshot": {
                "location_id": source.get("location_id"),
                "assigned_team_id": source.get("assigned_team_id"),
                "assigned_csr_staff_id": source.get("assigned_csr_staff_id") or source.get("assigned_agent_staff_id"),
                "assigned_team_lead_staff_id": source.get("assigned_team_lead_staff_id"),
                "status": _norm_status(source.get("status")),
                "reporting_class": _lead_reporting_class(source.get("status")),
            },
        },
    )

    return {"target_lead_id": lead_id, "source_lead_id": source_id, "merged_fields": merged_fields, "merged_at": now}


@router.get("/leads/{lead_id}/attachments")
async def list_lead_attachments(lead_id: str, request: Request, limit: int = 200):
    user, staff, kind = await _require_crm_view(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")
    rows = await _db.sales_lead_attachments.find({"sales_lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"attachments": rows}


@router.post("/leads/{lead_id}/attachments", status_code=201)
async def add_lead_attachment(lead_id: str, data: LeadAttachmentCreate, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")
    if not (data.file_url or "").strip():
        raise HTTPException(400, "file_url required")
    now = datetime.now(timezone.utc).isoformat()
    aid = f"slatt_{uuid.uuid4().hex[:12]}"
    name = (data.file_name or "").strip()
    if not name:
        try:
            name = (data.file_url or "").split("/")[-1].split("?")[0]
        except Exception:
            name = ""
    doc = {
        "sales_lead_attachment_id": aid,
        "sales_lead_id": lead_id,
        "file_url": data.file_url,
        "file_name": name,
        "attachment_type": (data.attachment_type or "other").strip().lower(),
        "note": data.note or "",
        "uploaded_by_user_id": user.get("user_id"),
        "uploaded_by_staff_id": (staff or {}).get("staff_id"),
        "created_at": now,
    }
    await _db.sales_lead_attachments.insert_one(doc)
    doc.pop("_id", None)
    await _db.sales_leads.update_one({"sales_lead_id": lead_id}, {"$set": {"updated_at": now, "last_touch_at": now}})
    await _write_lead_event(
        lead_id=lead_id,
        event_type="ATTACHMENT_ADDED",
        user=user,
        staff=staff,
        payload={
            "sales_lead_attachment_id": aid,
            "file_url": doc["file_url"],
            "file_name": doc["file_name"],
            "attachment_type": doc["attachment_type"],
            "note": doc.get("note") or "",
        },
    )
    return doc


@router.get("/sla-settings")
async def get_sla_settings(request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_view(request)
    owner_id = await _owner_id_for_sla(user, staff, kind, location_id=location_id)
    settings = await _get_sla_settings(owner_id)
    return {"owner_id": owner_id, "settings": settings}


@router.patch("/sla-settings")
async def update_sla_settings(data: SLASettingsUpdate, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    owner_id = await _owner_id_for_sla(user, staff, kind, location_id=location_id)
    if not owner_id:
        raise HTTPException(400, "Owner context not found")
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "owner_id": owner_id,
        "csr_reminder_delay_days": max(0, int(data.csr_reminder_delay_days or 0)),
        "team_lead_escalation_delay_days": max(0, int(data.team_lead_escalation_delay_days or 0)),
        "manager_escalation_delay_days": max(0, int(data.manager_escalation_delay_days or 0)),
        "updated_at": now,
        "updated_by_user_id": user.get("user_id"),
    }
    await _db.sales_sla_settings.update_one({"owner_id": owner_id}, {"$set": payload}, upsert=True)
    return {"owner_id": owner_id, "settings": await _get_sla_settings(owner_id)}


def _sanitize_maqsam_base_url(value: str) -> str:
    v = (value or "").strip()
    v = re.sub(r"^https?://", "", v, flags=re.IGNORECASE)
    v = v.strip().strip("/")
    if v.lower().startswith("api."):
        v = v[4:]
    return v


def _sanitize_maqsam_contacts_custom_fields_format(value: Optional[str]) -> str:
    v = (value or "").strip().lower()
    if v in ("labels", "label"):
        return "labels"
    if v in ("uuid", "uuids", "keys", "key"):
        return "uuid"
    return "labels"


def _sanitize_maqsam_contacts_lang(value: Optional[str]) -> str:
    v = (value or "").strip().lower()
    if v in ("ar", "en"):
        return v
    return "en"


MAQSAM_CONTACT_FIELD_TARGETS = {
    "email",
    "gender",
    "address",
    "program_interest",
    "membership_plan",
    "notes",
    "source_reference",
}


def _sanitize_maqsam_contact_field_mappings(value: Optional[Dict[str, str]]) -> Dict[str, str]:
    if not isinstance(value, dict):
        return {}
    out: Dict[str, str] = {}
    for k, v in value.items():
        src = str(k or "").strip()
        tgt = str(v or "").strip()
        if not src or not tgt:
            continue
        if tgt not in MAQSAM_CONTACT_FIELD_TARGETS:
            continue
        out[src] = tgt
    return out


async def _get_maqsam_settings_doc(location_id: Optional[str]) -> dict:
    lid = (location_id or "").strip() or None
    q = {"setting_id": "maqsam", "location_id": lid}
    doc = await _db.sales_provider_settings.find_one(q, {"_id": 0})
    if not doc:
        doc = {
            "setting_id": "maqsam",
            "location_id": lid,
            "is_enabled": False,
            "base_url": "",
            "access_key_id": "",
            "access_secret": "",
            "last_sync_at": None,
            "last_sync_status": None,
            "last_sync_error": None,
            "last_sync_count": 0,
            "contacts_enabled": False,
            "contacts_lang": "en",
            "contacts_custom_fields_format": "labels",
            "contacts_include_pagination": False,
            "contacts_last_sync_at": None,
            "contacts_last_sync_status": None,
            "contacts_last_sync_error": None,
            "contacts_last_sync_count": 0,
            "contacts_field_mappings": {},
        }
    return doc


def _maqsam_public_settings(doc: dict) -> dict:
    secret = (doc or {}).get("access_secret") or ""
    out = dict(doc or {})
    out["access_secret"] = MAQSAM_SECRET_MASK if secret else ""
    out["has_secret"] = bool(secret)
    return out


async def _fetch_maqsam_agents(*, base_url: str, access_key_id: str, access_secret: str) -> List[dict]:
    base = _sanitize_maqsam_base_url(base_url)
    if not base:
        raise HTTPException(400, "Maqsam base_url is required")
    if not (access_key_id or "").strip():
        raise HTTPException(400, "Maqsam access_key_id is required")
    if not (access_secret or "").strip():
        raise HTTPException(400, "Maqsam access_secret is required")

    api_base = f"https://api.{base}/v1/agents"
    auth = (access_key_id, access_secret)

    out: List[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        page = 1
        while page <= 1000:
            url = api_base if page == 1 else f"{api_base}/page/{page}"
            try:
                r = await client.get(url, auth=auth)
            except httpx.RequestError as e:
                raise HTTPException(502, f"Maqsam request failed: {str(e)}")
            if r.status_code == 401:
                raise HTTPException(401, "Maqsam Unauthorized (check access key/secret)")
            if r.status_code >= 500:
                raise HTTPException(502, f"Maqsam error ({r.status_code})")
            if r.status_code != 200:
                raise HTTPException(502, f"Maqsam unexpected status ({r.status_code})")

            try:
                data = r.json()
            except Exception:
                raise HTTPException(502, "Maqsam returned invalid JSON")

            if (data or {}).get("result") != "success":
                raise HTTPException(502, "Maqsam returned non-success result")
            msg = (data or {}).get("message")
            if not isinstance(msg, list):
                raise HTTPException(502, "Maqsam response message is not an array")

            out.extend(msg)
            if len(msg) < 100:
                break
            page += 1
    return out


@router.get("/maqsam/settings")
async def get_maqsam_settings(request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_view(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    doc = await _get_maqsam_settings_doc(location_id)
    return {"settings": _maqsam_public_settings(doc)}


@router.patch("/maqsam/settings")
async def update_maqsam_settings(data: MaqsamSettingsUpdate, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    now = datetime.now(timezone.utc).isoformat()

    existing = await _get_maqsam_settings_doc(location_id)
    incoming_secret = (data.access_secret or "").strip()
    if incoming_secret == MAQSAM_SECRET_MASK:
        incoming_secret = (existing.get("access_secret") or "").strip()

    payload = dict(existing or {})
    payload.update({
        "setting_id": "maqsam",
        "location_id": lid,
        "is_enabled": bool(data.is_enabled),
        "base_url": _sanitize_maqsam_base_url(data.base_url),
        "access_key_id": (data.access_key_id or "").strip(),
        "access_secret": incoming_secret,
        "updated_at": now,
        "updated_by_user_id": user.get("user_id"),
    })
    if data.contacts_enabled is not None:
        payload["contacts_enabled"] = bool(data.contacts_enabled)
    if data.contacts_lang is not None:
        payload["contacts_lang"] = _sanitize_maqsam_contacts_lang(data.contacts_lang)
    if data.contacts_custom_fields_format is not None:
        payload["contacts_custom_fields_format"] = _sanitize_maqsam_contacts_custom_fields_format(data.contacts_custom_fields_format)
    if data.contacts_include_pagination is not None:
        payload["contacts_include_pagination"] = bool(data.contacts_include_pagination)
    if data.contacts_field_mappings is not None:
        payload["contacts_field_mappings"] = _sanitize_maqsam_contact_field_mappings(data.contacts_field_mappings)
    await _db.sales_provider_settings.update_one({"setting_id": "maqsam", "location_id": lid}, {"$set": payload}, upsert=True)
    doc = await _get_maqsam_settings_doc(location_id)
    return {"settings": _maqsam_public_settings(doc)}


@router.post("/maqsam/sync")
async def sync_maqsam_agents(request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None

    now = datetime.now(timezone.utc).isoformat()
    doc = await _get_maqsam_settings_doc(location_id)
    if not doc.get("is_enabled"):
        raise HTTPException(400, "Maqsam integration is disabled")

    try:
        agents = await _fetch_maqsam_agents(
            base_url=doc.get("base_url") or "",
            access_key_id=doc.get("access_key_id") or "",
            access_secret=doc.get("access_secret") or "",
        )
        upserts = 0
        for a in agents:
            identifier = str((a or {}).get("identifier") or "").strip()
            if not identifier:
                continue
            provider_fields = {
                "provider": "maqsam",
                "location_id": lid,
                "identifier": identifier,
                "name": (a or {}).get("name"),
                "email": (a or {}).get("email"),
                "active": (a or {}).get("active"),
                "groups": (a or {}).get("groups"),
                "outgoingEnabled": (a or {}).get("outgoingEnabled"),
                "incomingEnabled": (a or {}).get("incomingEnabled"),
                "whatsappEnabled": (a or {}).get("whatsappEnabled"),
                "state": (a or {}).get("state"),
                "awayReason": (a or {}).get("awayReason"),
                "createdAt": (a or {}).get("createdAt"),
                "synced_at": now,
            }
            res = await _db.sales_provider_agents.update_one(
                {"provider": "maqsam", "location_id": lid, "identifier": identifier},
                {"$set": provider_fields, "$setOnInsert": {"created_at": now, "mapping_enabled": False}},
                upsert=True,
            )
            if res.upserted_id is not None or res.modified_count:
                upserts += 1

        await _db.sales_provider_settings.update_one(
            {"setting_id": "maqsam", "location_id": lid},
            {"$set": {"last_sync_at": now, "last_sync_status": "success", "last_sync_error": "", "last_sync_count": len(agents)}},
            upsert=True,
        )
        return {"result": "success", "synced_count": len(agents), "updated_count": upserts, "last_sync_at": now}
    except HTTPException as he:
        await _db.sales_provider_settings.update_one(
            {"setting_id": "maqsam", "location_id": lid},
            {"$set": {"last_sync_at": now, "last_sync_status": "error", "last_sync_error": str(he.detail), "last_sync_count": 0}},
            upsert=True,
        )
        raise


@router.get("/maqsam/agents")
async def list_maqsam_agents(request: Request, location_id: Optional[str] = None, limit: int = 200):
    user, staff, kind = await _require_crm_view(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    rows = await _db.sales_provider_agents.find({"provider": "maqsam", "location_id": lid}, {"_id": 0}).sort("name", 1).limit(max(1, min(1000, limit))).to_list(max(1, min(1000, limit)))
    mapped = 0
    for r in rows:
        if r.get("mapping_enabled") and r.get("mapped_staff_id"):
            mapped += 1
    return {"agents": rows, "counts": {"total": len(rows), "mapped": mapped, "unmapped": len(rows) - mapped}}


@router.patch("/maqsam/agents/{identifier}/mapping")
async def update_maqsam_agent_mapping(identifier: str, data: MaqsamAgentMappingUpdate, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    now = datetime.now(timezone.utc).isoformat()

    patch: Dict[str, Any] = {
        "mapping_enabled": bool(data.mapping_enabled),
        "mapped_staff_id": (data.mapped_staff_id or "").strip() or None,
        "mapped_role": (data.mapped_role or "").strip().upper() or None,
        "mapped_location_id": (data.mapped_location_id or "").strip() or None,
        "mapped_team_lead_staff_id": (data.mapped_team_lead_staff_id or "").strip() or None,
        "mapping_updated_at": now,
        "mapping_updated_by_user_id": user.get("user_id"),
    }
    await _db.sales_provider_agents.update_one(
        {"provider": "maqsam", "location_id": lid, "identifier": identifier},
        {"$set": patch, "$setOnInsert": {"provider": "maqsam", "location_id": lid, "identifier": identifier, "created_at": now}},
        upsert=True,
    )
    row = await _db.sales_provider_agents.find_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"_id": 0})
    return {"agent": row}


def _maqsam_contacts_api_base_url(base_url: str) -> str:
    base = _sanitize_maqsam_base_url(base_url)
    if not base:
        raise HTTPException(400, "Maqsam base_url is required")
    return f"https://api.{base}/v2/contacts"


def _maqsam_error_message(data: Any) -> str:
    if isinstance(data, dict):
        for k in ("message", "error", "detail"):
            v = data.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return ""
    return ""


def _maqsam_extract_contacts_message(data: dict) -> List[dict]:
    if not isinstance(data, dict):
        return []
    if (data or {}).get("result") != "success":
        raise HTTPException(502, "Maqsam returned non-success result")
    msg = (data or {}).get("message")
    if isinstance(msg, list):
        return msg
    if isinstance(msg, dict):
        for key in ("data", "contacts", "results", "items"):
            v = msg.get(key)
            if isinstance(v, list):
                return v
    raise HTTPException(502, "Maqsam response message is not an array")


def _maqsam_extract_contact_message(data: dict) -> dict:
    if not isinstance(data, dict):
        raise HTTPException(502, "Maqsam returned invalid JSON")
    if (data or {}).get("result") != "success":
        raise HTTPException(502, "Maqsam returned non-success result")
    msg = (data or {}).get("message")
    if isinstance(msg, dict):
        return msg
    if isinstance(msg, list) and msg and isinstance(msg[0], dict):
        return msg[0]
    raise HTTPException(502, "Maqsam response message is not an object")


async def _maqsam_contact_lead_summary(lead_id: str) -> Optional[dict]:
    if not lead_id:
        return None
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id}, {"_id": 0, "sales_lead_id": 1, "full_name": 1, "location_id": 1, "status": 1, "assigned_team_id": 1, "assigned_agent_staff_id": 1, "assigned_csr_staff_id": 1, "assigned_team_lead_staff_id": 1})
    if not lead:
        return None
    loc = await _db.locations.find_one({"location_id": lead.get("location_id")}, {"_id": 0, "name": 1})
    csr_id = lead.get("assigned_csr_staff_id") or lead.get("assigned_agent_staff_id")
    csr_name = None
    if csr_id:
        s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
        csr_name = f"{(s or {}).get('first_name','')} {(s or {}).get('last_name','')}".strip() if s else None
    tl_id = lead.get("assigned_team_lead_staff_id")
    if not tl_id and lead.get("assigned_team_id"):
        tm = await _db.sales_teams.find_one({"sales_team_id": lead.get("assigned_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
        tl_id = (tm or {}).get("team_lead_staff_id")
    tl_name = None
    if tl_id:
        s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
        tl_name = f"{(s or {}).get('first_name','')} {(s or {}).get('last_name','')}".strip() if s else None
    return {
        "sales_lead_id": lead.get("sales_lead_id"),
        "full_name": lead.get("full_name"),
        "status": _norm_status(lead.get("status")),
        "reporting_class": _lead_reporting_class(lead.get("status")),
        "location_id": lead.get("location_id"),
        "location_name": (loc or {}).get("name") or None,
        "csr_staff_id": csr_id,
        "csr_name": csr_name,
        "team_lead_staff_id": tl_id,
        "team_lead_name": tl_name,
    }


async def _maqsam_contact_member_summary(member_id: str) -> Optional[dict]:
    if not member_id:
        return None
    m = await _db.members.find_one({"member_id": member_id}, {"_id": 0, "member_id": 1, "full_name": 1, "location_id": 1, "status": 1, "membership_status": 1, "sales_attribution": 1})
    if not m:
        return None
    loc = await _db.locations.find_one({"location_id": m.get("location_id")}, {"_id": 0, "name": 1})
    sales_attr = m.get("sales_attribution") or {}
    csr_id = sales_attr.get("csr_staff_id")
    tl_id = sales_attr.get("team_lead_staff_id")
    csr_name = None
    tl_name = None
    if csr_id:
        s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
        csr_name = f"{(s or {}).get('first_name','')} {(s or {}).get('last_name','')}".strip() if s else None
    if tl_id:
        s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
        tl_name = f"{(s or {}).get('first_name','')} {(s or {}).get('last_name','')}".strip() if s else None
    return {
        "member_id": m.get("member_id"),
        "full_name": m.get("full_name"),
        "member_status": m.get("status") or m.get("membership_status"),
        "location_id": m.get("location_id"),
        "location_name": (loc or {}).get("name") or None,
        "csr_staff_id": csr_id,
        "csr_name": csr_name,
        "team_lead_staff_id": tl_id,
        "team_lead_name": tl_name,
    }


def _maqsam_contact_doc_from_payload(*, contact: dict, lid: Optional[str], now: str) -> dict:
    identifier = str((contact or {}).get("identifier") or "").strip()
    name = (contact or {}).get("name")
    phone = (contact or {}).get("phone")
    phone_norm = _norm_phone(phone)
    cf = (contact or {}).get("custom_fields") if isinstance((contact or {}).get("custom_fields"), dict) else {}
    email = ""
    for k, v in (cf or {}).items():
        if str(k or "").strip().lower() in ("email", "e-mail"):
            email = str(v or "").strip()
            break
    email_norm = _norm_email(email) if email else ""
    return {
        "provider": "maqsam",
        "source_platform": "MAQSAM",
        "location_id": lid,
        "identifier": identifier,
        "name": name,
        "phone": phone,
        "phone_norm": phone_norm,
        "email": email,
        "email_norm": email_norm,
        "high_priority": bool((contact or {}).get("high_priority") or False),
        "custom_fields": cf,
        "synced_at": now,
        "sync_status": "success",
        "sync_error": "",
        "raw_payload": contact,
    }


def _match_status_from_counts(*, lead_count: int, member_count: int) -> str:
    total = int(lead_count or 0) + int(member_count or 0)
    if total <= 0:
        return "unmatched"
    if total == 1:
        return "matched_member" if int(member_count or 0) == 1 else "matched_lead"
    return "conflict"


async def _maqsam_contacts_match_index(phone_norms: List[str], email_norms: List[str]) -> dict:
    pnorms = [p for p in (phone_norms or []) if p]
    enorms = [e for e in (email_norms or []) if e]
    if not pnorms and not enorms:
        return {"phone": {"leads": {}, "members": {}}, "email": {"leads": {}, "members": {}}}

    active_filter = {"is_merged": {"$ne": True}, "$or": [{"is_active": True}, {"is_active": {"$exists": False}}]}

    phone_leads: Dict[str, Any] = {}
    phone_members: Dict[str, Any] = {}
    email_leads: Dict[str, Any] = {}
    email_members: Dict[str, Any] = {}

    if pnorms:
        lead_rows = await _db.sales_leads.aggregate([
            {"$match": {"phone_norm": {"$in": pnorms}, **active_filter}},
            {"$group": {"_id": "$phone_norm", "count": {"$sum": 1}, "lead_id": {"$first": "$sales_lead_id"}}},
        ]).to_list(len(pnorms))
        member_rows = await _db.members.aggregate([
            {"$match": {"phone_norm": {"$in": pnorms}}},
            {"$group": {"_id": "$phone_norm", "count": {"$sum": 1}, "member_id": {"$first": "$member_id"}}},
        ]).to_list(len(pnorms))
        phone_leads = {r.get("_id"): {"count": int(r.get("count") or 0), "lead_id": r.get("lead_id")} for r in lead_rows if r.get("_id")}
        phone_members = {r.get("_id"): {"count": int(r.get("count") or 0), "member_id": r.get("member_id")} for r in member_rows if r.get("_id")}

    if enorms:
        lead_rows = await _db.sales_leads.aggregate([
            {"$match": {"email_norm": {"$in": enorms}, **active_filter}},
            {"$group": {"_id": "$email_norm", "count": {"$sum": 1}, "lead_id": {"$first": "$sales_lead_id"}}},
        ]).to_list(len(enorms))
        member_rows = await _db.members.aggregate([
            {"$match": {"email_norm": {"$in": enorms}}},
            {"$group": {"_id": "$email_norm", "count": {"$sum": 1}, "member_id": {"$first": "$member_id"}}},
        ]).to_list(len(enorms))
        email_leads = {r.get("_id"): {"count": int(r.get("count") or 0), "lead_id": r.get("lead_id")} for r in lead_rows if r.get("_id")}
        email_members = {r.get("_id"): {"count": int(r.get("count") or 0), "member_id": r.get("member_id")} for r in member_rows if r.get("_id")}

    return {"phone": {"leads": phone_leads, "members": phone_members}, "email": {"leads": email_leads, "members": email_members}}


async def _fetch_maqsam_contacts(
    *,
    base_url: str,
    access_key_id: str,
    access_secret: str,
    lang: str,
    custom_fields_format: str,
    include_pagination: bool,
) -> List[dict]:
    if not (access_key_id or "").strip():
        raise HTTPException(400, "Maqsam access_key_id is required")
    if not (access_secret or "").strip():
        raise HTTPException(400, "Maqsam access_secret is required")

    api_base = _maqsam_contacts_api_base_url(base_url)
    auth = (access_key_id, access_secret)
    params_common: Dict[str, Any] = {}
    if lang:
        params_common["lang"] = lang
    if custom_fields_format:
        params_common["custom_fields_format"] = custom_fields_format
    if include_pagination:
        params_common["include_pagination"] = "true"

    out: List[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        page = 1
        while page <= 1000:
            url = api_base if page == 1 else f"{api_base}/page/{page}"
            try:
                r = await client.get(url, auth=auth, params=params_common)
            except httpx.RequestError as e:
                raise HTTPException(502, f"Maqsam request failed: {str(e)}")
            if r.status_code == 401:
                raise HTTPException(401, "Maqsam Unauthorized (check access key/secret)")
            if r.status_code in (400, 404):
                try:
                    data = r.json()
                except Exception:
                    data = {}
                msg = _maqsam_error_message(data) or f"Maqsam error ({r.status_code})"
                raise HTTPException(r.status_code, msg)
            if r.status_code >= 500:
                raise HTTPException(502, f"Maqsam error ({r.status_code})")
            if r.status_code != 200:
                raise HTTPException(502, f"Maqsam unexpected status ({r.status_code})")

            try:
                data = r.json()
            except Exception:
                raise HTTPException(502, "Maqsam returned invalid JSON")
            contacts = _maqsam_extract_contacts_message(data)
            out.extend(contacts)
            if len(contacts) < 100:
                break
            page += 1
    return out


@router.post("/maqsam/contacts/sync")
async def sync_maqsam_contacts(request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    now = datetime.now(timezone.utc).isoformat()

    settings = await _get_maqsam_settings_doc(location_id)
    if not settings.get("is_enabled"):
        raise HTTPException(400, "Maqsam integration is disabled")
    if not settings.get("contacts_enabled"):
        raise HTTPException(400, "Maqsam Contacts integration is disabled")

    lang = _sanitize_maqsam_contacts_lang(settings.get("contacts_lang"))
    fmt = _sanitize_maqsam_contacts_custom_fields_format(settings.get("contacts_custom_fields_format"))
    include_pagination = bool(settings.get("contacts_include_pagination") or False)

    try:
        contacts = await _fetch_maqsam_contacts(
            base_url=settings.get("base_url") or "",
            access_key_id=settings.get("access_key_id") or "",
            access_secret=settings.get("access_secret") or "",
            lang=lang,
            custom_fields_format=fmt,
            include_pagination=include_pagination,
        )
        upserts = 0
        phone_norms: List[str] = []
        email_norms: List[str] = []
        for c in contacts:
            identifier = str((c or {}).get("identifier") or "").strip()
            if not identifier:
                continue
            doc = _maqsam_contact_doc_from_payload(contact=c, lid=lid, now=now)
            if doc.get("phone_norm"):
                phone_norms.append(doc["phone_norm"])
            if doc.get("email_norm"):
                email_norms.append(doc["email_norm"])
            res = await _db.sales_provider_contacts.update_one(
                {"provider": "maqsam", "location_id": lid, "identifier": identifier},
                {"$set": doc, "$setOnInsert": {"created_at": now, "linked_lead_id": None, "linked_member_id": None, "link_status": None}},
                upsert=True,
            )
            if res.upserted_id is not None or res.modified_count:
                upserts += 1

        idx = await _maqsam_contacts_match_index(list({p for p in phone_norms if p}), list({e for e in email_norms if e}))
        phone_leads = (idx.get("phone") or {}).get("leads") or {}
        phone_members = (idx.get("phone") or {}).get("members") or {}
        email_leads = (idx.get("email") or {}).get("leads") or {}
        email_members = (idx.get("email") or {}).get("members") or {}

        matched = 0
        unmatched = 0
        conflict = 0

        for c in contacts:
            identifier = str((c or {}).get("identifier") or "").strip()
            if not identifier:
                continue
            pn = _norm_phone((c or {}).get("phone"))
            en = ""
            cf = (c or {}).get("custom_fields") if isinstance((c or {}).get("custom_fields"), dict) else {}
            for k, v in (cf or {}).items():
                if str(k or "").strip().lower() in ("email", "e-mail"):
                    en = _norm_email(str(v or "").strip())
                    break

            match_key = "phone" if pn else ("email" if en else "")
            if pn:
                lc = int((phone_leads.get(pn) or {}).get("count") or 0)
                mc = int((phone_members.get(pn) or {}).get("count") or 0)
                lead_id = (phone_leads.get(pn) or {}).get("lead_id")
                member_id = (phone_members.get(pn) or {}).get("member_id")
            elif en:
                lc = int((email_leads.get(en) or {}).get("count") or 0)
                mc = int((email_members.get(en) or {}).get("count") or 0)
                lead_id = (email_leads.get(en) or {}).get("lead_id")
                member_id = (email_members.get(en) or {}).get("member_id")
            else:
                lc = 0
                mc = 0
                lead_id = None
                member_id = None
            computed = _match_status_from_counts(lead_count=lc, member_count=mc)
            if computed == "unmatched":
                unmatched += 1
            elif computed == "conflict":
                conflict += 1
            else:
                matched += 1
            await _db.sales_provider_contacts.update_one(
                {"provider": "maqsam", "location_id": lid, "identifier": identifier},
                {"$set": {
                    "computed_match_status": computed,
                    "computed_match_key": match_key or None,
                    "computed_lead_count": lc,
                    "computed_member_count": mc,
                    "computed_matched_lead_id": lead_id if computed == "matched_lead" else None,
                    "computed_matched_member_id": member_id if computed == "matched_member" else None,
                    "match_updated_at": now,
                }},
            )

        await _db.sales_provider_settings.update_one(
            {"setting_id": "maqsam", "location_id": lid},
            {"$set": {"contacts_last_sync_at": now, "contacts_last_sync_status": "success", "contacts_last_sync_error": "", "contacts_last_sync_count": len(contacts), "contacts_last_sync_matched": matched, "contacts_last_sync_unmatched": unmatched, "contacts_last_sync_conflict": conflict}},
            upsert=True,
        )
        return {"result": "success", "synced_count": len(contacts), "updated_count": upserts, "last_sync_at": now, "counts": {"matched": matched, "unmatched": unmatched, "conflict": conflict}}
    except HTTPException as he:
        await _db.sales_provider_settings.update_one(
            {"setting_id": "maqsam", "location_id": lid},
            {"$set": {"contacts_last_sync_at": now, "contacts_last_sync_status": "error", "contacts_last_sync_error": str(he.detail), "contacts_last_sync_count": 0}},
            upsert=True,
        )
        raise


@router.get("/maqsam/contacts")
async def list_maqsam_contacts(request: Request, location_id: Optional[str] = None, limit: int = 200, skip: int = 0):
    user, staff, kind = await _require_crm_view(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None

    q = {"provider": "maqsam", "location_id": lid}
    total = await _db.sales_provider_contacts.count_documents(q)
    rows = await _db.sales_provider_contacts.find(q, {"_id": 0}).sort("synced_at", -1).skip(max(0, int(skip or 0))).limit(max(1, min(1000, int(limit or 200)))).to_list(max(1, min(1000, int(limit or 200))))

    active_filter = {"is_merged": {"$ne": True}, "$or": [{"is_active": True}, {"is_active": {"$exists": False}}]}
    linked = 0
    unmatched = 0
    conflict = 0
    matched = 0
    out_rows = []
    for r in rows:
        match_status = "unmatched"
        matched_lead = None
        matched_member = None
        conflict_items = None

        if r.get("linked_lead_id"):
            match_status = "linked_lead"
            matched_lead = await _maqsam_contact_lead_summary(r.get("linked_lead_id"))
            linked += 1
            matched += 1
        elif r.get("linked_member_id"):
            match_status = "linked_member"
            matched_member = await _maqsam_contact_member_summary(r.get("linked_member_id"))
            linked += 1
            matched += 1
        else:
            st = r.get("computed_match_status") or "unmatched"
            match_status = st
            if st == "matched_lead":
                matched_lead = await _maqsam_contact_lead_summary(r.get("computed_matched_lead_id") or "")
                matched += 1
            elif st == "matched_member":
                matched_member = await _maqsam_contact_member_summary(r.get("computed_matched_member_id") or "")
                matched += 1
            elif st == "conflict":
                conflict += 1
                key = (r.get("computed_match_key") or "").strip().lower()
                if key == "email" and (r.get("email_norm") or "").strip():
                    en = (r.get("email_norm") or "").strip()
                    lead_matches = await _db.sales_leads.find({"email_norm": en, **active_filter}, {"_id": 0, "sales_lead_id": 1, "full_name": 1, "location_id": 1, "status": 1}).limit(5).to_list(5)
                    member_matches = await _db.members.find({"email_norm": en}, {"_id": 0, "member_id": 1, "full_name": 1, "location_id": 1, "status": 1, "membership_status": 1}).limit(5).to_list(5)
                else:
                    pn = r.get("phone_norm") or ""
                    lead_matches = await _db.sales_leads.find({"phone_norm": pn, **active_filter}, {"_id": 0, "sales_lead_id": 1, "full_name": 1, "location_id": 1, "status": 1}).limit(5).to_list(5)
                    member_matches = await _db.members.find({"phone_norm": pn}, {"_id": 0, "member_id": 1, "full_name": 1, "location_id": 1, "status": 1, "membership_status": 1}).limit(5).to_list(5)
                conflict_items = {
                    "leads": [
                        {"sales_lead_id": l.get("sales_lead_id"), "full_name": l.get("full_name"), "location_id": l.get("location_id"), "status": _norm_status(l.get("status"))}
                        for l in lead_matches
                    ],
                    "members": [
                        {"member_id": m.get("member_id"), "full_name": m.get("full_name"), "location_id": m.get("location_id"), "member_status": m.get("status") or m.get("membership_status")}
                        for m in member_matches
                    ],
                }
            else:
                unmatched += 1

        out = dict(r)
        out["match_status"] = match_status
        out["matched_lead"] = matched_lead
        out["matched_member"] = matched_member
        out["conflicts"] = conflict_items
        out_rows.append(out)

    return {
        "total": total,
        "contacts": out_rows,
        "counts": {
            "total": total,
            "matched": matched,
            "unmatched": unmatched,
            "conflict": conflict,
            "linked": linked,
        },
    }


@router.get("/maqsam/contacts/search")
async def search_maqsam_contacts(
    request: Request,
    location_id: Optional[str] = None,
    q: Optional[str] = None,
    name: Optional[str] = None,
    phone: Optional[str] = None,
    high_priority: Optional[bool] = None,
    page: Optional[int] = None,
    include_pagination: Optional[bool] = None,
    lang: Optional[str] = None,
    custom_fields_format: Optional[str] = None,
):
    user, staff, kind = await _require_crm_view(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    settings = await _get_maqsam_settings_doc(location_id)
    if not settings.get("is_enabled") or not settings.get("contacts_enabled"):
        raise HTTPException(400, "Maqsam Contacts integration is disabled")

    api_base = _maqsam_contacts_api_base_url(settings.get("base_url") or "")
    auth = (settings.get("access_key_id") or "", settings.get("access_secret") or "")
    params: Dict[str, Any] = {}
    if q:
        params["q"] = q
    if name:
        params["name"] = name
    if phone:
        params["phone"] = phone
    if high_priority is not None:
        params["high_priority"] = "true" if high_priority else "false"
    if page is not None:
        params["page"] = int(page)
    if include_pagination is not None:
        params["include_pagination"] = "true" if include_pagination else "false"
    else:
        if settings.get("contacts_include_pagination"):
            params["include_pagination"] = "true"
    params["lang"] = _sanitize_maqsam_contacts_lang(lang if lang is not None else settings.get("contacts_lang"))
    params["custom_fields_format"] = _sanitize_maqsam_contacts_custom_fields_format(custom_fields_format if custom_fields_format is not None else settings.get("contacts_custom_fields_format"))

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(f"{api_base}/search", auth=auth, params=params)
        except httpx.RequestError as e:
            raise HTTPException(502, f"Maqsam request failed: {str(e)}")
        if r.status_code == 401:
            raise HTTPException(401, "Maqsam Unauthorized (check access key/secret)")
        if r.status_code in (400, 404):
            try:
                data = r.json()
            except Exception:
                data = {}
            msg = _maqsam_error_message(data) or f"Maqsam error ({r.status_code})"
            raise HTTPException(r.status_code, msg)
        if r.status_code >= 500:
            raise HTTPException(502, f"Maqsam error ({r.status_code})")
        if r.status_code != 200:
            raise HTTPException(502, f"Maqsam unexpected status ({r.status_code})")
        try:
            data = r.json()
        except Exception:
            raise HTTPException(502, "Maqsam returned invalid JSON")
        contacts = _maqsam_extract_contacts_message(data)
        now = datetime.now(timezone.utc).isoformat()
        upserts = 0
        for c in contacts:
            identifier = str((c or {}).get("identifier") or "").strip()
            if not identifier:
                continue
            doc = _maqsam_contact_doc_from_payload(contact=c, lid=lid, now=now)
            res = await _db.sales_provider_contacts.update_one(
                {"provider": "maqsam", "location_id": lid, "identifier": identifier},
                {"$set": doc, "$setOnInsert": {"created_at": now, "linked_lead_id": None, "linked_member_id": None, "link_status": None}},
                upsert=True,
            )
            if res.upserted_id is not None or res.modified_count:
                upserts += 1
        return {"result": "success", "contacts": contacts, "stored_or_updated": upserts}


@router.get("/maqsam/contacts/{identifier}")
async def get_maqsam_contact(identifier: str, request: Request, location_id: Optional[str] = None, refresh: bool = False):
    user, staff, kind = await _require_crm_view(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None

    row = await _db.sales_provider_contacts.find_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"_id": 0})
    if not row:
        raise HTTPException(404, "Maqsam contact not found")
    if not refresh:
        return {"contact": row}

    settings = await _get_maqsam_settings_doc(location_id)
    if not settings.get("is_enabled") or not settings.get("contacts_enabled"):
        return {"contact": row}

    lang = _sanitize_maqsam_contacts_lang(settings.get("contacts_lang"))
    fmt = _sanitize_maqsam_contacts_custom_fields_format(settings.get("contacts_custom_fields_format"))
    include_pagination = bool(settings.get("contacts_include_pagination") or False)

    api_base = _maqsam_contacts_api_base_url(settings.get("base_url") or "")
    auth = (settings.get("access_key_id") or "", settings.get("access_secret") or "")
    params_common: Dict[str, Any] = {}
    if lang:
        params_common["lang"] = lang
    if fmt:
        params_common["custom_fields_format"] = fmt
    if include_pagination:
        params_common["include_pagination"] = "true"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.get(f"{api_base}/{identifier}", auth=auth, params=params_common)
        except httpx.RequestError as e:
            raise HTTPException(502, f"Maqsam request failed: {str(e)}")
        if r.status_code == 401:
            raise HTTPException(401, "Maqsam Unauthorized (check access key/secret)")
        if r.status_code == 404:
            raise HTTPException(404, "Maqsam contact not found in provider")
        if r.status_code in (400,):
            try:
                data = r.json()
            except Exception:
                data = {}
            msg = _maqsam_error_message(data) or "Maqsam Bad Request"
            raise HTTPException(400, msg)
        if r.status_code >= 500:
            raise HTTPException(502, f"Maqsam error ({r.status_code})")
        if r.status_code != 200:
            raise HTTPException(502, f"Maqsam unexpected status ({r.status_code})")
        try:
            data = r.json()
        except Exception:
            raise HTTPException(502, "Maqsam returned invalid JSON")
        contact = _maqsam_extract_contact_message(data)
        now = datetime.now(timezone.utc).isoformat()
        doc = _maqsam_contact_doc_from_payload(contact=contact, lid=lid, now=now)
        await _db.sales_provider_contacts.update_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"$set": doc})
        updated = await _db.sales_provider_contacts.find_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"_id": 0})
        return {"contact": updated}


@router.post("/maqsam/contacts", status_code=201)
async def create_maqsam_contact(data: MaqsamContactUpsert, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    settings = await _get_maqsam_settings_doc(location_id)
    if not settings.get("is_enabled") or not settings.get("contacts_enabled"):
        raise HTTPException(400, "Maqsam Contacts integration is disabled")

    api_base = _maqsam_contacts_api_base_url(settings.get("base_url") or "")
    auth = (settings.get("access_key_id") or "", settings.get("access_secret") or "")
    payload: Dict[str, Any] = {}
    if (data.name or "").strip():
        payload["name"] = (data.name or "").strip()
    if (data.phone or "").strip():
        payload["phone"] = (data.phone or "").strip()
    payload["high_priority"] = bool(data.high_priority)
    if isinstance(data.custom_fields, dict):
        payload["custom_fields"] = data.custom_fields

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.post(api_base, auth=auth, json=payload)
        except httpx.RequestError as e:
            raise HTTPException(502, f"Maqsam request failed: {str(e)}")
        if r.status_code == 401:
            raise HTTPException(401, "Maqsam Unauthorized (check access key/secret)")
        if r.status_code in (400, 404):
            try:
                data_json = r.json()
            except Exception:
                data_json = {}
            msg = _maqsam_error_message(data_json) or f"Maqsam error ({r.status_code})"
            raise HTTPException(r.status_code, msg)
        if r.status_code >= 500:
            raise HTTPException(502, f"Maqsam error ({r.status_code})")
        if r.status_code not in (200, 201):
            raise HTTPException(502, f"Maqsam unexpected status ({r.status_code})")
        try:
            data_json = r.json()
        except Exception:
            raise HTTPException(502, "Maqsam returned invalid JSON")
        contact = _maqsam_extract_contact_message(data_json)
        now = datetime.now(timezone.utc).isoformat()
        doc = _maqsam_contact_doc_from_payload(contact=contact, lid=lid, now=now)
        await _db.sales_provider_contacts.update_one(
            {"provider": "maqsam", "location_id": lid, "identifier": doc.get("identifier")},
            {"$set": doc, "$setOnInsert": {"created_at": now, "linked_lead_id": None, "linked_member_id": None, "link_status": None}},
            upsert=True,
        )
        stored = await _db.sales_provider_contacts.find_one({"provider": "maqsam", "location_id": lid, "identifier": doc.get("identifier")}, {"_id": 0})
        return {"result": "success", "contact": contact, "stored": stored}


@router.patch("/maqsam/contacts/{identifier}")
async def update_maqsam_contact(identifier: str, data: MaqsamContactPatch, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    settings = await _get_maqsam_settings_doc(location_id)
    if not settings.get("is_enabled") or not settings.get("contacts_enabled"):
        raise HTTPException(400, "Maqsam Contacts integration is disabled")

    api_base = _maqsam_contacts_api_base_url(settings.get("base_url") or "")
    auth = (settings.get("access_key_id") or "", settings.get("access_secret") or "")
    patch: Dict[str, Any] = {}
    if data.name is not None:
        v = (data.name or "").strip()
        if v:
            patch["name"] = v
    if data.phone is not None:
        v = (data.phone or "").strip()
        if v:
            patch["phone"] = v
    if data.high_priority is not None:
        patch["high_priority"] = bool(data.high_priority)
    if data.custom_fields is not None:
        if not isinstance(data.custom_fields, dict):
            raise HTTPException(400, "custom_fields must be an object")
        patch["custom_fields"] = data.custom_fields
    if not patch:
        raise HTTPException(400, "No fields to update")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.patch(f"{api_base}/{identifier}", auth=auth, json=patch)
        except httpx.RequestError as e:
            raise HTTPException(502, f"Maqsam request failed: {str(e)}")
        if r.status_code == 401:
            raise HTTPException(401, "Maqsam Unauthorized (check access key/secret)")
        if r.status_code == 404:
            raise HTTPException(404, "Maqsam contact not found in provider")
        if r.status_code in (400,):
            try:
                data_json = r.json()
            except Exception:
                data_json = {}
            msg = _maqsam_error_message(data_json) or "Maqsam Bad Request"
            raise HTTPException(400, msg)
        if r.status_code >= 500:
            raise HTTPException(502, f"Maqsam error ({r.status_code})")
        if r.status_code != 200:
            raise HTTPException(502, f"Maqsam unexpected status ({r.status_code})")
        try:
            data_json = r.json()
        except Exception:
            raise HTTPException(502, "Maqsam returned invalid JSON")
        contact = _maqsam_extract_contact_message(data_json)
        now = datetime.now(timezone.utc).isoformat()
        doc = _maqsam_contact_doc_from_payload(contact=contact, lid=lid, now=now)
        await _db.sales_provider_contacts.update_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"$set": doc})
        stored = await _db.sales_provider_contacts.find_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"_id": 0})
        return {"result": "success", "contact": contact, "stored": stored}


@router.delete("/maqsam/contacts/{identifier}")
async def delete_maqsam_contact(identifier: str, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None
    settings = await _get_maqsam_settings_doc(location_id)
    if not settings.get("is_enabled") or not settings.get("contacts_enabled"):
        raise HTTPException(400, "Maqsam Contacts integration is disabled")

    api_base = _maqsam_contacts_api_base_url(settings.get("base_url") or "")
    auth = (settings.get("access_key_id") or "", settings.get("access_secret") or "")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            r = await client.delete(f"{api_base}/{identifier}", auth=auth)
        except httpx.RequestError as e:
            raise HTTPException(502, f"Maqsam request failed: {str(e)}")
        if r.status_code == 401:
            raise HTTPException(401, "Maqsam Unauthorized (check access key/secret)")
        if r.status_code == 404:
            raise HTTPException(404, "Maqsam contact not found in provider")
        if r.status_code in (400,):
            try:
                data_json = r.json()
            except Exception:
                data_json = {}
            msg = _maqsam_error_message(data_json) or "Maqsam Bad Request"
            raise HTTPException(400, msg)
        if r.status_code >= 500:
            raise HTTPException(502, f"Maqsam error ({r.status_code})")
        if r.status_code not in (200, 204):
            raise HTTPException(502, f"Maqsam unexpected status ({r.status_code})")
        now = datetime.now(timezone.utc).isoformat()
        await _db.sales_provider_contacts.update_one(
            {"provider": "maqsam", "location_id": lid, "identifier": identifier},
            {"$set": {"sync_status": "deleted", "sync_error": "", "updated_at": now, "updated_by_user_id": user.get("user_id")}},
            upsert=True,
        )
        return {"result": "success"}


async def _maqsam_contact_to_lead_create_payload(contact: dict, settings: dict, req: MaqsamContactCreateLeadRequest, fallback_location_id: Optional[str]) -> dict:
    mappings = _sanitize_maqsam_contact_field_mappings(settings.get("contacts_field_mappings") if isinstance(settings, dict) else None)
    cf = (contact or {}).get("custom_fields") if isinstance((contact or {}).get("custom_fields"), dict) else {}

    mapped: Dict[str, Any] = {}
    for src_key, target_field in (mappings or {}).items():
        if src_key in cf and cf.get(src_key) not in (None, ""):
            mapped[target_field] = cf.get(src_key)

    email = str(mapped.get("email") or "").strip()
    gender = str(mapped.get("gender") or "").strip().lower() if mapped.get("gender") is not None else None
    if gender not in ("male", "female"):
        gender = None

    notes = ""
    if mapped.get("notes"):
        notes = str(mapped.get("notes") or "").strip()
    extra_note = f"Imported from Maqsam contact {contact.get('identifier')}"
    notes = (notes + ("\n\n" if notes else "") + extra_note).strip()

    location_id = (req.location_id or "").strip() or (fallback_location_id or "").strip() or ""
    payload = {
        "location_id": location_id,
        "full_name": (contact.get("name") or "").strip() or "Maqsam Contact",
        "phone_number": (contact.get("phone") or "").strip(),
        "email": email,
        "source": "MAQSAM",
        "source_platform": "MAQSAM",
        "source_reference": str(contact.get("identifier") or "").strip(),
        "notes": notes,
        "gender": gender,
        "address": str(mapped.get("address") or "").strip(),
        "program_interest": str(mapped.get("program_interest") or "").strip(),
        "membership_plan": str(mapped.get("membership_plan") or "").strip(),
        "assigned_team_id": (req.assigned_team_id or "").strip(),
        "assigned_agent_staff_id": (req.assigned_agent_staff_id or "").strip(),
        "assigned_team_lead_staff_id": (req.assigned_team_lead_staff_id or "").strip(),
        "campaign_name": "",
        "adset_or_adgroup": "",
        "preferred_contact_method": "",
        "preferred_contact_time": "",
        "purpose": "",
        "lead_priority": "MEDIUM",
        "temperature": "WARM",
        "tags": ["maqsam"],
        "assigned_csr_staff_id": "",
        "assigned_location_id": "",
        "source_ref": {
            "provider": "maqsam",
            "contact_identifier": str(contact.get("identifier") or "").strip(),
        },
    }
    if mapped.get("source_reference"):
        payload["source_reference"] = str(mapped.get("source_reference") or "").strip()
    return payload


@router.post("/maqsam/contacts/{identifier}/create-lead", status_code=201)
async def create_lead_from_maqsam_contact(identifier: str, data: MaqsamContactCreateLeadRequest, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None

    contact = await _db.sales_provider_contacts.find_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Maqsam contact not found")
    if contact.get("linked_lead_id"):
        raise HTTPException(409, {"kind": "already_linked", "message": "Contact already linked to a lead", "sales_lead_id": contact.get("linked_lead_id")})
    if contact.get("linked_member_id"):
        raise HTTPException(409, {"kind": "already_linked", "message": "Contact already linked to a member", "member_id": contact.get("linked_member_id")})
    if (contact.get("computed_match_status") or "") in ("matched_lead", "matched_member", "conflict"):
        raise HTTPException(409, {"kind": "already_matched", "message": "Contact already matches existing CRM records; link instead of creating a duplicate", "computed_match_status": contact.get("computed_match_status")})

    settings = await _get_maqsam_settings_doc(location_id)
    lead_payload = await _maqsam_contact_to_lead_create_payload(contact, settings, data, lid)
    lead_model = SalesLeadCreate(**lead_payload)
    lead_doc = await create_sales_lead(lead_model, request)

    now = datetime.now(timezone.utc).isoformat()
    await _db.sales_provider_contacts.update_one(
        {"provider": "maqsam", "location_id": lid, "identifier": identifier},
        {"$set": {"linked_lead_id": lead_doc.get("sales_lead_id"), "link_status": "linked_lead", "link_updated_at": now, "link_updated_by_user_id": user.get("user_id")}},
    )
    await _db.sales_leads.update_one(
        {"sales_lead_id": lead_doc.get("sales_lead_id")},
        {"$set": {"maqsam_contact_identifier": identifier, "maqsam_link_status": "linked", "last_maqsam_sync_at": contact.get("synced_at")}},
    )
    return {"lead": lead_doc}


@router.post("/maqsam/contacts/{identifier}/link")
async def link_maqsam_contact(identifier: str, data: MaqsamContactLinkRequest, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None

    contact = await _db.sales_provider_contacts.find_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Maqsam contact not found")

    target_kind = (data.target_kind or "").strip().lower()
    target_id = (data.target_id or "").strip()
    if target_kind not in ("lead", "member"):
        raise HTTPException(400, "target_kind must be lead or member")
    if not target_id:
        raise HTTPException(400, "target_id is required")

    now = datetime.now(timezone.utc).isoformat()
    if target_kind == "lead":
        lead = await _db.sales_leads.find_one({"sales_lead_id": target_id}, {"_id": 0, "sales_lead_id": 1})
        if not lead:
            raise HTTPException(404, "Sales lead not found")
        await _db.sales_provider_contacts.update_one(
            {"provider": "maqsam", "location_id": lid, "identifier": identifier},
            {"$set": {"linked_lead_id": target_id, "linked_member_id": None, "link_status": "linked_lead", "link_note": (data.note or "").strip(), "link_updated_at": now, "link_updated_by_user_id": user.get("user_id")}},
        )
        await _db.sales_leads.update_one(
            {"sales_lead_id": target_id},
            {"$set": {"maqsam_contact_identifier": identifier, "maqsam_link_status": "linked", "last_maqsam_sync_at": contact.get("synced_at")}},
        )
        return {"result": "success", "linked": {"kind": "lead", "sales_lead_id": target_id}}

    member = await _db.members.find_one({"member_id": target_id}, {"_id": 0, "member_id": 1})
    if not member:
        raise HTTPException(404, "Member not found")
    await _db.sales_provider_contacts.update_one(
        {"provider": "maqsam", "location_id": lid, "identifier": identifier},
        {"$set": {"linked_member_id": target_id, "linked_lead_id": None, "link_status": "linked_member", "link_note": (data.note or "").strip(), "link_updated_at": now, "link_updated_by_user_id": user.get("user_id")}},
    )
    await _db.members.update_one(
        {"member_id": target_id},
        {"$set": {"maqsam_contact_identifier": identifier, "maqsam_link_status": "linked", "last_maqsam_sync_at": contact.get("synced_at")}},
    )
    return {"result": "success", "linked": {"kind": "member", "member_id": target_id}}


@router.post("/maqsam/contacts/{identifier}/unlink")
async def unlink_maqsam_contact(identifier: str, request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_manage(request)
    if (kind or "").upper() != "OWNER":
        raise HTTPException(403, "Owner access required")
    lid = (location_id or "").strip() or None

    contact = await _db.sales_provider_contacts.find_one({"provider": "maqsam", "location_id": lid, "identifier": identifier}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Maqsam contact not found")
    now = datetime.now(timezone.utc).isoformat()

    linked_lead_id = contact.get("linked_lead_id")
    linked_member_id = contact.get("linked_member_id")

    await _db.sales_provider_contacts.update_one(
        {"provider": "maqsam", "location_id": lid, "identifier": identifier},
        {"$set": {"linked_lead_id": None, "linked_member_id": None, "link_status": "unlinked", "link_updated_at": now, "link_updated_by_user_id": user.get("user_id")}},
    )
    if linked_lead_id:
        await _db.sales_leads.update_one(
            {"sales_lead_id": linked_lead_id, "maqsam_contact_identifier": identifier},
            {"$unset": {"maqsam_contact_identifier": "", "maqsam_link_status": "", "last_maqsam_sync_at": ""}},
        )
    if linked_member_id:
        await _db.members.update_one(
            {"member_id": linked_member_id, "maqsam_contact_identifier": identifier},
            {"$unset": {"maqsam_contact_identifier": "", "maqsam_link_status": "", "last_maqsam_sync_at": ""}},
        )
    return {"result": "success"}


@router.get("/follow-ups/inbox")
async def follow_up_inbox(request: Request, location_id: Optional[str] = None, limit: int = 100):
    user, staff, kind = await _require_crm_view(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=location_id)
    active_filter = {"is_merged": {"$ne": True}, "$or": [{"is_active": True}, {"is_active": {"$exists": False}}]}
    q: Dict[str, Any] = dict(vis_q)
    if "$and" in q and isinstance(q.get("$and"), list):
        q["$and"].append(active_filter)
    else:
        q["$and"] = [active_filter]

    today = datetime.now(timezone.utc).date().isoformat()
    q["next_follow_up_date"] = {"$lt": today}
    q["status"] = {"$in": WORKING_STATUS_TERMS}
    rows = await _db.sales_leads.find(q, {"_id": 0}).sort("next_follow_up_date", 1).limit(max(1, min(500, limit * 5))).to_list(max(1, min(500, limit * 5)))

    owner_id = await _owner_id_for_sla(user, staff, kind, location_id=location_id)
    sla_settings = await _get_sla_settings(owner_id)

    actor_staff_id = (staff or {}).get("staff_id")
    out_rows = []
    for ld in rows:
        st = await _follow_up_state_for_lead(ld, settings=sla_settings)
        if not st.get("is_overdue"):
            continue
        include = False
        k = (kind or "").upper()
        if k == "CSR" and actor_staff_id:
            include = True
        elif k == "TEAM_LEAD" and actor_staff_id:
            include = st.get("escalation_level", 0) >= 1 and st.get("escalated_to_staff_id") == actor_staff_id
        elif k in ("MANAGER", "OWNER"):
            include = st.get("escalation_level", 0) >= 2
        if not include:
            continue
        ld["status"] = _norm_status(ld.get("status"))
        ld["reporting_class"] = _lead_reporting_class(ld.get("status"))
        ld["working_group"] = ld["reporting_class"]
        ld["follow_up_state"] = st
        if ld.get("assigned_team_id"):
            tm = await _db.sales_teams.find_one({"sales_team_id": ld["assigned_team_id"]}, {"_id": 0, "name": 1})
            ld["assigned_team_name"] = tm["name"] if tm else None
        loc = await _db.locations.find_one({"location_id": ld.get("location_id")}, {"_id": 0, "name": 1})
        ld["location_name"] = loc["name"] if loc else "Unassigned"
        out_rows.append(ld)
        if len(out_rows) >= limit:
            break

    return {"scope": {"kind": kind, "staff_id": actor_staff_id, "location_id": location_id}, "settings": sla_settings, "rows": out_rows}


@router.post("/leads/{lead_id}/convert-to-member")
async def convert_lead_to_member(lead_id: str, data: LeadConvertRequest, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    vis_q = await _lead_visibility_query(user, staff, kind, location_id=None)
    lead = await _db.sales_leads.find_one({"sales_lead_id": lead_id, **vis_q}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Sales lead not found")

    if lead.get("linked_member_id"):
        return {"member_id": lead.get("linked_member_id"), "message": "Already converted"}

    email_norm = lead.get("email_norm") or _norm_email(lead.get("email"))
    phone_norm = lead.get("phone_norm") or _norm_phone(lead.get("phone"))
    existing = await _find_member_by_email_phone(email_norm, phone_norm)
    if existing:
        now_iso = datetime.now(timezone.utc).isoformat()
        team_lead_staff_id = lead.get("assigned_team_lead_staff_id")
        if not team_lead_staff_id and lead.get("assigned_team_id"):
            team = await _db.sales_teams.find_one({"sales_team_id": lead.get("assigned_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
            team_lead_staff_id = (team or {}).get("team_lead_staff_id")
        csr_staff_id = lead.get("assigned_csr_staff_id") or lead.get("assigned_agent_staff_id")
        await _db.members.update_one(
            {"member_id": existing.get("member_id")},
            {"$set": {"sales_attribution": {
                "sales_lead_id": lead_id,
                "csr_staff_id": csr_staff_id,
                "team_lead_staff_id": team_lead_staff_id,
                "location_id": lead.get("location_id"),
                "source": lead.get("source"),
                "source_platform": lead.get("source_platform"),
                "campaign_name": lead.get("campaign_name"),
                "adset_or_adgroup": lead.get("adset_or_adgroup"),
                "source_reference": lead.get("source_reference"),
                "converted_at": now_iso,
            }, "updated_at": now_iso}},
        )
        await _db.sales_leads.update_one(
            {"sales_lead_id": lead_id},
            {"$set": {"linked_member_id": existing.get("member_id"), "status": "converted", "pipeline_stage": "converted", "converted_at": now_iso, "updated_at": now_iso}},
        )
        await _write_lead_event(
            lead_id=lead_id,
            event_type="CONVERTED",
            user=user,
            staff=staff,
            payload={"member_id": existing.get("member_id"), "mode": "linked_existing_member"},
        )
        return {"member_id": existing.get("member_id"), "message": "Linked to existing member"}

    if not _pwd_context:
        raise HTTPException(500, "Password context not configured for conversion")

    now = datetime.now(timezone.utc).isoformat()
    member_id = f"member_{uuid.uuid4().hex[:12]}"
    member_no = f"M-{member_id[-6:].upper()}"
    location_id = lead.get("location_id")
    owner_id = None
    if location_id:
        loc = await _db.locations.find_one({"location_id": location_id}, {"_id": 0, "owner_id": 1})
        owner_id = (loc or {}).get("owner_id")

    member_doc = {
        "member_id": member_id,
        "location_id": location_id,
        "member_no": member_no,
        "primary_member_id": None,
        "relationship": "",
        "dependent_type": None,
        "full_name": lead.get("full_name") or "Member",
        "gender": data.gender,
        "dob": "",
        "phone": phone_norm or (lead.get("phone") or ""),
        "phone_norm": phone_norm or _norm_phone(lead.get("phone")),
        "email": email_norm or (lead.get("email") or ""),
        "email_norm": email_norm or _norm_email(lead.get("email")),
        "address": data.address or (lead.get("address") or ""),
        "emergency_contact": {"name": "", "phone": "", "relation": ""},
        "medical": {"conditions": "", "injuries": "", "allergies": "", "medications": "", "notes": "", "doctor_name": "", "doctor_phone": "", "consent": False},
        "profile_photo_url": None,
        "terms_accepted_at": now if data.accept_terms else None,
        "terms_signed_agreement_id": data.agreement_id if data.accept_terms else None,
        "is_active": True,
        "deleted_at": None,
        "created_by_user_id": user.get("user_id"),
        "created_at": now,
        "updated_at": now,
        "sales_attribution": {},
    }
    await _db.members.insert_one(member_doc)
    member_doc.pop("_id", None)

    raw_password = data.password
    if not raw_password or len(raw_password) < 6:
        raw_password = uuid.uuid4().hex[:10]

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": email_norm,
        "name": member_doc.get("full_name") or "Member",
        "password_hash": _pwd_context.hash(raw_password),
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
    await _db.members.update_one({"member_id": member_id}, {"$set": {"user_id": user_id, "updated_at": now}})

    team_lead_staff_id = lead.get("assigned_team_lead_staff_id")
    if not team_lead_staff_id and lead.get("assigned_team_id"):
        team = await _db.sales_teams.find_one({"sales_team_id": lead.get("assigned_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
        team_lead_staff_id = (team or {}).get("team_lead_staff_id")
    csr_staff_id = lead.get("assigned_csr_staff_id") or lead.get("assigned_agent_staff_id")
    await _db.members.update_one(
        {"member_id": member_id},
        {"$set": {"sales_attribution": {
            "sales_lead_id": lead_id,
            "csr_staff_id": csr_staff_id,
            "team_lead_staff_id": team_lead_staff_id,
            "location_id": lead.get("location_id"),
            "source": lead.get("source"),
            "source_platform": lead.get("source_platform"),
            "campaign_name": lead.get("campaign_name"),
            "adset_or_adgroup": lead.get("adset_or_adgroup"),
            "source_reference": lead.get("source_reference"),
            "converted_at": now,
        }, "updated_at": now}},
    )

    await _db.sales_leads.update_one(
        {"sales_lead_id": lead_id},
        {"$set": {
            "linked_member_id": member_id,
            "status": "converted",
            "pipeline_stage": "converted",
            "converted_at": now,
            "updated_at": now,
            "gender": lead.get("gender") or data.gender,
            "address": (lead.get("address") or "") or data.address,
            "purpose": lead.get("purpose") or data.purpose,
            "program_interest": lead.get("program_interest") or data.program_interest,
            "membership_plan": lead.get("membership_plan") or data.membership_plan,
        }},
    )
    await _write_lead_event(
        lead_id=lead_id,
        event_type="CONVERTED",
        user=user,
        staff=staff,
        payload={
            "member_id": member_id,
            "user_id": user_id,
            "assigned_agent_staff_id": lead.get("assigned_agent_staff_id"),
            "assigned_team_id": lead.get("assigned_team_id"),
            "source": lead.get("source"),
        },
    )
    return {"member_id": member_id, "portal_user_id": user_id, "temp_password": raw_password}


@router.post("/leads/bulk-import")
async def bulk_import_leads(data: BulkLeadImportRequest, request: Request):
    user, staff, kind = await _require_crm_manage(request)
    results = {"new_leads": [], "duplicate_leads": [], "existing_members": [], "invalid_rows": []}

    for idx, row in enumerate(data.rows or []):
        name = (row.full_name or "").strip()
        if not name:
            results["invalid_rows"].append({"row_index": idx, "reason": "full_name required", "full_name": row.full_name, "email": row.email, "phone": row.phone})
            continue
        lid = row.location_id or (staff.get("location_id") if staff else "") or user.get("location_id") or ""
        if not lid:
            results["invalid_rows"].append({"row_index": idx, "reason": "location_id required", "full_name": row.full_name, "email": row.email, "phone": row.phone})
            continue
        email_norm = _norm_email(row.email)
        phone_norm = _norm_phone(row.phone)

        m = await _find_member_by_email_phone(email_norm, phone_norm)
        if m:
            loc = await _db.locations.find_one({"location_id": m.get("location_id")}, {"_id": 0, "name": 1})
            sa = m.get("sales_attribution") or {}
            csr_id = sa.get("csr_staff_id")
            tl_id = sa.get("team_lead_staff_id")
            csr_name = None
            tl_name = None
            if csr_id:
                s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            if tl_id:
                s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            existing_lead = await _find_lead_by_email_phone(email_norm, phone_norm, location_scope={"location_id": lid})
            results["existing_members"].append({
                "row_index": idx,
                "member_id": m.get("member_id"),
                "member_name": m.get("full_name"),
                "email": m.get("email"),
                "phone": m.get("phone"),
                "location_id": m.get("location_id"),
                "location_name": (loc or {}).get("name") or None,
                "current_csr_staff_id": csr_id,
                "current_csr_name": csr_name,
                "current_team_lead_staff_id": tl_id,
                "current_team_lead_name": tl_name,
                "existing_lead_id": (existing_lead or {}).get("sales_lead_id"),
                "existing_lead_status": _norm_status((existing_lead or {}).get("status")) if existing_lead else None,
            })
            continue

        existing_lead = await _find_lead_by_email_phone(email_norm, phone_norm, location_scope={"location_id": lid})
        if existing_lead:
            csr_id = existing_lead.get("assigned_csr_staff_id") or existing_lead.get("assigned_agent_staff_id")
            tl_id = existing_lead.get("assigned_team_lead_staff_id") or None
            if not tl_id and existing_lead.get("assigned_team_id"):
                t = await _db.sales_teams.find_one({"sales_team_id": existing_lead.get("assigned_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
                tl_id = (t or {}).get("team_lead_staff_id")
            csr_name = None
            tl_name = None
            if csr_id:
                s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            if tl_id:
                s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
                tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
            loc = await _db.locations.find_one({"location_id": existing_lead.get("location_id")}, {"_id": 0, "name": 1})
            results["duplicate_leads"].append({
                "row_index": idx,
                "existing_lead_id": existing_lead.get("sales_lead_id"),
                "full_name": existing_lead.get("full_name") or name,
                "email": existing_lead.get("email") or row.email,
                "phone": existing_lead.get("phone") or row.phone,
                "status": _norm_status(existing_lead.get("status")),
                "location_id": existing_lead.get("location_id"),
                "location_name": (loc or {}).get("name") or None,
                "assigned_csr_staff_id": csr_id,
                "assigned_csr_name": csr_name,
                "assigned_team_lead_staff_id": tl_id,
                "assigned_team_lead_name": tl_name,
            })
            continue

        lead_id = f"lead_{uuid.uuid4().hex[:12]}"
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "sales_lead_id": lead_id,
            "location_id": lid,
            "assigned_location_id": lid,
            "contact_submission_id": None,
            "contact_submission_ids": [],
            "full_name": name,
            "phone": row.phone,
            "phone_number": row.phone,
            "phone_norm": phone_norm,
            "email": row.email,
            "email_norm": email_norm,
            "source": row.source,
            "source_ref": {},
            "discipline_slug": None,
            "plan_id": None,
            "status": "new",
            "pipeline_stage": "new",
            "assigned_team_id": None,
            "assigned_agent_staff_id": None,
            "assigned_csr_staff_id": None,
            "assigned_team_lead_staff_id": None,
            "last_contact_date": None,
            "next_follow_up_date": None,
            "notes": row.notes,
            "gender": row.gender,
            "address": row.address,
            "purpose": row.purpose or "self",
            "program_interest": row.program_interest,
            "membership_plan": row.membership_plan,
            "lead_priority": (row.lead_priority or "MEDIUM").upper(),
            "lead_temperature": (row.temperature or "WARM").lower(),
            "temperature": (row.temperature or "WARM").upper(),
            "preferred_contact_method": "",
            "preferred_contact_time": "",
            "tags": row.tags or [],
            "linked_member_id": None,
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
        doc = await _normalize_and_infer_lead_updates(base={}, updates=doc)
        await _db.sales_leads.insert_one(doc)
        await _write_lead_event(lead_id=lead_id, event_type="CREATED", user=user, staff=staff, payload={"source": doc.get("source"), "bulk": True})
        loc = await _db.locations.find_one({"location_id": lid}, {"_id": 0, "name": 1})
        csr_id = doc.get("assigned_csr_staff_id") or doc.get("assigned_agent_staff_id")
        csr_name = None
        if csr_id:
            s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        tl_id = doc.get("assigned_team_lead_staff_id")
        tl_name = None
        if tl_id:
            s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None
        results["new_leads"].append({
            "row_index": idx,
            "sales_lead_id": lead_id,
            "full_name": doc.get("full_name"),
            "email": doc.get("email"),
            "phone": doc.get("phone"),
            "location_id": lid,
            "location_name": (loc or {}).get("name") or None,
            "assigned_csr_staff_id": csr_id,
            "assigned_csr_name": csr_name,
            "assigned_team_lead_staff_id": tl_id,
            "assigned_team_lead_name": tl_name,
        })

    return results


class InboundLeadCapture(BaseModel):
    model_config = {"populate_by_name": True}
    source_platform: str = ""
    external_source_id: str = ""
    form_id: str = ""
    campaign_name: str = ""
    adset_or_adgroup: str = ""
    location_id: str = ""
    full_name: str = ""
    email: str = ""
    phone: str = Field("", alias="phone_number")
    notes: str = ""
    program_interest: str = ""
    membership_plan: str = ""
    gender: Optional[str] = None
    address: str = ""
    purpose: str = ""
    tags: List[str] = []


class RoutingRuleCreate(BaseModel):
    name: str
    is_active: bool = True
    source_platform: str = ""
    location_id: str = ""
    assigned_team_id: str = ""
    assigned_agent_staff_id: str = ""
    assigned_team_lead_staff_id: str = ""


class RoutingRuleUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    source_platform: Optional[str] = None
    location_id: Optional[str] = None
    assigned_team_id: Optional[str] = None
    assigned_agent_staff_id: Optional[str] = None
    assigned_team_lead_staff_id: Optional[str] = None


async def _apply_routing_rules(payload: InboundLeadCapture) -> Dict[str, Any]:
    if payload.location_id:
        return {
            "location_id": payload.location_id,
            "assigned_team_id": None,
            "assigned_agent_staff_id": None,
            "assigned_team_lead_staff_id": None,
        }
    src = (payload.source_platform or "").upper().strip()
    rule = await _db.sales_routing_rules.find_one({"is_active": True, "source_platform": src}, {"_id": 0})
    if not rule and src:
        rule = await _db.sales_routing_rules.find_one({"is_active": True, "source_platform": "*"}, {"_id": 0})
    if not rule:
        rule = await _db.sales_routing_rules.find_one({"is_active": True, "source_platform": ""}, {"_id": 0})
    if not rule:
        return {"location_id": "", "assigned_team_id": None, "assigned_agent_staff_id": None, "assigned_team_lead_staff_id": None}
    return {
        "location_id": rule.get("location_id") or "",
        "assigned_team_id": rule.get("assigned_team_id") or None,
        "assigned_agent_staff_id": rule.get("assigned_agent_staff_id") or None,
        "assigned_team_lead_staff_id": rule.get("assigned_team_lead_staff_id") or None,
    }


@router.post("/inbound/leads", status_code=201)
async def ingest_inbound_lead(payload: InboundLeadCapture, request: Request):
    secret = os.getenv("CRM_INGEST_SECRET") or ""
    header_secret = request.headers.get("X-CRM-Ingest-Secret") or ""
    if secret:
        if header_secret != secret:
            raise HTTPException(401, "Invalid ingest secret")
        user = {"user_id": None, "role": "PUBLIC"}
        staff = None
    else:
        user, staff, _ = await _require_crm_manage(request)

    email_norm = _norm_email(payload.email)
    phone_norm = _norm_phone(payload.phone)

    existing_member = await _find_member_by_email_phone(email_norm, phone_norm)

    or_terms = []
    if email_norm:
        or_terms.append({"email_norm": email_norm})
    if phone_norm:
        or_terms.append({"phone_norm": phone_norm})
    existing_lead = await _db.sales_leads.find_one({"$or": or_terms} if or_terms else {"sales_lead_id": "__none__"}, {"_id": 0})

    now = datetime.now(timezone.utc).isoformat()
    inbound_source = (payload.source_platform or "").upper() or "OTHER"
    if inbound_source not in VALID_LEAD_SOURCES:
        inbound_source = "OTHER"

    maqsam_agent_identifier = ""
    maqsam_mapping = None
    if inbound_source == "MAQSAM":
        maqsam_agent_identifier = (payload.external_source_id or payload.form_id or "").strip()
        if maqsam_agent_identifier:
            maqsam_mapping = await _db.sales_provider_agents.find_one(
                {
                    "provider": "maqsam",
                    "identifier": maqsam_agent_identifier,
                    "mapping_enabled": True,
                    "mapped_staff_id": {"$ne": None},
                },
                {"_id": 0},
            )

    routing = await _apply_routing_rules(payload)
    if maqsam_mapping:
        role = (maqsam_mapping.get("mapped_role") or "").upper()
        mapped_staff_id = maqsam_mapping.get("mapped_staff_id")
        if role == "TEAM_LEAD":
            routing["assigned_team_lead_staff_id"] = mapped_staff_id
            routing["assigned_agent_staff_id"] = None
        else:
            routing["assigned_agent_staff_id"] = mapped_staff_id
            if maqsam_mapping.get("mapped_team_lead_staff_id"):
                routing["assigned_team_lead_staff_id"] = maqsam_mapping.get("mapped_team_lead_staff_id")
        if maqsam_mapping.get("mapped_location_id"):
            routing["location_id"] = maqsam_mapping.get("mapped_location_id")

    lid = routing.get("location_id") or payload.location_id or ""

    if existing_lead:
        merged_updates = {
            "updated_at": now,
            "source": existing_lead.get("source") or inbound_source,
            "source_platform": payload.source_platform or existing_lead.get("source_platform") or "",
            "campaign_name": payload.campaign_name or existing_lead.get("campaign_name") or "",
            "adset_or_adgroup": payload.adset_or_adgroup or existing_lead.get("adset_or_adgroup") or "",
            "source_reference": payload.external_source_id or payload.form_id or existing_lead.get("source_reference") or "",
            "gender": existing_lead.get("gender") or payload.gender,
            "address": existing_lead.get("address") or (payload.address or ""),
            "purpose": existing_lead.get("purpose") or (payload.purpose or "self"),
            "program_interest": existing_lead.get("program_interest") or (payload.program_interest or ""),
            "membership_plan": existing_lead.get("membership_plan") or (payload.membership_plan or ""),
        }
        if inbound_source == "MAQSAM" and maqsam_agent_identifier:
            merged_updates["source_platform"] = "MAQSAM"
            merged_updates["source_reference"] = maqsam_agent_identifier
            merged_updates["mapped_maqsam_agent_identifier"] = maqsam_agent_identifier
            if maqsam_mapping:
                merged_updates["mapped_internal_staff_id"] = maqsam_mapping.get("mapped_staff_id")
                merged_updates["mapped_internal_role"] = maqsam_mapping.get("mapped_role")
        if lid and not existing_lead.get("location_id"):
            merged_updates["location_id"] = lid
            merged_updates["assigned_location_id"] = lid
        if routing.get("assigned_team_id") and not existing_lead.get("assigned_team_id"):
            merged_updates["assigned_team_id"] = routing.get("assigned_team_id")
        if routing.get("assigned_agent_staff_id") and not (existing_lead.get("assigned_csr_staff_id") or existing_lead.get("assigned_agent_staff_id")):
            merged_updates["assigned_agent_staff_id"] = routing.get("assigned_agent_staff_id")
            merged_updates["assigned_csr_staff_id"] = routing.get("assigned_agent_staff_id")
        if routing.get("assigned_team_lead_staff_id") and not existing_lead.get("assigned_team_lead_staff_id"):
            merged_updates["assigned_team_lead_staff_id"] = routing.get("assigned_team_lead_staff_id")

        merged_updates = await _normalize_and_infer_lead_updates(base=existing_lead, updates=merged_updates)
        await _db.sales_leads.update_one(
            {"sales_lead_id": existing_lead["sales_lead_id"]},
            {"$set": merged_updates, "$addToSet": {"tags": {"$each": payload.tags or []}}},
        )
        await _db.sales_lead_events.insert_one(
            {
                "sales_lead_event_id": f"sle_{uuid.uuid4().hex[:12]}",
                "sales_lead_id": existing_lead["sales_lead_id"],
                "type": "INBOUND_CAPTURE",
                "payload": {
                    "source_platform": payload.source_platform,
                    "external_source_id": payload.external_source_id,
                    "form_id": payload.form_id,
                    "campaign_name": payload.campaign_name,
                    "adset_or_adgroup": payload.adset_or_adgroup,
                    "note": payload.notes,
                },
                "actor_user_id": user.get("user_id"),
                "actor_role": user.get("role"),
                "actor_staff_id": (staff or {}).get("staff_id"),
                "created_at": now,
            }
        )
        return {"action": "merged", "sales_lead_id": existing_lead["sales_lead_id"]}

    lead_id = f"lead_{uuid.uuid4().hex[:12]}"
    doc = {
        "sales_lead_id": lead_id,
        "location_id": lid,
        "assigned_location_id": lid,
        "contact_submission_id": None,
        "contact_submission_ids": [],
        "full_name": payload.full_name or "Lead",
        "phone": payload.phone,
        "phone_number": payload.phone,
        "phone_norm": phone_norm,
        "email": payload.email,
        "email_norm": email_norm,
        "source": inbound_source,
        "source_platform": payload.source_platform,
        "campaign_name": payload.campaign_name,
        "adset_or_adgroup": payload.adset_or_adgroup,
        "source_reference": payload.external_source_id or payload.form_id,
        "source_ref": {"external_source_id": payload.external_source_id, "form_id": payload.form_id},
        "mapped_maqsam_agent_identifier": maqsam_agent_identifier if inbound_source == "MAQSAM" else None,
        "mapped_internal_staff_id": (maqsam_mapping or {}).get("mapped_staff_id") if inbound_source == "MAQSAM" else None,
        "mapped_internal_role": (maqsam_mapping or {}).get("mapped_role") if inbound_source == "MAQSAM" else None,
        "discipline_slug": None,
        "plan_id": None,
        "status": "duplicate" if existing_member else "new",
        "pipeline_stage": "duplicate" if existing_member else "new",
        "assigned_team_id": routing.get("assigned_team_id"),
        "assigned_agent_staff_id": routing.get("assigned_agent_staff_id"),
        "assigned_csr_staff_id": routing.get("assigned_agent_staff_id"),
        "assigned_team_lead_staff_id": routing.get("assigned_team_lead_staff_id"),
        "last_contact_date": None,
        "next_follow_up_date": None,
        "notes": payload.notes,
        "gender": payload.gender,
        "address": payload.address or "",
        "purpose": payload.purpose or "self",
        "program_interest": payload.program_interest or "",
        "membership_plan": payload.membership_plan or "",
        "lead_priority": "MEDIUM",
        "lead_temperature": "warm",
        "temperature": "WARM",
        "preferred_contact_method": "",
        "preferred_contact_time": "",
        "tags": payload.tags or [],
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
    doc = await _normalize_and_infer_lead_updates(base={}, updates=doc)
    await _db.sales_leads.insert_one(doc)
    await _db.sales_lead_events.insert_one(
        {
            "sales_lead_event_id": f"sle_{uuid.uuid4().hex[:12]}",
            "sales_lead_id": lead_id,
            "type": "CREATED",
            "payload": {"source": inbound_source, "source_platform": payload.source_platform, "external_source_id": payload.external_source_id, "form_id": payload.form_id},
            "actor_user_id": user.get("user_id"),
            "actor_role": user.get("role"),
            "actor_staff_id": (staff or {}).get("staff_id"),
            "created_at": now,
        }
    )
    return {"action": "created", "sales_lead_id": lead_id}


@router.get("/routing-rules")
async def list_routing_rules(request: Request):
    user = await _require_sales(request, "manager.view_sales_location")
    if user.get("role") not in ("OWNER", "OWNER_FULL"):
        raise HTTPException(403, "Owner access required")
    rules = await _db.sales_routing_rules.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"rules": rules}


@router.post("/routing-rules", status_code=201)
async def create_routing_rule(data: RoutingRuleCreate, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")
    if user.get("role") not in ("OWNER", "OWNER_FULL"):
        raise HTTPException(403, "Owner access required")
    now = datetime.now(timezone.utc).isoformat()
    rid = f"srr_{uuid.uuid4().hex[:12]}"
    doc = {
        "sales_routing_rule_id": rid,
        "name": data.name,
        "is_active": bool(data.is_active),
        "source_platform": (data.source_platform or "").upper(),
        "location_id": data.location_id or "",
        "assigned_team_id": data.assigned_team_id or None,
        "assigned_agent_staff_id": data.assigned_agent_staff_id or None,
        "assigned_team_lead_staff_id": data.assigned_team_lead_staff_id or None,
        "created_by_user_id": user.get("user_id"),
        "created_at": now,
        "updated_at": now,
    }
    await _db.sales_routing_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.patch("/routing-rules/{rule_id}")
async def update_routing_rule(rule_id: str, data: RoutingRuleUpdate, request: Request):
    user = await _require_sales(request, "manager.manage_sales_location")
    if user.get("role") not in ("OWNER", "OWNER_FULL"):
        raise HTTPException(403, "Owner access required")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "source_platform" in updates:
        updates["source_platform"] = (updates["source_platform"] or "").upper()
    if "assigned_team_id" in updates:
        updates["assigned_team_id"] = updates["assigned_team_id"] or None
    if "assigned_agent_staff_id" in updates:
        updates["assigned_agent_staff_id"] = updates["assigned_agent_staff_id"] or None
    if "assigned_team_lead_staff_id" in updates:
        updates["assigned_team_lead_staff_id"] = updates["assigned_team_lead_staff_id"] or None
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await _db.sales_routing_rules.update_one({"sales_routing_rule_id": rule_id}, {"$set": updates})
    rule = await _db.sales_routing_rules.find_one({"sales_routing_rule_id": rule_id}, {"_id": 0})
    if not rule:
        raise HTTPException(404, "Routing rule not found")
    return rule


async def _create_sales_revenue_transaction(lead: dict, user: dict):
    """
    Creates a finance transaction when a lead is converted to WON.
    Records membership revenue in the finance system.
    """
    membership_price = lead.get("membership_price") or 0
    if membership_price <= 0:
        return  # No revenue to record
    
    now = datetime.now(timezone.utc).isoformat()
    transaction_id = f"txn_sales_{uuid.uuid4().hex[:12]}"
    
    # Get location name for reference
    location_name = "Unknown"
    if lead.get("location_id"):
        loc = await _db.locations.find_one(
            {"location_id": lead["location_id"]},
            {"_id": 0, "name": 1}
        )
        if loc:
            location_name = loc["name"]
    
    # Get agent name for reference
    agent_name = "Unassigned"
    if lead.get("assigned_agent_staff_id"):
        agent = await _db.staff.find_one(
            {"staff_id": lead["assigned_agent_staff_id"]},
            {"_id": 0, "first_name": 1, "last_name": 1}
        )
        if agent:
            agent_name = f"{agent.get('first_name', '')} {agent.get('last_name', '')}".strip()
    
    transaction = {
        "transaction_id": transaction_id,
        "type": "SALES_REVENUE",
        "category": "membership_sale",
        "amount": membership_price,
        "currency": "AED",
        "location_id": lead.get("location_id"),
        "location_name": location_name,
        "description": f"Membership sale - {lead.get('full_name', 'Unknown')}",
        "reference_type": "sales_lead",
        "reference_id": lead.get("sales_lead_id"),
        "source": lead.get("source", "website"),
        "metadata": {
            "lead_id": lead.get("sales_lead_id"),
            "lead_name": lead.get("full_name"),
            "lead_email": lead.get("email"),
            "lead_phone": lead.get("phone"),
            "membership_type": lead.get("membership_type"),
            "csr_staff_id": lead.get("assigned_csr_staff_id") or lead.get("assigned_agent_staff_id"),
            "team_lead_staff_id": lead.get("assigned_team_lead_staff_id"),
            "agent_staff_id": lead.get("assigned_agent_staff_id"),
            "agent_name": agent_name,
            "team_id": lead.get("assigned_team_id"),
            "source_platform": lead.get("source_platform"),
            "campaign_name": lead.get("campaign_name"),
            "adset_or_adgroup": lead.get("adset_or_adgroup"),
            "source_reference": lead.get("source_reference"),
        },
        "recorded_by_user_id": user.get("user_id"),
        "recorded_by_role": user.get("role"),
        "status": "completed",
        "created_at": now,
        "updated_at": now,
    }
    
    await _db.sales_revenue.insert_one(transaction)
    
    # Also update the lead with the transaction reference
    await _db.sales_leads.update_one(
        {"sales_lead_id": lead.get("sales_lead_id")},
        {"$set": {"revenue_transaction_id": transaction_id, "converted_at": now}}
    )


# ─── Available Staff Helpers ───────────────────────────────────────

@router.get("/available-staff")
async def list_available_staff(request: Request, location_id: Optional[str] = None):
    """All active staff at a location (for assigning to teams)."""
    user, staff, kind = await _require_crm_view(request)
    lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
    lid = lids[0] if lids else None
    if not lid:
        raise HTTPException(400, "location_id required")
    staff_rows = await _db.staff.find({
        "location_id": lid, "is_active": True,
        "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]
    }, {
        "_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1,
        "email": 1, "phone": 1, "role": 1, "is_sales": 1, "sales_role": 1,
    }).to_list(200)
    return staff_rows


# ─── Sales Dashboard Stats ────────────────────────────────────────

@router.get("/dashboard/stats")
async def get_sales_stats(request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_view(request)
    lf = await _lead_visibility_query(user, staff, kind, location_id=location_id)
    import asyncio

    total_teams = 0
    total_csrs = 0
    total_team_leads = 0
    if kind in ("OWNER", "MANAGER") or await _check_perm(user, "manager.view_sales_location"):
        team_lf = {}
        if lf.get("location_id") is not None:
            team_lf["location_id"] = lf.get("location_id")
        teams_q = {**team_lf, "is_active": True} if team_lf else {"is_active": True}
        agent_q = {**team_lf, "is_active": True, "member_type": "AGENT"} if team_lf else {"is_active": True, "member_type": "AGENT"}
        lead_q = {**team_lf, "is_active": True, "member_type": "TEAM_LEAD"} if team_lf else {"is_active": True, "member_type": "TEAM_LEAD"}
        total_teams, total_csrs, total_team_leads = await asyncio.gather(
            _db.sales_teams.count_documents(teams_q),
            _db.sales_team_members.count_documents(agent_q),
            _db.sales_team_members.count_documents(lead_q),
        )

    today = datetime.now(timezone.utc).date().isoformat()
    (
        total_leads,
        new_leads,
        won_leads,
        lost_leads,
        in_progress,
        working,
        not_working,
        converted,
        transferred,
        today_follow_ups,
        overdue_follow_ups,
        callback_requested,
    ) = await asyncio.gather(
        _db.sales_leads.count_documents(lf),
        _db.sales_leads.count_documents({**lf, "status": {"$in": _status_terms(["new"])}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": CONVERTED_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": NOT_WORKING_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": _status_terms(["under_discussion", "under_process", "call_back_requested", "follow_up_pending"])}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": WORKING_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": NOT_WORKING_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": CONVERTED_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": TRANSFERRED_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "next_follow_up_date": {"$regex": f"^{re.escape(today)}"}}),
        _db.sales_leads.count_documents({**lf, "next_follow_up_date": {"$lt": today}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": _status_terms(["call_back_requested", "call_back"])}}),
    )

    pipeline_counts = {}
    tasks = []
    keys = []
    for s in VALID_LEAD_STATUSES:
        if s == "call_back_requested":
            terms = _status_terms(["call_back_requested", "call_back"])
        elif s == "under_discussion":
            terms = _status_terms(["under_discussion", "contacted"])
        elif s == "under_process":
            terms = _status_terms(["under_process", "trial_booked", "trial_completed"])
        elif s == "follow_up_pending":
            terms = _status_terms(["follow_up_pending", "follow_up"])
        elif s == "converted":
            terms = CONVERTED_STATUS_TERMS
        elif s == "not_interested":
            terms = _status_terms(["not_interested", "lost"])
        else:
            terms = _status_terms([s])
        keys.append(s)
        tasks.append(_db.sales_leads.count_documents({**lf, "status": {"$in": terms}}))
    results = await asyncio.gather(*tasks) if tasks else []
    pipeline_counts = {k: int(v) for k, v in zip(keys, results)}

    src_agg = await _db.sales_leads.aggregate([
        {"$match": lf},
        {"$group": {"_id": "$source", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ]).to_list(20)
    leads_by_source = [{"source": s["_id"] or "UNKNOWN", "count": s["count"]} for s in src_agg]

    can_manage = (kind in ("CSR", "TEAM_LEAD")) or await _check_perm(user, "manager.manage_sales_location")
    scope_lids = []
    try:
        scope_lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
    except Exception:
        scope_lids = []

    return {
        "scope": {
            "kind": kind,
            "staff_id": (staff or {}).get("staff_id"),
            "can_manage": can_manage,
            "allowed_location_ids": scope_lids,
            "location_id": location_id,
        },
        "total_teams": total_teams,
        "total_agents": total_csrs,
        "total_csrs": total_csrs,
        "total_team_leads": total_team_leads,
        "total_leads": total_leads,
        "new_leads": new_leads,
        "won_leads": won_leads,
        "lost_leads": lost_leads,
        "in_progress_leads": in_progress,
        "working_leads": working,
        "not_working_leads": not_working,
        "converted_leads": converted,
        "transferred_leads": transferred,
        "today_follow_ups": today_follow_ups,
        "overdue_follow_ups": overdue_follow_ups,
        "callback_requested": callback_requested,
        "conversion_rate": round((converted / total_leads) * 100, 1) if total_leads > 0 else 0.0,
        "pipeline_counts": pipeline_counts,
        "leads_by_source": leads_by_source,
    }


@router.get("/crm/dashboard")
async def get_crm_dashboard(request: Request, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_view(request)
    lf = await _lead_visibility_query(user, staff, kind, location_id=location_id)
    today = datetime.now(timezone.utc).date().isoformat()
    import asyncio
    (
        total_leads,
        converted,
        transferred,
        working,
        not_working,
        callback_requested,
        duplicates,
        today_callbacks,
        overdue,
        src,
        program,
        plan,
    ) = await asyncio.gather(
        _db.sales_leads.count_documents(lf),
        _db.sales_leads.count_documents({**lf, "status": {"$in": CONVERTED_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": TRANSFERRED_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": WORKING_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": NOT_WORKING_STATUS_TERMS}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": _status_terms(["call_back_requested", "call_back"])}}),
        _db.sales_leads.count_documents({**lf, "status": {"$in": _status_terms(["duplicate"])}}),
        _db.sales_leads.count_documents({**lf, "next_follow_up_date": {"$regex": f"^{re.escape(today)}"}}),
        _db.sales_leads.count_documents({**lf, "next_follow_up_date": {"$lt": today}}),
        _db.sales_leads.aggregate([
            {"$match": lf},
            {"$group": {"_id": "$source", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(20),
        _db.sales_leads.aggregate([
            {"$match": lf},
            {"$group": {"_id": "$program_interest", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(20),
        _db.sales_leads.aggregate([
            {"$match": lf},
            {"$group": {"_id": "$membership_plan", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]).to_list(20),
    )

    can_manage = (kind in ("CSR", "TEAM_LEAD")) or await _check_perm(user, "manager.manage_sales_location")
    scope_lids = []
    try:
        scope_lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
    except Exception:
        scope_lids = []

    by_branch = await _db.sales_leads.aggregate([
        {"$match": lf},
        {"$group": {
            "_id": "$location_id",
            "total_leads": {"$sum": 1},
            "working_leads": {"$sum": {"$cond": [{"$in": ["$status", WORKING_STATUS_TERMS]}, 1, 0]}},
            "not_working_leads": {"$sum": {"$cond": [{"$in": ["$status", NOT_WORKING_STATUS_TERMS]}, 1, 0]}},
            "converted_leads": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
            "transferred_leads": {"$sum": {"$cond": [{"$in": ["$status", TRANSFERRED_STATUS_TERMS]}, 1, 0]}},
        }},
        {"$sort": {"converted_leads": -1, "total_leads": -1}},
    ]).to_list(50)

    by_team_lead = await _db.sales_leads.aggregate([
        {"$match": lf},
        {"$group": {
            "_id": "$assigned_team_lead_staff_id",
            "total_leads": {"$sum": 1},
            "converted_leads": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
        }},
        {"$sort": {"converted_leads": -1, "total_leads": -1}},
    ]).to_list(50)

    by_csr = await _db.sales_leads.aggregate([
        {"$match": lf},
        {"$group": {
            "_id": {"$ifNull": ["$assigned_csr_staff_id", "$assigned_agent_staff_id"]},
            "total_leads": {"$sum": 1},
            "converted_leads": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
        }},
        {"$sort": {"converted_leads": -1, "total_leads": -1}},
    ]).to_list(100)

    loc_ids = list({r["_id"] for r in by_branch if r.get("_id")})
    loc_map = {}
    if loc_ids:
        locs = await _db.locations.find({"location_id": {"$in": loc_ids}}, {"_id": 0, "location_id": 1, "name": 1}).to_list(200)
        loc_map = {l["location_id"]: l.get("name") for l in locs}

    staff_ids = list({r["_id"] for r in by_team_lead if r.get("_id")}.union({r["_id"] for r in by_csr if r.get("_id")}))
    staff_map = {}
    if staff_ids:
        st = await _db.staff.find({"staff_id": {"$in": staff_ids}}, {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1}).to_list(500)
        staff_map = {s["staff_id"]: f"{s.get('first_name','')} {s.get('last_name','')}".strip() for s in st}

    direct = None
    team = None
    branch = None
    if kind == "TEAM_LEAD" and staff and staff.get("staff_id"):
        sid = staff["staff_id"]
        csr_ids = await _csr_ids_reporting_to_team_lead(sid)
        direct_q = {**lf, "$or": [{"assigned_csr_staff_id": sid}, {"assigned_agent_staff_id": sid}]}
        team_q = {**lf, "$or": [{"assigned_csr_staff_id": {"$in": csr_ids}}, {"assigned_agent_staff_id": {"$in": csr_ids}}]} if csr_ids else {**lf, "sales_lead_id": "__none__"}
        direct = {
            "total_leads": await _db.sales_leads.count_documents(direct_q),
            "converted_leads": await _db.sales_leads.count_documents({**direct_q, "status": {"$in": CONVERTED_STATUS_TERMS}}),
        }
        team = {
            "total_leads": await _db.sales_leads.count_documents(team_q),
            "converted_leads": await _db.sales_leads.count_documents({**team_q, "status": {"$in": CONVERTED_STATUS_TERMS}}),
            "csrs_count": len(csr_ids),
        }
        branch_q = dict(lf)
        if scope_lids:
            branch_q["location_id"] = {"$in": scope_lids} if len(scope_lids) > 1 else scope_lids[0]
        branch = {
            "total_leads": await _db.sales_leads.count_documents(branch_q),
            "converted_leads": await _db.sales_leads.count_documents({**branch_q, "status": {"$in": CONVERTED_STATUS_TERMS}}),
        }

    return {
        "scope": {
            "kind": kind,
            "staff_id": (staff or {}).get("staff_id"),
            "can_manage": can_manage,
            "allowed_location_ids": scope_lids,
            "location_id": location_id,
            "combined_mode": bool((staff or {}).get("is_sales") and (staff or {}).get("sales_role") == "TEAM_LEAD"),
        },
        "cards": {
            "total_leads": total_leads,
            "working_leads": working,
            "not_working_leads": not_working,
            "converted_leads": converted,
            "transferred_leads": transferred,
            "conversion_rate": round((converted / total_leads) * 100, 1) if total_leads > 0 else 0.0,
            "callback_requested": callback_requested,
            "today_follow_ups": today_callbacks,
            "overdue_follow_ups": overdue,
            "duplicate_leads": duplicates,
            "direct": direct,
            "team": team,
            "branch": branch,
        },
        "breakdowns": {
            "by_source": [{"source": r["_id"] or "UNKNOWN", "count": r["count"]} for r in src],
            "by_program_interest": [{"program_interest": r["_id"] or "UNKNOWN", "count": r["count"]} for r in program],
            "by_membership_plan": [{"membership_plan": r["_id"] or "UNKNOWN", "count": r["count"]} for r in plan],
            "by_branch": [{
                "location_id": r["_id"],
                "location_name": loc_map.get(r["_id"]) or "Unassigned",
                "total_leads": r["total_leads"],
                "working_leads": r["working_leads"],
                "not_working_leads": r["not_working_leads"],
                "converted_leads": r["converted_leads"],
                "transferred_leads": r["transferred_leads"],
                "conversion_rate": round((r["converted_leads"] / r["total_leads"]) * 100, 1) if r["total_leads"] > 0 else 0.0,
            } for r in by_branch],
            "by_team_lead": [{
                "team_lead_staff_id": r["_id"],
                "team_lead_name": staff_map.get(r["_id"]) or (r["_id"] or "Unassigned"),
                "total_leads": r["total_leads"],
                "converted_leads": r["converted_leads"],
                "conversion_rate": round((r["converted_leads"] / r["total_leads"]) * 100, 1) if r["total_leads"] > 0 else 0.0,
            } for r in by_team_lead],
            "by_csr": [{
                "csr_staff_id": r["_id"],
                "csr_name": staff_map.get(r["_id"]) or (r["_id"] or "Unassigned"),
                "total_leads": r["total_leads"],
                "converted_leads": r["converted_leads"],
                "conversion_rate": round((r["converted_leads"] / r["total_leads"]) * 100, 1) if r["total_leads"] > 0 else 0.0,
            } for r in by_csr],
        },
    }



# ─── Sales Performance Metrics ────────────────────────────────────

@router.get("/performance")
async def get_sales_performance(
    request: Request,
    location_id: Optional[str] = None,
    team_id: Optional[str] = None,
    agent_staff_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """
    Aggregation endpoint for sales performance metrics.
    Returns per-agent stats and summary totals.
    - Owner: can filter by location_id, team_id, agent_staff_id
    - Manager: automatically scoped to their location_id (server-enforced)
    """
    user, staff, kind = await _require_crm_view(request)
    lead_filter = await _lead_visibility_query(user, staff, kind, location_id=location_id)

    # Apply team filter
    if team_id:
        lead_filter["assigned_team_id"] = team_id

    # Apply agent filter
    if agent_staff_id:
        extra = {"$or": [{"assigned_csr_staff_id": agent_staff_id}, {"assigned_agent_staff_id": agent_staff_id}]}
        if "$and" in lead_filter and isinstance(lead_filter.get("$and"), list):
            lead_filter["$and"].append(extra)
        else:
            lead_filter = {"$and": [lead_filter, extra]}

    # Apply date range filter (on created_at)
    if date_from:
        lead_filter.setdefault("created_at", {})["$gte"] = date_from
    if date_to:
        lead_filter.setdefault("created_at", {})["$lte"] = date_to

    # 1. Aggregate per-agent stats
    today = datetime.now(timezone.utc).date().isoformat()
    agent_pipeline = [
        {"$match": lead_filter},
        {"$group": {
            "_id": {"$ifNull": ["$assigned_csr_staff_id", "$assigned_agent_staff_id"]},
            "total_leads": {"$sum": 1},
            "new_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["new"])]}, 1, 0]}},
            "discussion_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["under_discussion", "contacted"])]}, 1, 0]}},
            "process_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["under_process", "trial_booked", "trial_completed"])]}, 1, 0]}},
            "callback_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["call_back_requested", "call_back"])]}, 1, 0]}},
            "follow_up_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["follow_up_pending", "follow_up"])]}, 1, 0]}},
            "no_response_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["no_response"])]}, 1, 0]}},
            "duplicate_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["duplicate"])]}, 1, 0]}},
            "canceled_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["canceled"])]}, 1, 0]}},
            "not_interested_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["not_interested", "lost"])]}, 1, 0]}},
            "converted_count": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
            "transferred_count": {"$sum": {"$cond": [{"$in": ["$status", TRANSFERRED_STATUS_TERMS]}, 1, 0]}},
            "today_followups": {"$sum": {"$cond": [{"$regexMatch": {"input": {"$ifNull": ["$next_follow_up_date", ""]}, "regex": f"^{re.escape(today)}"}}, 1, 0]}},
            "overdue_followups": {"$sum": {"$cond": [{"$lt": ["$next_follow_up_date", today]}, 1, 0]}},
            "total_membership_value": {"$sum": {"$cond": [
                {"$in": ["$status", CONVERTED_STATUS_TERMS]},
                {"$ifNull": ["$membership_price", 0]},
                0
            ]}},
            "last_activity": {"$max": "$updated_at"},
        }},
        {"$sort": {"converted_count": -1, "total_leads": -1}}
    ]

    agent_results = await _db.sales_leads.aggregate(agent_pipeline).to_list(500)

    # Enrich with staff details
    agent_stats = []
    for row in agent_results:
        staff_id = row["_id"]
        staff_info = None
        team_info = None

        if staff_id:
            staff_doc = await _db.staff.find_one(
                {"staff_id": staff_id},
                {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1, "email": 1, "sales_role": 1}
            )
            if staff_doc:
                staff_info = staff_doc

            # Get agent's team info
            membership = await _db.sales_team_members.find_one(
                {"staff_id": staff_id, "is_active": True},
                {"_id": 0, "sales_team_id": 1}
            )
            if membership:
                team_doc = await _db.sales_teams.find_one(
                    {"sales_team_id": membership["sales_team_id"]},
                    {"_id": 0, "sales_team_id": 1, "name": 1, "location_id": 1}
                )
                if team_doc:
                    loc_doc = await _db.locations.find_one(
                        {"location_id": team_doc["location_id"]},
                        {"_id": 0, "name": 1}
                    )
                    team_info = {
                        "sales_team_id": team_doc["sales_team_id"],
                        "name": team_doc["name"],
                        "location_name": loc_doc["name"] if loc_doc else "Unknown"
                    }

        total = row["total_leads"]
        won = row["converted_count"]
        conversion_rate = round((won / total) * 100, 1) if total > 0 else 0.0

        agent_stats.append({
            "agent_staff_id": staff_id,
            "agent": staff_info,
            "team": team_info,
            "total_leads": total,
            "leads_by_status": {
                "new": row["new_count"],
                "under_discussion": row["discussion_count"],
                "under_process": row["process_count"],
                "call_back_requested": row["callback_count"],
                "follow_up_pending": row["follow_up_count"],
                "no_response": row["no_response_count"],
                "duplicate": row["duplicate_count"],
                "canceled": row["canceled_count"],
                "not_interested": row["not_interested_count"],
                "converted": row["converted_count"],
                "transferred": row["transferred_count"],
            },
            "leads_by_status_v2": {
                "new": row["new_count"],
                "under_discussion": row["discussion_count"],
                "under_process": row["process_count"],
                "call_back_requested": row["callback_count"],
                "follow_up_pending": row["follow_up_count"],
                "no_response": row["no_response_count"],
                "duplicate": row["duplicate_count"],
                "canceled": row["canceled_count"],
                "not_interested": row["not_interested_count"],
                "converted": row["converted_count"],
                "transferred": row["transferred_count"],
            },
            "conversion_rate": conversion_rate,
            "memberships_sold_count": won,
            "memberships_total_value": row["total_membership_value"],
            "last_activity_date": row["last_activity"],
            "working_leads": row["new_count"] + row["discussion_count"] + row["process_count"] + row["callback_count"] + row["follow_up_count"],
            "not_working_leads": row["no_response_count"] + row["duplicate_count"] + row["canceled_count"] + row["not_interested_count"],
            "converted_leads": row["converted_count"],
            "transferred_leads": row["transferred_count"],
            "today_follow_ups": row["today_followups"],
            "overdue_follow_ups": row["overdue_followups"],
        })

    # 2. Summary totals
    summary_pipeline = [
        {"$match": lead_filter},
        {"$group": {
            "_id": None,
            "total_leads": {"$sum": 1},
            "new_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["new"])]}, 1, 0]}},
            "discussion_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["under_discussion", "contacted"])]}, 1, 0]}},
            "process_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["under_process", "trial_booked", "trial_completed"])]}, 1, 0]}},
            "callback_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["call_back_requested", "call_back"])]}, 1, 0]}},
            "follow_up_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["follow_up_pending", "follow_up"])]}, 1, 0]}},
            "no_response_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["no_response"])]}, 1, 0]}},
            "duplicate_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["duplicate"])]}, 1, 0]}},
            "canceled_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["canceled"])]}, 1, 0]}},
            "not_interested_count": {"$sum": {"$cond": [{"$in": ["$status", _status_terms(["not_interested", "lost"])]}, 1, 0]}},
            "converted_count": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
            "transferred_count": {"$sum": {"$cond": [{"$in": ["$status", TRANSFERRED_STATUS_TERMS]}, 1, 0]}},
            "today_followups": {"$sum": {"$cond": [{"$regexMatch": {"input": {"$ifNull": ["$next_follow_up_date", ""]}, "regex": f"^{re.escape(today)}"}}, 1, 0]}},
            "overdue_followups": {"$sum": {"$cond": [{"$lt": ["$next_follow_up_date", today]}, 1, 0]}},
            "total_membership_value": {"$sum": {"$cond": [
                {"$in": ["$status", CONVERTED_STATUS_TERMS]},
                {"$ifNull": ["$membership_price", 0]},
                0
            ]}},
        }}
    ]
    summary_result = await _db.sales_leads.aggregate(summary_pipeline).to_list(1)

    if summary_result:
        s = summary_result[0]
        total = s["total_leads"]
        won = s["converted_count"]
        summary = {
            "total_leads": total,
            "leads_by_status": {
                "new": s["new_count"],
                "under_discussion": s["discussion_count"],
                "under_process": s["process_count"],
                "call_back_requested": s["callback_count"],
                "follow_up_pending": s["follow_up_count"],
                "no_response": s["no_response_count"],
                "duplicate": s["duplicate_count"],
                "canceled": s["canceled_count"],
                "not_interested": s["not_interested_count"],
                "converted": s["converted_count"],
                "transferred": s["transferred_count"],
            },
            "leads_by_status_v2": {
                "new": s["new_count"],
                "under_discussion": s["discussion_count"],
                "under_process": s["process_count"],
                "call_back_requested": s["callback_count"],
                "follow_up_pending": s["follow_up_count"],
                "no_response": s["no_response_count"],
                "duplicate": s["duplicate_count"],
                "canceled": s["canceled_count"],
                "not_interested": s["not_interested_count"],
                "converted": s["converted_count"],
                "transferred": s["transferred_count"],
            },
            "conversion_rate": round((won / total) * 100, 1) if total > 0 else 0.0,
            "memberships_sold_count": won,
            "memberships_total_value": s["total_membership_value"],
            "working_leads": s["new_count"] + s["discussion_count"] + s["process_count"] + s["callback_count"] + s["follow_up_count"],
            "not_working_leads": s["no_response_count"] + s["duplicate_count"] + s["canceled_count"] + s["not_interested_count"],
            "converted_leads": s["converted_count"],
            "transferred_leads": s["transferred_count"],
            "today_follow_ups": s["today_followups"],
            "overdue_follow_ups": s["overdue_followups"],
        }
    else:
        summary = {
            "total_leads": 0,
            "leads_by_status": {st: 0 for st in VALID_LEAD_STATUSES},
            "conversion_rate": 0.0,
            "memberships_sold_count": 0,
            "memberships_total_value": 0,
        }

    # 3. Per-team aggregation
    team_pipeline = [
        {"$match": lead_filter},
        {"$group": {
            "_id": "$assigned_team_id",
            "total_leads": {"$sum": 1},
            "won_count": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
            "lost_count": {"$sum": {"$cond": [{"$in": ["$status", NOT_WORKING_STATUS_TERMS]}, 1, 0]}},
            "total_membership_value": {"$sum": {"$cond": [
                {"$in": ["$status", CONVERTED_STATUS_TERMS]},
                {"$ifNull": ["$membership_price", 0]},
                0
            ]}},
        }},
        {"$sort": {"won_count": -1}}
    ]
    team_results = await _db.sales_leads.aggregate(team_pipeline).to_list(100)

    team_stats = []
    for row in team_results:
        team_id_val = row["_id"]
        team_info = None
        if team_id_val:
            team_doc = await _db.sales_teams.find_one(
                {"sales_team_id": team_id_val},
                {"_id": 0, "sales_team_id": 1, "name": 1, "location_id": 1}
            )
            if team_doc:
                loc_doc = await _db.locations.find_one(
                    {"location_id": team_doc["location_id"]},
                    {"_id": 0, "name": 1}
                )
                team_info = {
                    "sales_team_id": team_doc["sales_team_id"],
                    "name": team_doc["name"],
                    "location_name": loc_doc["name"] if loc_doc else "Unknown"
                }

        total = row["total_leads"]
        won = row["won_count"]
        team_stats.append({
            "team_id": team_id_val,
            "team": team_info,
            "total_leads": total,
            "won_count": won,
            "lost_count": row["lost_count"],
            "conversion_rate": round((won / total) * 100, 1) if total > 0 else 0.0,
            "memberships_total_value": row["total_membership_value"],
        })

    branch_pipeline = [
        {"$match": lead_filter},
        {"$group": {
            "_id": "$location_id",
            "total_leads": {"$sum": 1},
            "working_count": {"$sum": {"$cond": [{"$in": ["$status", WORKING_STATUS_TERMS]}, 1, 0]}},
            "not_working_count": {"$sum": {"$cond": [{"$in": ["$status", NOT_WORKING_STATUS_TERMS]}, 1, 0]}},
            "converted_count": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
            "transferred_count": {"$sum": {"$cond": [{"$in": ["$status", TRANSFERRED_STATUS_TERMS]}, 1, 0]}},
            "total_value": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, {"$ifNull": ["$membership_price", 0]}, 0]}},
        }},
        {"$sort": {"converted_count": -1, "total_leads": -1}},
    ]
    branch_rows = await _db.sales_leads.aggregate(branch_pipeline).to_list(200)
    loc_ids = [r["_id"] for r in branch_rows if r.get("_id")]
    loc_map = {}
    if loc_ids:
        locs = await _db.locations.find({"location_id": {"$in": loc_ids}}, {"_id": 0, "location_id": 1, "name": 1}).to_list(500)
        loc_map = {l["location_id"]: l.get("name") for l in locs}
    branch_stats = []
    for r in branch_rows:
        lid = r.get("_id")
        total = r.get("total_leads") or 0
        conv = r.get("converted_count") or 0
        branch_stats.append({
            "location_id": lid,
            "location_name": loc_map.get(lid) or "Unassigned",
            "total_leads": total,
            "working_leads": r.get("working_count") or 0,
            "not_working_leads": r.get("not_working_count") or 0,
            "converted_leads": conv,
            "transferred_leads": r.get("transferred_count") or 0,
            "conversion_rate": round((conv / total) * 100, 1) if total > 0 else 0.0,
            "memberships_total_value": r.get("total_value") or 0,
        })

    team_lead_pipeline = [
        {"$match": lead_filter},
        {"$group": {
            "_id": "$assigned_team_lead_staff_id",
            "total_leads": {"$sum": 1},
            "working_count": {"$sum": {"$cond": [{"$in": ["$status", WORKING_STATUS_TERMS]}, 1, 0]}},
            "not_working_count": {"$sum": {"$cond": [{"$in": ["$status", NOT_WORKING_STATUS_TERMS]}, 1, 0]}},
            "converted_count": {"$sum": {"$cond": [{"$in": ["$status", CONVERTED_STATUS_TERMS]}, 1, 0]}},
            "transferred_count": {"$sum": {"$cond": [{"$in": ["$status", TRANSFERRED_STATUS_TERMS]}, 1, 0]}},
        }},
        {"$sort": {"converted_count": -1, "total_leads": -1}},
    ]
    tl_rows = await _db.sales_leads.aggregate(team_lead_pipeline).to_list(500)
    tl_ids = [r["_id"] for r in tl_rows if r.get("_id")]
    tl_map = {}
    if tl_ids:
        sdocs = await _db.staff.find({"staff_id": {"$in": tl_ids}}, {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1}).to_list(500)
        tl_map = {s["staff_id"]: f"{s.get('first_name','')} {s.get('last_name','')}".strip() for s in sdocs}
    team_lead_stats = []
    for r in tl_rows:
        sid = r.get("_id")
        total = r.get("total_leads") or 0
        conv = r.get("converted_count") or 0
        team_lead_stats.append({
            "team_lead_staff_id": sid,
            "team_lead_name": tl_map.get(sid),
            "total_leads": total,
            "working_leads": r.get("working_count") or 0,
            "not_working_leads": r.get("not_working_count") or 0,
            "converted_leads": conv,
            "transferred_leads": r.get("transferred_count") or 0,
            "conversion_rate": round((conv / total) * 100, 1) if total > 0 else 0.0,
        })

    scope_lids = []
    try:
        scope_lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
    except Exception:
        scope_lids = []

    direct = None
    team = None
    branch = None
    if kind == "TEAM_LEAD" and staff and staff.get("staff_id"):
        sid = staff["staff_id"]
        csr_ids = await _csr_ids_reporting_to_team_lead(sid)
        direct_q = {**(await _lead_visibility_query(user, staff, kind, location_id=location_id)), "$or": [{"assigned_csr_staff_id": sid}, {"assigned_agent_staff_id": sid}]}
        team_q = {**(await _lead_visibility_query(user, staff, kind, location_id=location_id)), "$or": [{"assigned_csr_staff_id": {"$in": csr_ids}}, {"assigned_agent_staff_id": {"$in": csr_ids}}]} if csr_ids else {**(await _lead_visibility_query(user, staff, kind, location_id=location_id)), "sales_lead_id": "__none__"}
        direct = {
            "total_leads": await _db.sales_leads.count_documents(direct_q),
            "converted_leads": await _db.sales_leads.count_documents({**direct_q, "status": {"$in": CONVERTED_STATUS_TERMS}}),
        }
        team = {
            "total_leads": await _db.sales_leads.count_documents(team_q),
            "converted_leads": await _db.sales_leads.count_documents({**team_q, "status": {"$in": CONVERTED_STATUS_TERMS}}),
            "csrs_count": len(csr_ids),
        }
        branch_q = await _lead_visibility_query(user, staff, kind, location_id=location_id)
        if scope_lids:
            branch_q["location_id"] = {"$in": scope_lids} if len(scope_lids) > 1 else scope_lids[0]
        branch = {
            "total_leads": await _db.sales_leads.count_documents(branch_q),
            "converted_leads": await _db.sales_leads.count_documents({**branch_q, "status": {"$in": CONVERTED_STATUS_TERMS}}),
        }

    return {
        "scope": {"kind": kind, "staff_id": (staff or {}).get("staff_id"), "allowed_location_ids": scope_lids},
        "combined": {"direct": direct, "team": team, "branch": branch},
        "summary": summary,
        "agent_stats": agent_stats,
        "team_stats": team_stats,
        "branch_stats": branch_stats,
        "team_lead_stats": team_lead_stats,
        "filters_applied": {
            "location_id": location_id,
            "team_id": team_id,
            "agent_staff_id": agent_staff_id,
            "date_from": date_from,
            "date_to": date_to,
        }
    }


@router.get("/crm/conversions")
async def get_crm_conversions(
    request: Request,
    location_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    user, staff, kind = await _require_crm_view(request)
    lf = await _lead_visibility_query(user, staff, kind, location_id=location_id)
    lf["status"] = {"$in": CONVERTED_STATUS_TERMS}
    if date_from:
        lf.setdefault("converted_at", {})["$gte"] = date_from
    if date_to:
        lf.setdefault("converted_at", {})["$lte"] = date_to

    groups = await _db.sales_leads.aggregate([
        {"$match": lf},
        {"$group": {
            "_id": {
                "location_id": "$location_id",
                "csr_staff_id": {"$ifNull": ["$assigned_csr_staff_id", "$assigned_agent_staff_id"]},
                "team_lead_staff_id": "$assigned_team_lead_staff_id",
                "source": "$source",
                "source_platform": "$source_platform",
                "campaign_name": "$campaign_name",
                "adset_or_adgroup": "$adset_or_adgroup",
                "source_reference": "$source_reference",
                "program_interest": "$program_interest",
                "membership_plan": "$membership_plan",
            },
            "count": {"$sum": 1},
            "total_value": {"$sum": {"$ifNull": ["$membership_price", 0]}},
        }},
        {"$sort": {"count": -1}},
    ]).to_list(500)

    loc_ids = list({g["_id"]["location_id"] for g in groups if g["_id"].get("location_id")})
    staff_ids = list({g["_id"]["csr_staff_id"] for g in groups if g["_id"].get("csr_staff_id")}.union({g["_id"]["team_lead_staff_id"] for g in groups if g["_id"].get("team_lead_staff_id")}))

    loc_map = {}
    if loc_ids:
        locs = await _db.locations.find({"location_id": {"$in": loc_ids}}, {"_id": 0, "location_id": 1, "name": 1}).to_list(500)
        loc_map = {l["location_id"]: l.get("name") for l in locs}

    staff_map = {}
    if staff_ids:
        st = await _db.staff.find({"staff_id": {"$in": staff_ids}}, {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1}).to_list(500)
        staff_map = {s["staff_id"]: f"{s.get('first_name','')} {s.get('last_name','')}".strip() for s in st}

    rows = []
    for g in groups:
        key = g["_id"]
        rows.append({
            "location_id": key.get("location_id"),
            "location_name": loc_map.get(key.get("location_id")) or "Unassigned",
            "csr_staff_id": key.get("csr_staff_id"),
            "csr_name": staff_map.get(key.get("csr_staff_id")),
            "team_lead_staff_id": key.get("team_lead_staff_id"),
            "team_lead_name": staff_map.get(key.get("team_lead_staff_id")),
            "source": key.get("source") or "UNKNOWN",
            "source_platform": (key.get("source_platform") or "").upper() or "",
            "campaign_name": key.get("campaign_name") or "",
            "adset_or_adgroup": key.get("adset_or_adgroup") or "",
            "source_reference": key.get("source_reference") or "",
            "program_interest": key.get("program_interest") or "",
            "membership_plan": key.get("membership_plan") or "",
            "converted_count": g["count"],
            "total_value": g.get("total_value") or 0,
        })

    return {"scope": {"kind": kind}, "rows": rows}


@router.get("/identity/check")
async def crm_identity_check(request: Request, email: Optional[str] = None, phone: Optional[str] = None, location_id: Optional[str] = None):
    user, staff, kind = await _require_crm_view(request)
    email_norm = _norm_email(email)
    phone_norm = _norm_phone(phone)

    member = await _find_member_by_email_phone(email_norm, phone_norm)

    lf = await _lead_visibility_query(user, staff, kind, location_id=location_id)
    or_terms = []
    if email_norm:
        or_terms.append({"email_norm": email_norm})
    if phone_norm:
        or_terms.append({"phone_norm": phone_norm})
    lead = await _db.sales_leads.find_one({**lf, "$or": or_terms} if or_terms else {**lf, "sales_lead_id": "__none__"}, {"_id": 0})

    if lead and lead.get("assigned_team_id") and not lead.get("assigned_team_lead_staff_id"):
        t = await _db.sales_teams.find_one({"sales_team_id": lead.get("assigned_team_id")}, {"_id": 0, "team_lead_staff_id": 1})
        lead["assigned_team_lead_staff_id"] = (t or {}).get("team_lead_staff_id")

    csr_id = None
    csr_name = None
    if lead:
        csr_id = lead.get("assigned_csr_staff_id") or lead.get("assigned_agent_staff_id")
        if csr_id:
            s = await _db.staff.find_one({"staff_id": csr_id}, {"_id": 0, "first_name": 1, "last_name": 1})
            csr_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None

    tl_id = lead.get("assigned_team_lead_staff_id") if lead else None
    tl_name = None
    if tl_id:
        s = await _db.staff.find_one({"staff_id": tl_id}, {"_id": 0, "first_name": 1, "last_name": 1})
        tl_name = f"{s.get('first_name','')} {s.get('last_name','')}".strip() if s else None

    lead_loc_name = None
    if lead and lead.get("location_id"):
        loc = await _db.locations.find_one({"location_id": lead.get("location_id")}, {"_id": 0, "name": 1})
        lead_loc_name = (loc or {}).get("name") or None

    member_loc_name = None
    member_attr = None
    if member and member.get("location_id"):
        loc = await _db.locations.find_one({"location_id": member.get("location_id")}, {"_id": 0, "name": 1})
        member_loc_name = (loc or {}).get("name") or None
        sa = member.get("sales_attribution") or {}
        member_attr = {
            "csr_staff_id": sa.get("csr_staff_id"),
            "team_lead_staff_id": sa.get("team_lead_staff_id"),
            "source": sa.get("source"),
            "source_platform": sa.get("source_platform"),
            "campaign_name": sa.get("campaign_name"),
            "source_reference": sa.get("source_reference"),
        } if sa else None

    return {
        "member": {
            "member_id": (member or {}).get("member_id"),
            "member_name": (member or {}).get("full_name"),
            "location_id": (member or {}).get("location_id"),
            "location_name": member_loc_name,
            "sales_attribution": member_attr,
        } if member else None,
        "lead": {
            "sales_lead_id": (lead or {}).get("sales_lead_id"),
            "location_id": (lead or {}).get("location_id"),
            "location_name": lead_loc_name,
            "status": _norm_status((lead or {}).get("status")),
            "csr_staff_id": csr_id,
            "csr_name": csr_name,
            "team_lead_staff_id": tl_id,
            "team_lead_name": tl_name,
        } if lead else None,
    }



# ─── Sales Revenue Reporting ──────────────────────────────────────

@router.get("/revenue")
async def get_sales_revenue(
    request: Request,
    location_id: Optional[str] = None,
    team_id: Optional[str] = None,
    agent_staff_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    """
    Get sales revenue data from WON leads.
    Returns both individual transactions and aggregated summaries.
    RBAC: Owner sees all, Manager sees their location only.
    """
    user, staff, kind = await _require_crm_view(request)
    k = (kind or "").upper()

    rev_filter: Dict[str, Any] = {}
    allowed_lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=location_id)
    if allowed_lids:
        rev_filter["location_id"] = {"$in": allowed_lids} if len(allowed_lids) > 1 else allowed_lids[0]

    if k == "CSR":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        sid = staff["staff_id"]
        rev_filter["$or"] = [{"metadata.csr_staff_id": sid}, {"metadata.agent_staff_id": sid}]

    if k == "TEAM_LEAD":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        sid = staff["staff_id"]
        csr_ids = await _csr_ids_reporting_to_team_lead(sid)
        csr_ids = list(set(csr_ids + [sid]))
        rev_filter["$or"] = [
            {"metadata.team_lead_staff_id": sid},
            {"metadata.csr_staff_id": {"$in": csr_ids}},
            {"metadata.agent_staff_id": {"$in": csr_ids}},
        ]

    # Apply filters
    if team_id:
        rev_filter["metadata.team_id"] = team_id
    if agent_staff_id:
        rev_filter["$and"] = [*(rev_filter.get("$and") or []), {"$or": [{"metadata.csr_staff_id": agent_staff_id}, {"metadata.agent_staff_id": agent_staff_id}]}]
    if date_from:
        rev_filter.setdefault("created_at", {})["$gte"] = date_from
    if date_to:
        rev_filter.setdefault("created_at", {})["$lte"] = date_to

    # Get recent transactions
    transactions = await _db.sales_revenue.find(
        rev_filter,
        {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)

    # Aggregate totals
    agg_pipeline = [
        {"$match": rev_filter},
        {"$group": {
            "_id": None,
            "total_revenue": {"$sum": "$amount"},
            "transaction_count": {"$sum": 1},
            "avg_transaction": {"$avg": "$amount"},
        }}
    ]
    agg_result = await _db.sales_revenue.aggregate(agg_pipeline).to_list(1)

    summary = {
        "total_revenue": 0,
        "transaction_count": 0,
        "avg_transaction": 0,
    }
    if agg_result:
        summary = {
            "total_revenue": agg_result[0].get("total_revenue", 0),
            "transaction_count": agg_result[0].get("transaction_count", 0),
            "avg_transaction": round(agg_result[0].get("avg_transaction", 0), 2),
        }

    # Per-location breakdown
    location_pipeline = [
        {"$match": rev_filter},
        {"$group": {
            "_id": "$location_id",
            "location_name": {"$first": "$location_name"},
            "total_revenue": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total_revenue": -1}}
    ]
    location_breakdown = await _db.sales_revenue.aggregate(location_pipeline).to_list(50)

    # Per-agent breakdown
    agent_pipeline = [
        {"$match": rev_filter},
        {"$group": {
            "_id": {"$ifNull": ["$metadata.csr_staff_id", "$metadata.agent_staff_id"]},
            "agent_name": {"$first": "$metadata.agent_name"},
            "total_revenue": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total_revenue": -1}}
    ]
    agent_breakdown = await _db.sales_revenue.aggregate(agent_pipeline).to_list(50)

    # Per-team-lead breakdown
    team_lead_breakdown = await _db.sales_revenue.aggregate([
        {"$match": rev_filter},
        {"$group": {
            "_id": "$metadata.team_lead_staff_id",
            "total_revenue": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total_revenue": -1}},
    ]).to_list(50)

    # Source/campaign breakdown
    source_breakdown = await _db.sales_revenue.aggregate([
        {"$match": rev_filter},
        {"$group": {
            "_id": {
                "source": "$source",
                "source_platform": "$metadata.source_platform",
                "campaign_name": "$metadata.campaign_name",
                "adset_or_adgroup": "$metadata.adset_or_adgroup",
                "source_reference": "$metadata.source_reference",
            },
            "total_revenue": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"total_revenue": -1}},
    ]).to_list(100)

    # Monthly trend (last 12 months)
    monthly_pipeline = [
        {"$match": rev_filter},
        {"$addFields": {
            "month": {"$substr": ["$created_at", 0, 7]}  # "YYYY-MM"
        }},
        {"$group": {
            "_id": "$month",
            "total_revenue": {"$sum": "$amount"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": -1}},
        {"$limit": 12}
    ]
    monthly_trend = await _db.sales_revenue.aggregate(monthly_pipeline).to_list(12)

    staff_ids = list({r["_id"] for r in agent_breakdown if r.get("_id")}.union({r["_id"] for r in team_lead_breakdown if r.get("_id")}))
    staff_map = {}
    if staff_ids:
        st = await _db.staff.find({"staff_id": {"$in": staff_ids}}, {"_id": 0, "staff_id": 1, "first_name": 1, "last_name": 1}).to_list(500)
        staff_map = {s["staff_id"]: f"{s.get('first_name','')} {s.get('last_name','')}".strip() for s in st}

    return {
        "scope": {"kind": kind, "staff_id": (staff or {}).get("staff_id"), "allowed_location_ids": allowed_lids},
        "summary": summary,
        "transactions": transactions,
        "by_location": [
            {
                "location_id": r["_id"],
                "location_name": r.get("location_name", "Unknown"),
                "total_revenue": r["total_revenue"],
                "transaction_count": r["count"],
            }
            for r in location_breakdown
        ],
        "by_csr": [
            {
                "agent_staff_id": r["_id"],
                "agent_name": staff_map.get(r["_id"]) or r.get("agent_name", "Unassigned"),
                "total_revenue": r["total_revenue"],
                "transaction_count": r["count"],
            }
            for r in agent_breakdown
        ],
        "by_team_lead": [
            {
                "team_lead_staff_id": r["_id"],
                "team_lead_name": staff_map.get(r["_id"]) or (r["_id"] or "Unassigned"),
                "total_revenue": r["total_revenue"],
                "transaction_count": r["count"],
            }
            for r in team_lead_breakdown
        ],
        "by_source_campaign": [
            {
                "source": (r["_id"].get("source") or "UNKNOWN"),
                "source_platform": (r["_id"].get("source_platform") or "").upper() or "",
                "campaign_name": r["_id"].get("campaign_name") or "",
                "adset_or_adgroup": r["_id"].get("adset_or_adgroup") or "",
                "source_reference": r["_id"].get("source_reference") or "",
                "total_revenue": r["total_revenue"],
                "transaction_count": r["count"],
            }
            for r in source_breakdown
        ],
        "monthly_trend": [
            {
                "month": r["_id"],
                "total_revenue": r["total_revenue"],
                "transaction_count": r["count"],
            }
            for r in monthly_trend
        ],
        "filters_applied": {
            "location_id": location_id,
            "team_id": team_id,
            "agent_staff_id": agent_staff_id,
            "date_from": date_from,
            "date_to": date_to,
        }
    }


@router.get("/revenue/summary")
async def get_sales_revenue_summary(request: Request):
    """
    Quick summary of sales revenue for dashboard cards.
    RBAC: Owner sees all, Manager sees their location only.
    """
    user, staff, kind = await _require_crm_view(request)
    allowed_lids = await _allowed_location_ids_for_actor(user, staff, kind, requested_location_id=None)
    rev_filter: Dict[str, Any] = {"location_id": {"$in": allowed_lids}} if len(allowed_lids) > 1 else {"location_id": allowed_lids[0]}

    k = (kind or "").upper()
    if k == "CSR":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        sid = staff["staff_id"]
        rev_filter["$or"] = [{"metadata.csr_staff_id": sid}, {"metadata.agent_staff_id": sid}]
    if k == "TEAM_LEAD":
        if not staff or not staff.get("staff_id"):
            raise HTTPException(403, "Sales staff record not found")
        sid = staff["staff_id"]
        csr_ids = await _csr_ids_reporting_to_team_lead(sid)
        csr_ids = list(set(csr_ids + [sid]))
        rev_filter["$or"] = [
            {"metadata.team_lead_staff_id": sid},
            {"metadata.csr_staff_id": {"$in": csr_ids}},
            {"metadata.agent_staff_id": {"$in": csr_ids}},
        ]

    # Aggregate totals
    agg_result = await _db.sales_revenue.aggregate([
        {"$match": rev_filter},
        {"$group": {
            "_id": None,
            "total_revenue": {"$sum": "$amount"},
            "transaction_count": {"$sum": 1},
        }}
    ]).to_list(1)

    # This month's revenue
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    month_filter = {**rev_filter, "created_at": {"$gte": month_start}}
    month_result = await _db.sales_revenue.aggregate([
        {"$match": month_filter},
        {"$group": {
            "_id": None,
            "month_revenue": {"$sum": "$amount"},
            "month_count": {"$sum": 1},
        }}
    ]).to_list(1)

    return {
        "total_revenue": agg_result[0].get("total_revenue", 0) if agg_result else 0,
        "total_transactions": agg_result[0].get("transaction_count", 0) if agg_result else 0,
        "this_month_revenue": month_result[0].get("month_revenue", 0) if month_result else 0,
        "this_month_transactions": month_result[0].get("month_count", 0) if month_result else 0,
    }
