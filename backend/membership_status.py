from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from dateutil.relativedelta import relativedelta


SUCCESS_PAYMENT_STATUSES = {"paid", "approved", "completed"}
NON_ACTIVE_PAYMENT_STATUSES = {"pending", "cancelled", "canceled", "declined", "failed", "expired"}


def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()


def parse_date_ymd(value: Optional[str]):
    v = (value or "").strip()
    if len(v) >= 10:
        v = v[:10]
    if not v:
        return None
    try:
        return datetime.fromisoformat(v).date()
    except Exception:
        return None


def normalize_billing_cycle(value: Optional[str]) -> str:
    v = (value or "").strip().lower()
    if v == "quarterly":
        return "3 months"
    if v in ("annual",):
        return "yearly"
    return v or "monthly"


def calc_end_date(start_date: str, billing_cycle: str) -> str:
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    end = start
    cycle = normalize_billing_cycle(billing_cycle)
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


def compute_effective_membership_status(
    membership: dict,
    *,
    now: Optional[datetime] = None,
    has_success_payment: bool = False,
    latest_payment_status: Optional[str] = None,
) -> str:
    now_dt = now or datetime.now(timezone.utc)
    stored = _norm(membership.get("status"))

    if stored in {"cancelled"}:
        return stored

    start = parse_date_ymd(membership.get("start_date"))
    end = parse_date_ymd(membership.get("end_date"))
    today = now_dt.date()

    if not start or not end:
        return stored or "pending"

    if today < start:
        return "pending"

    if today > end:
        if membership.get("auto_renew"):
            return "past_due"
        return "expired"

    if has_success_payment:
        return "active"

    if _norm(latest_payment_status) in SUCCESS_PAYMENT_STATUSES:
        return "active"

    if stored == "active":
        return "pending"

    return stored or "pending"

