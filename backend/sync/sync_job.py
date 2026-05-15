"""Sync Job — Orchestrates all 4 connectors and upserts data to Supabase.

The sync window is incremental: on first sync we pull the last 30 days, then
we advance from the merchant's `last_synced_at` timestamp on subsequent runs.
This keeps refreshes bounded and avoids re-fetching the entire history.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from connectors.meta_ads import MetaAdsConnector
from connectors.razorpay import RazorpayConnector
from connectors.shiprocket import ShiprocketConnector
from connectors.shopify import ShopifyConnector
from agent.engine import run_agent_for_merchant
from db import get_merchant_context, update_last_synced_at
from supabase_client import SupabaseClient, create_client


def get_supabase() -> SupabaseClient:
    from os import getenv

    return create_client(getenv("SUPABASE_URL", ""), getenv("SUPABASE_SERVICE_KEY", ""))


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

    Returns a summary dict with counts per connector and detailed errors.
    """
    supabase = get_supabase()
    merchant = get_merchant_context(merchant_id)

    sync_end = datetime.now(timezone.utc)
    sync_start = merchant.last_synced_at or (sync_end - timedelta(days=30))

    from_date = sync_start.date()
    to_date = sync_end.date()

    credentials = merchant.to_dict()
    results: dict[str, dict] = {}
    errors: list[dict] = []

    connectors = {
        "shopify": (ShopifyConnector, "orders"),
        "razorpay": (RazorpayConnector, "payments"),
        "shiprocket": (ShiprocketConnector, "deliveries"),
        "meta_ads": (MetaAdsConnector, "meta_ads"),
    }

    for connector_name, (connector_cls, table_name) in connectors.items():
        try:
            connector = connector_cls(merchant_id, credentials)
            rows = connector.fetch_orders(from_date, to_date)
            count = _upsert_batch(supabase, table_name, rows)
            results[connector_name] = {
                "status": "ok",
                "rows": count,
                "table": table_name,
            }
        except Exception as exc:
            error_detail = {"connector": connector_name, "error": str(exc)}
            print(f"[Sync] {connector_name} error for {merchant_id}: {exc}")
            results[connector_name] = {"status": "error", **error_detail}
            errors.append(error_detail)

    if not errors:
        update_last_synced_at(merchant_id, sync_end)
        try:
            await run_agent_for_merchant(merchant_id)
        except Exception as exc:
            errors.append({"connector": "agent", "error": str(exc)})
            results["agent"] = {"status": "error", "error": str(exc)}

    print(f"[Sync] Completed for {merchant_id}: {results}")
    return {
        "merchant_id": merchant_id,
        "status": "completed" if not errors else "partial_failure",
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "results": results,
        "errors": errors,
    }
