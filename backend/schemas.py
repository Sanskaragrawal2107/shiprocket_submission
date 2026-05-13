"""Pydantic request/response schemas for the D2C AI Employee API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    shopify_store_url: str | None = None
    shopify_access_token: str | None = None
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    shiprocket_email: str | None = None
    shiprocket_password: str | None = None
    meta_ads_account_id: str | None = None
    meta_ads_access_token: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class ThresholdItem(BaseModel):
    metric: str
    threshold_value: float = Field(..., ge=0)
    operator: str


class ThresholdUpdateRequest(BaseModel):
    thresholds: list[ThresholdItem]