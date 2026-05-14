"""Supabase data access helpers for merchants, thresholds, insights, and notifications."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any

from encryption import decrypt_value, encrypt_value
from supabase_client import SupabaseClient, create_client


DEFAULT_THRESHOLD_ROWS = [
    {"metric": "rto_rate", "threshold_value": 15, "operator": "greater_than"},
    {"metric": "roas", "threshold_value": 2.0, "operator": "less_than"},
    {"metric": "settlement_gap_percent", "threshold_value": 20, "operator": "greater_than"},
    {"metric": "payment_failure_rate", "threshold_value": 10, "operator": "greater_than"},
    {"metric": "delivery_delay_days", "threshold_value": 3, "operator": "greater_than"},
]


@dataclass(slots=True)
class MerchantContext:
    merchant_id: str
    name: str
    email: str
    is_active: bool = True
    last_synced_at: datetime | None = None
    shopify_store_url: str | None = None
    shopify_access_token: str | None = None
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    shiprocket_email: str | None = None
    shiprocket_password: str | None = None
    meta_ads_account_id: str | None = None
    meta_ads_access_token: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def get_supabase() -> SupabaseClient:
    from os import getenv

    return create_client(getenv("SUPABASE_URL", ""), getenv("SUPABASE_SERVICE_KEY", ""))


def _rows(response) -> list[dict[str, Any]]:
    return list(getattr(response, "data", []) or [])


def _first(response) -> dict[str, Any] | None:
    rows = _rows(response)
    return rows[0] if rows else None


def sanitize_merchant_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    sanitized = dict(row)
    for field in (
        "password_hash",
        "shopify_access_token",
        "razorpay_key_secret",
        "shiprocket_password",
        "meta_ads_access_token",
    ):
        sanitized.pop(field, None)
    return sanitized


def merchant_public_profile(row: dict[str, Any]) -> dict[str, Any]:
    sanitized = sanitize_merchant_row(row) or {}
    return {
        "merchant_id": sanitized.get("merchant_id"),
        "name": sanitized.get("name"),
        "email": sanitized.get("email"),
        "is_active": sanitized.get("is_active", True),
        "last_synced_at": sanitized.get("last_synced_at"),
        "settings": sanitized.get("settings") or {},
        "onboarded": bool(sanitized.get("onboarded", False)),
        "created_at": sanitized.get("created_at"),
        "updated_at": sanitized.get("updated_at"),
    }


def get_merchant_by_email(email: str) -> dict[str, Any] | None:
    response = get_supabase().table("merchants").select("*").eq("email", email).limit(1).execute()
    return _first(response)


def get_merchant_by_id(merchant_id: str) -> dict[str, Any] | None:
    response = get_supabase().table("merchants").select("*").eq("merchant_id", merchant_id).limit(1).execute()
    return _first(response)


def create_merchant(payload: dict[str, Any]) -> dict[str, Any]:
    response = get_supabase().table("merchants").insert(payload)
    row = _first(response)
    if not row:
        raise RuntimeError("Merchant insert did not return a row")
    return row


def get_merchant_context(merchant_id: str) -> MerchantContext:
    row = get_merchant_by_id(merchant_id)
    if not row:
        raise LookupError(f"Merchant not found: {merchant_id}")

    def _decrypt(field: str) -> str | None:
        try:
            return decrypt_value(row.get(field))
        except Exception:
            return None

    last_synced_at = row.get("last_synced_at")
    if isinstance(last_synced_at, str) and last_synced_at:
        try:
            last_synced_at = datetime.fromisoformat(last_synced_at.replace("Z", "+00:00"))
        except ValueError:
            last_synced_at = None

    return MerchantContext(
        merchant_id=row.get("merchant_id", merchant_id),
        name=row.get("name", ""),
        email=row.get("email", ""),
        is_active=bool(row.get("is_active", True)),
        last_synced_at=last_synced_at,
        shopify_store_url=row.get("shopify_store_url"),
        shopify_access_token=_decrypt("shopify_access_token"),
        razorpay_key_id=row.get("razorpay_key_id"),
        razorpay_key_secret=_decrypt("razorpay_key_secret"),
        shiprocket_email=row.get("shiprocket_email"),
        shiprocket_password=_decrypt("shiprocket_password"),
        meta_ads_account_id=row.get("meta_ads_account_id"),
        meta_ads_access_token=_decrypt("meta_ads_access_token"),
    )


def insert_default_thresholds(merchant_id: str) -> list[dict[str, Any]]:
    rows = [{"merchant_id": merchant_id, **item} for item in DEFAULT_THRESHOLD_ROWS]
    response = get_supabase().table("merchant_thresholds").upsert(rows, on_conflict="merchant_id,metric")
    return _rows(response)


def get_threshold_rows(merchant_id: str) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("merchant_thresholds")
        .select("metric,threshold_value,operator,created_at")
        .eq("merchant_id", merchant_id)
        .execute()
    )
    rows = _rows(response)
    if not rows:
        return insert_default_thresholds(merchant_id)
    return rows


def upsert_threshold_rows(merchant_id: str, thresholds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [{"merchant_id": merchant_id, **item} for item in thresholds]
    response = get_supabase().table("merchant_thresholds").upsert(rows, on_conflict="merchant_id,metric")
    return _rows(response)


def fetch_merchant_rows(
    table: str,
    merchant_id: str,
    date_column: str | None = None,
    from_date: datetime | None = None,
) -> list[dict[str, Any]]:
    query = get_supabase().table(table).select("*").eq("merchant_id", merchant_id)
    if date_column and from_date:
        date_value = from_date.date().isoformat() if isinstance(from_date, datetime) else from_date.isoformat()
        query = query.gte(date_column, date_value)
    response = query.execute()
    return _rows(response)


def update_last_synced_at(merchant_id: str, synced_at: datetime | None = None) -> list[dict[str, Any]]:
    synced_at = synced_at or datetime.now(timezone.utc)
    response = (
        get_supabase()
        .table("merchants")
        .update({"last_synced_at": synced_at.isoformat()})
        .eq("merchant_id", merchant_id)
        .execute()
    )
    return _rows(response)


def save_agent_insight(payload: dict[str, Any]) -> dict[str, Any]:
    response = get_supabase().table("agent_insights").insert(payload)
    row = _first(response)
    if not row:
        raise RuntimeError("Failed to save agent insight")
    return row


def list_agent_insights(merchant_id: str, limit: int = 20) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("agent_insights")
        .select("*")
        .eq("merchant_id", merchant_id)
        .order("triggered_at", desc=True)
        .limit(limit)
        .execute()
    )
    return _rows(response)


def create_notification(payload: dict[str, Any]) -> dict[str, Any]:
    response = get_supabase().table("notifications").insert(payload)
    row = _first(response)
    if not row:
        raise RuntimeError("Failed to save notification")
    return row


def list_unread_notifications(merchant_id: str, limit: int = 20) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("notifications")
        .select("*")
        .eq("merchant_id", merchant_id)
        .eq("is_read", False)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return _rows(response)


def mark_notification_read(notification_id: str, merchant_id: str) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("notifications")
        .update({"is_read": True})
        .eq("id", notification_id)
        .eq("merchant_id", merchant_id)
        .execute()
    )
    return _rows(response)


def mark_all_notifications_read(merchant_id: str) -> list[dict[str, Any]]:
    response = (
        get_supabase()
        .table("notifications")
        .update({"is_read": True})
        .eq("merchant_id", merchant_id)
        .eq("is_read", False)
        .execute()
    )
    return _rows(response)


def encrypt_merchant_payload(payload: dict[str, Any]) -> dict[str, Any]:
    encrypted = dict(payload)
    for field in (
        "shopify_access_token",
        "razorpay_key_secret",
        "shiprocket_password",
        "meta_ads_access_token",
    ):
        encrypted[field] = encrypt_value(encrypted.get(field))
    return encrypted
