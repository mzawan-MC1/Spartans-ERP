import re
from typing import Optional, Dict, Any


def norm_email(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def norm_phone(value: Optional[str]) -> str:
    s = (value or "").strip()
    if not s:
        return ""
    return "".join(ch for ch in s if ch.isdigit())


async def find_member_by_email_phone(db, email_norm: str, phone_norm: str) -> Optional[dict]:
    if email_norm:
        m = await db.members.find_one({"email_norm": email_norm}, {"_id": 0})
        if m:
            return m
    if email_norm:
        m = await db.members.find_one({"email": {"$regex": f"^{re.escape(email_norm)}$", "$options": "i"}}, {"_id": 0})
        if m:
            return m
    if phone_norm:
        m = await db.members.find_one({"phone_norm": phone_norm}, {"_id": 0})
        if m:
            return m
    if phone_norm:
        m = await db.members.find_one({"phone": phone_norm}, {"_id": 0})
        if m:
            return m
    return None


async def find_lead_by_email_phone(
    db,
    email_norm: str,
    phone_norm: str,
    *,
    location_scope: Optional[Dict[str, Any]] = None,
) -> Optional[dict]:
    or_terms = []
    if email_norm:
        or_terms.append({"email_norm": email_norm})
    if phone_norm:
        or_terms.append({"phone_norm": phone_norm})
    if not or_terms:
        return None
    query: Dict[str, Any] = {
        "$or": or_terms,
        "$and": [
            {"is_merged": {"$ne": True}},
            {"$or": [{"is_active": True}, {"is_active": {"$exists": False}}]},
        ],
    }
    if location_scope:
        query.update(location_scope)
    return await db.sales_leads.find_one(query, {"_id": 0})

