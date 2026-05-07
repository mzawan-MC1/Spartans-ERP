import asyncio
import logging
from datetime import datetime, timezone, timedelta
import uuid
from dateutil.relativedelta import relativedelta

logger = logging.getLogger(__name__)
_db = None


def _normalize_billing_cycle(value: str) -> str:
    v = (value or "").strip().lower()
    if v == "quarterly":
        return "3 months"
    if v == "annual":
        return "yearly"
    return v or "monthly"


def _calc_end_date(start_date: str, billing_cycle: str) -> str:
    start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
    end = start
    cycle = _normalize_billing_cycle(billing_cycle)
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

def init(database):
    global _db
    _db = database

async def process_recurring_payments():
    """Finds and processes due auto-renewing memberships."""
    if _db is None:
        return
        
    logger.info("Running recurring payment check...")
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    
    # We want active memberships where auto_renew is True
    # and next_renewal_date is today or in the past
    query = {
        "status": {"$in": ["active", "past_due"]},
        "auto_renew": True,
        "next_renewal_date": {"$lte": now_iso, "$ne": None}
    }
    
    memberships = await _db.memberships.find(query).to_list(None)
    
    for ms in memberships:
        # Avoid processing if we recently attempted and failed (e.g. backoff mechanism)
        last_attempt_str = ms.get("last_renewal_attempt")
        if last_attempt_str:
            last_attempt = datetime.fromisoformat(last_attempt_str.replace("Z", "+00:00"))
            if (now - last_attempt).total_seconds() < 86400: # Wait 24h before retrying
                continue
                
        # Must have a valid recurring setup
        provider = ms.get("recurring_provider")
        token = ms.get("recurring_token")
        
        if not provider or not token or provider == "cash":
            logger.warning(f"Membership {ms['membership_id']} has auto_renew but invalid token/provider.")
            await mark_renewal_failed(ms, "Missing or invalid payment method token")
            continue
            
        # Concurrency Protection: Use a lock flag to prevent duplicate processing
        lock_res = await _db.memberships.update_one(
            {"membership_id": ms["membership_id"], "renewal_lock": {"$ne": True}},
            {"$set": {"renewal_lock": True, "last_renewal_attempt": now_iso}}
        )
        if lock_res.modified_count == 0:
            logger.info(f"Membership {ms['membership_id']} is already locked for renewal processing.")
            continue
            
        try:
            # Get the plan details to know how much to charge
            plan_id = ms.get("payment_plan_id")
            plan = await _db.pricing_plans.find_one({"plan_id": plan_id})
        
            # If plan is missing or doesn't have a price, fallback to ms amount
            amount = plan.get("price") if plan else ms.get("total_amount", 0)
            currency = plan.get("currency", "AED") if plan else "AED"
            
            if amount <= 0:
                logger.warning(f"Membership {ms['membership_id']} amount is 0, skipping charge.")
                continue
                
            payment_id = f"ren_{uuid.uuid4().hex[:12]}"
            
            # Create a pending payment record first
            payment_doc = {
                "payment_id": payment_id,
                "location_id": ms["location_id"],
                "member_id": ms["member_id"],
                "membership_id": ms["membership_id"],
                "method": provider,
                "source": "auto_renew",
                "provider_ref": None,
                "amount": amount,
                "currency": currency,
                "status": "pending",
                "paid_at": None,
                "due_date": now_iso,
                "created_by_user_id": "system",
                "created_at": now_iso,
                "updated_at": now_iso,
            }
            await _db.payments.insert_one(payment_doc)
            
            # Import dynamically to avoid circular imports
            from payment_gateways import PaymentService
            
            charge_res = await PaymentService.charge_recurring(
                payment_id=payment_id,
                amount=amount,
                currency=currency,
                provider=provider,
                customer_token=token,
                location_id=ms["location_id"]
            )
            
            if charge_res.get("status") == "paid":
                # Success
                transaction_id = charge_res.get("transaction_id")
                await _db.payments.update_one(
                    {"payment_id": payment_id},
                    {"$set": {
                        "status": "paid", 
                        "paid_at": now_iso, 
                        "provider_ref": transaction_id,
                        "updated_at": now_iso
                    }}
                )
                
                current_end = ms.get("end_date") or ms.get("base_end_date")
                if not current_end:
                    await mark_renewal_failed(ms, "missing_end_date", now_iso)
                    continue

                billing_cycle = "monthly"
                if plan:
                    billing_cycle = plan.get("billing_cycle") or plan.get("billing_period") or "monthly"

                next_renewal = _calc_end_date(current_end, billing_cycle)
                
                # Copy updated freeze settings from plan if available
                freeze_max_days = plan.get("freeze_max_days", ms.get("freeze_max_days", 60)) if plan else ms.get("freeze_max_days", 60)
                freeze_max_uses = plan.get("freeze_max_uses", ms.get("freeze_max_uses", 2)) if plan else ms.get("freeze_max_uses", 2)
                
                await _db.memberships.update_one(
                    {"membership_id": ms["membership_id"]},
                    {"$set": {
                        "status": "active",
                        "end_date": next_renewal,
                        "base_end_date": next_renewal,
                        "next_renewal_date": next_renewal,
                        "last_renewal_attempt": now_iso,
                        "renewal_status": "success",
                        "renewal_error": None,
                        "updated_at": now_iso,
                        "renewal_lock": False,
                        "freeze_max_days": freeze_max_days,
                        "freeze_max_uses": freeze_max_uses
                    }}
                )
                logger.info(f"Successfully auto-renewed membership {ms['membership_id']}")
                
            else:
                # Failed
                error_msg = charge_res.get("error", "Unknown error")
                await _db.payments.update_one(
                    {"payment_id": payment_id},
                    {"$set": {"status": "failed", "updated_at": now_iso, "receipt_info": f"Auto-renew failed: {error_msg}"}}
                )
                await mark_renewal_failed(ms, error_msg, now_iso)
                
        except Exception as e:
            logger.error(f"Error during auto-renew for {ms['membership_id']}: {str(e)}")
            await _db.payments.update_one(
                {"payment_id": payment_id},
                {"$set": {"status": "failed", "updated_at": now_iso, "receipt_info": f"System error: {str(e)}"}}
            )
            await mark_renewal_failed(ms, str(e), now_iso)

    await sync_membership_statuses(now_iso)

async def mark_renewal_failed(ms: dict, error: str, now_iso: str = None):
    if not now_iso:
        now_iso = datetime.now(timezone.utc).isoformat()
    await _db.memberships.update_one(
        {"membership_id": ms["membership_id"]},
        {"$set": {
            "last_renewal_attempt": now_iso,
            "renewal_status": "failed",
            "renewal_error": error,
            "updated_at": now_iso,
            "renewal_lock": False
        }}
    )


async def sync_membership_statuses(now_iso: str = None):
    if _db is None:
        return
    if not now_iso:
        now_iso = datetime.now(timezone.utc).isoformat()
    today_str = now_iso[:10]

    await _db.memberships.update_many(
        {"status": {"$in": ["active", "pending"]}, "auto_renew": False, "end_date": {"$lt": today_str}},
        {"$set": {"status": "expired", "updated_at": now_iso}},
    )

    await _db.memberships.update_many(
        {"status": {"$in": ["active", "pending"]}, "auto_renew": True, "end_date": {"$lt": today_str}},
        {"$set": {"status": "past_due", "updated_at": now_iso}},
    )

async def start_scheduler():
    """Background loop to check for renewals periodically."""
    logger.info("Recurring payments scheduler started.")
    while True:
        try:
            await process_recurring_payments()
            await check_upcoming_expiries()
        except Exception as e:
            logger.error(f"Error in scheduler loop: {str(e)}")
            
        # Check every 6 hours
        await asyncio.sleep(60 * 60 * 6)

async def check_upcoming_expiries():
    """Finds memberships expiring in exactly 15 days and sends an alert/notification."""
    if _db is None:
        return
        
    logger.info("Running upcoming expiry check...")
    now = datetime.now(timezone.utc)
    target_date = now + timedelta(days=15)
    
    # Format to YYYY-MM-DD to match the frontend date storage format
    target_date_str = target_date.strftime('%Y-%m-%d')
    
    query = {
        "status": "active",
        "end_date": {"$regex": f"^{target_date_str}"} # Matches 2026-04-14 or 2026-04-14T...
    }
    
    expiring_memberships = await _db.memberships.find(query).to_list(None)
    
    for ms in expiring_memberships:
        # Avoid creating duplicate alerts for the same membership expiry
        alert_id = f"exp_{ms['membership_id']}_{target_date_str}"
        existing_alert = await _db.alerts.find_one({"alert_id": alert_id})
        
        if not existing_alert:
            # Fetch member details for the alert message
            member = await _db.members.find_one({"member_id": ms["member_id"]})
            member_name = f"{member.get('first_name', '')} {member.get('last_name', '')}".strip() if member else "Unknown Member"
            
            alert_doc = {
                "alert_id": alert_id,
                "location_id": ms["location_id"],
                "type": "membership_expiring",
                "title": "Membership Expiring Soon",
                "message": f"Membership for {member_name} is expiring in 15 days on {target_date_str}.",
                "priority": "high",
                "status": "unread",
                "created_at": now.isoformat(),
                "metadata": {
                    "member_id": ms["member_id"],
                    "membership_id": ms["membership_id"],
                    "expiry_date": target_date_str
                }
            }
            await _db.alerts.insert_one(alert_doc)
            logger.info(f"Created expiry alert for membership {ms['membership_id']}")
