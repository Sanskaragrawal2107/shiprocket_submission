"""Fernet helpers for merchant credential encryption."""

from __future__ import annotations

import os
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


def _get_key() -> bytes:
    key = os.getenv("ENCRYPTION_KEY", "").strip()
    if not key:
        fallback_secret = os.getenv("API_KEY", "").strip() or os.getenv("INTERNAL_API_KEY", "").strip()
        if fallback_secret:
            digest = hashlib.sha256(fallback_secret.encode("utf-8")).digest()
            return base64.urlsafe_b64encode(digest)
    if not key:
        raise RuntimeError("ENCRYPTION_KEY is not configured")
    return key.encode("utf-8")


def get_fernet() -> Fernet:
    return Fernet(_get_key())


def encrypt_value(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    return get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_value(value: str | None) -> str | None:
    if value is None or value == "":
        return value
    try:
        return get_fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Unable to decrypt credential payload") from exc


def generate_encryption_key() -> str:
    return Fernet.generate_key().decode("utf-8")