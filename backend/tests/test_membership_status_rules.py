from datetime import datetime, timezone

from membership_status import compute_effective_membership_status


def test_manual_membership_expires_after_end_date():
    ms = {
        "status": "active",
        "start_date": "2026-03-01",
        "end_date": "2026-03-30",
        "auto_renew": False,
    }
    now = datetime(2026, 4, 9, tzinfo=timezone.utc)
    assert compute_effective_membership_status(ms, now=now, has_success_payment=True) == "expired"


def test_auto_renew_membership_past_due_after_end_date():
    ms = {
        "status": "active",
        "start_date": "2026-03-01",
        "end_date": "2026-03-30",
        "auto_renew": True,
    }
    now = datetime(2026, 4, 9, tzinfo=timezone.utc)
    assert compute_effective_membership_status(ms, now=now, has_success_payment=True) == "past_due"


def test_unpaid_membership_not_active_even_within_period():
    ms = {
        "status": "active",
        "start_date": "2026-04-01",
        "end_date": "2026-05-01",
        "auto_renew": False,
    }
    now = datetime(2026, 4, 9, tzinfo=timezone.utc)
    assert compute_effective_membership_status(ms, now=now, has_success_payment=False, latest_payment_status="failed") == "pending"


def test_paid_membership_active_within_period():
    ms = {
        "status": "pending",
        "start_date": "2026-04-01",
        "end_date": "2026-05-01",
        "auto_renew": False,
    }
    now = datetime(2026, 4, 9, tzinfo=timezone.utc)
    assert compute_effective_membership_status(ms, now=now, has_success_payment=True) == "active"

