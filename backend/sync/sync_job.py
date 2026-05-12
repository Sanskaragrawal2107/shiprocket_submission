"""
Sync Job — Orchestrates all 4 connectors and upserts data to Supabase.

Called by: POST /sync/{merchant_id}
Also called by: Supabase pg_cron → Edge Function → this endpoint

Uses upsert on source_row_ref to prevent duplicates on re-runs.
"""

import os
from datetime import date, timedelta
from supabase_client import create_client, SupabaseClient

from connectors.shopify import ShopifyConnector
from connectors.razorpay import RazorpayConnector
from connectors.shiprocket import ShiprocketConnector
from connectors.meta_ads import MetaAdsConnector


def get_supabase() -> SupabaseClient:
    """Create a Supabase client using service key."""
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return create_client(url, key)


def _upsert_batch(supabase: SupabaseClient, table: str, rows: list[dict], batch_size: int = 50) -> int:
    """
    Upsert rows into a Supabase table using source_row_ref as the conflict key.
    Processes in batches to avoid payload limits.
    Returns the number of rows upserted.
    """
    if not rows:
        return 0

    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        try:
            supabase.table(table).upsert(
                batch,
                on_conflict="source_row_ref"
            )
            total += len(batch)
        except Exception as e:
            print(f"  [Upsert] Error in batch {i // batch_size} for {table}: {e}")

    return total


async def run_sync(merchant_id: str) -> dict:
    """
    Run sync for a merchant: fetch from all 4 connectors, upsert to Supabase.
    
    Returns a summary dict with counts per connector.
    """
    supabase = get_supabase()

    from_date = date.today() - timedelta(days=30)
    to_date = date.today()

    results = {}

    # --- 1. Shopify → orders table ---
    try:
        shopify = ShopifyConnector(merchant_id)
        shopify_orders = shopify.fetch_orders(from_date, to_date)
        count = _upsert_batch(supabase, "orders", shopify_orders)
        results["shopify"] = {"status": "ok", "rows": count}
    except Exception as e:
        print(f"[Sync] Shopify error: {e}")
        results["shopify"] = {"status": "error", "error": str(e)}

    # --- 2. Razorpay → payments table ---
    try:
        razorpay = RazorpayConnector(merchant_id)
        razorpay_payments = razorpay.fetch_orders(from_date, to_date)
        count = _upsert_batch(supabase, "payments", razorpay_payments)
        results["razorpay"] = {"status": "ok", "rows": count}
    except Exception as e:
        print(f"[Sync] Razorpay error: {e}")
        results["razorpay"] = {"status": "error", "error": str(e)}

    # --- 3. Shiprocket (Mock) → deliveries table ---
    try:
        shiprocket = ShiprocketConnector(merchant_id)
        deliveries = shiprocket.fetch_orders(from_date, to_date)
        count = _upsert_batch(supabase, "deliveries", deliveries)
        results["shiprocket"] = {"status": "ok", "rows": count}
    except Exception as e:
        print(f"[Sync] Shiprocket error: {e}")
        results["shiprocket"] = {"status": "error", "error": str(e)}

    # --- 4. Meta Ads (Mock) → ads_performance table ---
    try:
        meta = MetaAdsConnector(merchant_id)
        ads_data = meta.fetch_orders(from_date, to_date)
        count = _upsert_batch(supabase, "ads_performance", ads_data)
        results["meta_ads"] = {"status": "ok", "rows": count}
    except Exception as e:
        print(f"[Sync] Meta Ads error: {e}")
        results["meta_ads"] = {"status": "error", "error": str(e)}

    print(f"[Sync] Completed for {merchant_id}: {results}")
    return results
