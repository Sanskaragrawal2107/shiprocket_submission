"""D2C AI Employee FastAPI application.

Public routes:
- GET /health
- POST /auth/register
- POST /auth/login

JWT-protected routes:
- GET /auth/me
- GET /thresholds
- PUT /thresholds
- POST /sync/{merchant_id}
- POST /agent/run/{merchant_id}
- GET /agent/insights/{merchant_id}
- GET /notifications
- PUT /notifications/{notification_id}/read
- PUT /notifications/read-all

X-API-Key protected admin routes:
- GET /admin/merchants
- POST /admin/sync/{merchant_id}
- POST /admin/agent/run/{merchant_id}
- GET /connectors/status

Merchant secrets are stored in Supabase only. The backend does not read them
from environment variables.
"""

from __future__ import annotations

import os
import sys
import uuid
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from bcrypt import checkpw, gensalt, hashpw
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from agent.engine import build_profitability_snapshot, run_agent_for_merchant
from auth import create_token, get_current_merchant, get_current_merchant_token
from connectors.meta_ads import MetaAdsConnector
from connectors.razorpay import RazorpayConnector
from connectors.shiprocket import ShiprocketConnector
from connectors.shopify import ShopifyConnector
from db import (
    create_merchant,
    encrypt_merchant_payload,
    get_merchant_by_email,
    get_merchant_context,
    get_supabase,
    get_threshold_rows,
    insert_default_thresholds,
    list_agent_insights,
    list_unread_notifications,
    mark_all_notifications_read,
    mark_notification_read,
    merchant_public_profile,
    sanitize_merchant_row,
    upsert_thresholds_from_settings,
    upsert_threshold_rows,
)
from schemas import LoginRequest, RegisterRequest, ThresholdUpdateRequest
from sync.sync_job import run_sync

load_dotenv()

ADMIN_API_KEY = os.getenv("API_KEY", "") or os.getenv("INTERNAL_API_KEY", "")

app = FastAPI(
    title="D2C AI Employee",
    description="AI-powered business intelligence assistant for D2C brands",
    version="2.0.0",
)

# CORS — allow all origins because:
# 1. We use JWT Bearer tokens (not cookies), so allow_credentials=False is correct.
# 2. allow_origins=["*"] with allow_credentials=False is safe and covers every
#    deployment URL: localhost dev ports (5173, 5174, 3000…), Netlify, Vercel, etc.
# 3. No merchant secrets are ever returned in GET responses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def require_admin_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server not configured: API_KEY missing",
        )
    if x_api_key != ADMIN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


def _merchant_id_matches(token_payload: dict[str, Any], merchant_id: str) -> None:
    if token_payload.get("merchant_id") != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Merchant mismatch")


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "D2C AI Employee", "version": "2.0.0"}


@app.post("/auth/register")
async def register_merchant(payload: RegisterRequest) -> dict[str, Any]:
    if not payload.email.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    existing = get_merchant_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    merchant_id = f"merchant_{uuid.uuid4().hex[:8]}"
    password_hash = hashpw(payload.password.encode("utf-8"), gensalt()).decode("utf-8")

    merchant_payload = {
        "merchant_id": merchant_id,
        "name": payload.name,
        "email": payload.email,
        "password_hash": password_hash,
        "shopify_store_url": payload.shopify_store_url,
        "shopify_access_token": payload.shopify_access_token,
        "razorpay_key_id": payload.razorpay_key_id,
        "razorpay_key_secret": payload.razorpay_key_secret,
        "shiprocket_email": payload.shiprocket_email,
        "shiprocket_password": payload.shiprocket_password,
        "meta_ads_account_id": payload.meta_ads_account_id,
        "meta_ads_access_token": payload.meta_ads_access_token,
        "is_active": True,
        "last_synced_at": None,
    }

    try:
        encrypted_payload = encrypt_merchant_payload(merchant_payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    created = create_merchant(encrypted_payload)
    insert_default_thresholds(merchant_id)

    return {"merchant_id": merchant_id, "name": created.get("name", payload.name), "message": "registered"}


@app.post("/auth/login")
async def login_merchant(payload: LoginRequest) -> dict[str, Any]:
    merchant = get_merchant_by_email(payload.email)
    if not merchant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    stored_hash = merchant.get("password_hash", "")
    if not stored_hash or not checkpw(payload.password.encode("utf-8"), stored_hash.encode("utf-8")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_token({"merchant_id": merchant["merchant_id"], "email": merchant["email"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "merchant_id": merchant["merchant_id"],
        "name": merchant.get("name", ""),
        "email": merchant["email"],
    }


@app.get("/auth/me")
async def auth_me(current_merchant: dict[str, Any] = Depends(get_current_merchant)) -> dict[str, Any]:
    return current_merchant


@app.put("/auth/me")
async def update_profile(payload: dict[str, Any], current_token: dict[str, Any] = Depends(get_current_merchant_token)) -> dict[str, Any]:
    """Update merchant-level settings (onboarding, preferences, thresholds).

    Accepts a JSON payload with optional `settings` (object) and `onboarded` (bool).
    """
    merchant_id = current_token["merchant_id"]
    updates: dict[str, Any] = {}
    if "settings" in payload:
        updates["settings"] = payload["settings"]
    if "onboarded" in payload:
        updates["onboarded"] = bool(payload["onboarded"])

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No updatable fields provided")

    try:
        response = get_supabase().table("merchants").update(updates).eq("merchant_id", merchant_id).execute()
        row = response.data[0] if getattr(response, "data", None) else None
        if not row:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Update failed")
        if "settings" in updates:
            upsert_thresholds_from_settings(merchant_id, updates["settings"])
        return merchant_public_profile(row)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Update failed: {exc}") from exc


@app.get("/merchants")
async def list_merchants(_: None = Depends(require_admin_api_key)) -> dict[str, Any]:
    response = get_supabase().table("merchants").select("*").order("created_at").execute()
    merchants = [merchant_public_profile(row) for row in response.data or []]
    return {"merchants": merchants, "count": len(merchants)}


@app.get("/thresholds")
async def get_thresholds(current_token: dict[str, Any] = Depends(get_current_merchant_token)) -> dict[str, Any]:
    merchant_id = current_token["merchant_id"]
    thresholds = get_threshold_rows(merchant_id)
    return {"merchant_id": merchant_id, "thresholds": thresholds}


@app.put("/thresholds")
async def update_thresholds(
    payload: ThresholdUpdateRequest,
    current_token: dict[str, Any] = Depends(get_current_merchant_token),
) -> dict[str, Any]:
    merchant_id = current_token["merchant_id"]
    updated_rows = upsert_threshold_rows(merchant_id, [item.model_dump() for item in payload.thresholds])
    return {"merchant_id": merchant_id, "thresholds": updated_rows, "message": "updated"}


@app.post("/sync/{merchant_id}")
async def sync_merchant(
    merchant_id: str,
    current_token: dict[str, Any] = Depends(get_current_merchant_token),
) -> dict[str, Any]:
    _merchant_id_matches(current_token, merchant_id)
    try:
        sync_result = await run_sync(merchant_id)
        agent_result = await run_agent_for_merchant(merchant_id)
        return {**sync_result, "agent_result": agent_result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Sync failed: {exc}") from exc


@app.post("/agent/run/{merchant_id}")
async def run_agent(
    merchant_id: str,
    current_token: dict[str, Any] = Depends(get_current_merchant_token),
) -> dict[str, Any]:
    _merchant_id_matches(current_token, merchant_id)
    try:
        return await run_agent_for_merchant(merchant_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Agent error: {exc}") from exc


@app.get("/analysis/profitability/{merchant_id}")
async def profitability_analysis(
    merchant_id: str,
    current_token: dict[str, Any] = Depends(get_current_merchant_token),
) -> dict[str, Any]:
    _merchant_id_matches(current_token, merchant_id)
    try:
        return build_profitability_snapshot(merchant_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Profitability analysis failed: {exc}") from exc


@app.get("/agent/insights/{merchant_id}")
async def get_insights(
    merchant_id: str,
    current_token: dict[str, Any] = Depends(get_current_merchant_token),
) -> dict[str, Any]:
    _merchant_id_matches(current_token, merchant_id)
    insights = list_agent_insights(merchant_id, limit=20)
    return {"merchant_id": merchant_id, "insights": insights, "count": len(insights)}


@app.get("/notifications")
async def get_notifications(current_token: dict[str, Any] = Depends(get_current_merchant_token)) -> dict[str, Any]:
    merchant_id = current_token["merchant_id"]
    notifications = list_unread_notifications(merchant_id, limit=20)
    return {"merchant_id": merchant_id, "notifications": notifications, "count": len(notifications)}


@app.put("/notifications/{notification_id}/read")
async def read_notification(
    notification_id: str,
    current_token: dict[str, Any] = Depends(get_current_merchant_token),
) -> dict[str, Any]:
    merchant_id = current_token["merchant_id"]
    updated = mark_notification_read(notification_id, merchant_id)
    return {"merchant_id": merchant_id, "notification_id": notification_id, "updated": updated, "message": "read"}


@app.put("/notifications/read-all")
async def read_all_notifications(current_token: dict[str, Any] = Depends(get_current_merchant_token)) -> dict[str, Any]:
    merchant_id = current_token["merchant_id"]
    updated = mark_all_notifications_read(merchant_id)
    return {"merchant_id": merchant_id, "updated": updated, "message": "read_all"}


@app.get("/admin/merchants")
async def admin_merchants(_: None = Depends(require_admin_api_key)) -> dict[str, Any]:
    response = get_supabase().table("merchants").select("*").order("created_at").execute()
    merchants = [sanitize_merchant_row(row) for row in response.data or []]
    return {"merchants": merchants, "count": len(merchants)}


@app.post("/admin/sync/{merchant_id}")
async def admin_sync(merchant_id: str, _: None = Depends(require_admin_api_key)) -> dict[str, Any]:
    sync_result = await run_sync(merchant_id)
    agent_result = await run_agent_for_merchant(merchant_id)
    return {**sync_result, "agent_result": agent_result}


@app.post("/admin/agent/run/{merchant_id}")
async def admin_run_agent(merchant_id: str, _: None = Depends(require_admin_api_key)) -> dict[str, Any]:
    return await run_agent_for_merchant(merchant_id)


@app.get("/connectors/status")
async def connectors_status(_: None = Depends(require_admin_api_key)) -> dict[str, Any]:
    response = get_supabase().table("merchants").select("merchant_id").order("created_at").limit(1).execute()
    merchant_rows = response.data or []
    if not merchant_rows:
        return {"connectors": {}}

    merchant_id = merchant_rows[0]["merchant_id"]
    merchant = get_merchant_context(merchant_id).to_dict()
    connectors = {
        "shopify": ShopifyConnector(merchant_id, merchant),
        "razorpay": RazorpayConnector(merchant_id, merchant),
        "shiprocket": ShiprocketConnector(merchant_id, merchant),
        "meta_ads": MetaAdsConnector(merchant_id, merchant),
    }

    statuses: dict[str, Any] = {}
    for name, connector in connectors.items():
        try:
            healthy = await connector.health_check()
            statuses[name] = {"status": "healthy" if healthy else "unhealthy", "merchant_id": merchant_id}
        except Exception as exc:
            statuses[name] = {"status": "error", "error": str(exc), "merchant_id": merchant_id}

    return {"connectors": statuses}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
