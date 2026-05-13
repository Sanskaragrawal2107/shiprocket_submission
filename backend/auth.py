"""JWT utilities and authenticated merchant lookup."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from db import get_merchant_by_id, merchant_public_profile

ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 7
bearer_scheme = HTTPBearer(auto_error=False)


def _secret_key() -> str:
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")
    return secret


def create_token(payload: dict[str, Any]) -> str:
    expires = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRE_DAYS)
    token_payload = {
        **payload,
        "exp": expires,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(token_payload, _secret_key(), algorithm=ALGORITHM)


def verify_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _secret_key(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def get_current_merchant_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return verify_token(credentials.credentials)


def get_current_merchant(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> dict[str, Any]:
    payload = get_current_merchant_token(credentials)
    merchant_id = payload.get("merchant_id")
    if not merchant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing merchant_id",
            headers={"WWW-Authenticate": "Bearer"},
        )

    merchant = get_merchant_by_id(merchant_id)
    if not merchant:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Merchant not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not merchant.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive merchant")

    return merchant_public_profile(merchant)