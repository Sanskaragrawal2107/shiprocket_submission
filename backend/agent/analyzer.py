"""
Agent Analyzer — Per-merchant analysis loop.

Fetches last 7 days of data from Supabase, runs threshold checks,
and determines if an LLM call is needed.
"""

import os
from datetime import date, timedelta, datetime
from supabase_client import create_client, SupabaseClient
from .conditions import run_all_checks


def get_supabase() -> SupabaseClient:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return create_client(url, key)


def fetch_merchant_data(supabase: Client, merchant_id: str, days: int = 7) -> dict:
    """Fetch last N days of data for a merchant from all tables."""
    from_date = (date.today() - timedelta(days=days)).isoformat()

    # Fetch orders
    orders_resp = supabase.table("orders").select("*").eq(
        "merchant_id", merchant_id
    ).gte("order_date", from_date).execute()
    orders = orders_resp.data or []

    # Fetch deliveries
    deliveries_resp = supabase.table("deliveries").select("*").eq(
        "merchant_id", merchant_id
    ).gte("dispatch_date", from_date).execute()
    deliveries = deliveries_resp.data or []

    # Fetch payments
    payments_resp = supabase.table("payments").select("*").eq(
        "merchant_id", merchant_id
    ).gte("payment_date", from_date).execute()
    payments = payments_resp.data or []

    # Fetch ads
    ads_resp = supabase.table("ads_performance").select("*").eq(
        "merchant_id", merchant_id
    ).gte("date", from_date).execute()
    ads = ads_resp.data or []

    return {
        "orders": orders,
        "deliveries": deliveries,
        "payments": payments,
        "ads": ads,
    }


def build_data_snapshot(data: dict) -> dict:
    """Build a compact data snapshot for the LLM context."""
    orders = data["orders"]
    deliveries = data["deliveries"]
    payments = data["payments"]
    ads = data["ads"]

    total_revenue = sum(float(o.get("revenue", 0)) for o in orders)
    total_orders = len(orders)
    total_deliveries = len(deliveries)
    delivered = sum(1 for d in deliveries if d.get("status") == "delivered")
    failed = sum(1 for d in deliveries if d.get("status") in ("failed", "returned"))
    total_shipping = sum(float(d.get("shipping_cost", 0)) for d in deliveries)
    total_ad_spend = sum(float(a.get("spend", 0)) for a in ads)
    total_payments = sum(float(p.get("amount", 0)) for p in payments)

    return {
        "period": f"Last 7 days ending {date.today().isoformat()}",
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "total_deliveries": total_deliveries,
        "delivered": delivered,
        "failed_or_returned": failed,
        "delivery_success_rate": round(delivered / total_deliveries, 3) if total_deliveries > 0 else 0,
        "total_shipping_cost": round(total_shipping, 2),
        "avg_shipping_per_order": round(total_shipping / total_deliveries, 2) if total_deliveries > 0 else 0,
        "total_ad_spend": round(total_ad_spend, 2),
        "total_payments_settled": round(total_payments, 2),
        "overall_roas": round(total_revenue / total_ad_spend, 2) if total_ad_spend > 0 else 0,
    }


async def analyze_merchant(merchant_id: str) -> dict:
    """
    Full analysis pipeline for one merchant:
    1. Fetch 7 days of data
    2. Run threshold checks
    3. Return triggered conditions + snapshot

    Returns dict with:
    - triggered: list of triggered conditions
    - snapshot: data snapshot dict
    - needs_llm: bool
    """
    supabase = get_supabase()
    data = fetch_merchant_data(supabase, merchant_id)

    triggered = run_all_checks(
        orders=data["orders"],
        deliveries=data["deliveries"],
        payments=data["payments"],
        ads_data=data["ads"],
    )

    snapshot = build_data_snapshot(data)

    return {
        "merchant_id": merchant_id,
        "triggered": triggered,
        "snapshot": snapshot,
        "needs_llm": len(triggered) > 0,
    }
