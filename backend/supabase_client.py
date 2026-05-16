"""
Lightweight Supabase client using httpx.

This avoids the heavy `supabase` Python SDK which requires pyiceberg (needs C++ build tools).
Uses the Supabase PostgREST API directly via httpx.
"""

import os
import httpx
from typing import Any


class SupabaseClient:
    """Minimal Supabase client using PostgREST API."""

    def __init__(self, url: str = None, key: str = None):
        self.url = (url or os.getenv("SUPABASE_URL", "")).rstrip("/")
        self.key = key or os.getenv("SUPABASE_SERVICE_KEY", "")
        self.rest_url = f"{self.url}/rest/v1"

    def _headers(self) -> dict:
        return {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def table(self, name: str) -> "TableQuery":
        return TableQuery(self, name)


class TableQuery:
    """Chainable query builder for Supabase PostgREST."""

    def __init__(self, client: SupabaseClient, table: str):
        self.client = client
        self._table = table
        self._select_cols = "*"
        self._filters: list[str] = []
        self._order_col = None
        self._order_desc = False
        self._limit_val = None
        self._update_data = None

    def select(self, cols: str = "*") -> "TableQuery":
        self._select_cols = cols
        return self

    def eq(self, col: str, val: Any) -> "TableQuery":
        self._filters.append(f"{col}=eq.{val}")
        return self

    def gte(self, col: str, val: Any) -> "TableQuery":
        self._filters.append(f"{col}=gte.{val}")
        return self

    def lte(self, col: str, val: Any) -> "TableQuery":
        self._filters.append(f"{col}=lte.{val}")
        return self

    def lt(self, col: str, val: Any) -> "TableQuery":
        self._filters.append(f"{col}=lt.{val}")
        return self

    def order(self, col: str, desc: bool = False) -> "TableQuery":
        self._order_col = col
        self._order_desc = desc
        return self

    def limit(self, n: int) -> "TableQuery":
        self._limit_val = n
        return self

    def _build_url(self) -> str:
        url = f"{self.client.rest_url}/{self._table}"
        params = [f"select={self._select_cols}"]
        params.extend(self._filters)
        if self._order_col:
            direction = "desc" if self._order_desc else "asc"
            params.append(f"order={self._order_col}.{direction}")
        if self._limit_val:
            params.append(f"limit={self._limit_val}")
        return url + "?" + "&".join(params)

    def execute(self) -> "QueryResult":
        if self._update_data is not None:
            if self._update_data == {"__delete__": True}:
                return self.execute_delete()
            return self.execute_update()

        url = self._build_url()
        with httpx.Client(timeout=30) as client:
            resp = client.get(url, headers=self.client._headers())
            resp.raise_for_status()
            return QueryResult(resp.json())

    def update(self, data: dict) -> "TableQuery":
        self._update_data = data
        return self

    def delete(self) -> "TableQuery":
        self._update_data = {"__delete__": True}
        return self

    def _build_write_url(self) -> str:
        url = f"{self.client.rest_url}/{self._table}"
        if self._filters:
            url += "?" + "&".join(self._filters)
        return url

    def _write(self, method: str, data: dict | list[dict] | None = None) -> "QueryResult":
        url = self._build_write_url()
        headers = self.client._headers()
        headers["Prefer"] = "return=representation"
        with httpx.Client(timeout=30) as client:
            resp = client.request(method, url, json=data, headers=headers)
            resp.raise_for_status()
            if resp.content:
                return QueryResult(resp.json())
            return QueryResult([])

    def execute_update(self) -> "QueryResult":
        if self._update_data is None:
            raise ValueError("No update payload specified")
        return self._write("PATCH", self._update_data)

    def execute_delete(self) -> "QueryResult":
        return self._write("DELETE")

    def insert(self, data: dict | list[dict]) -> "QueryResult":
        url = f"{self.client.rest_url}/{self._table}"
        if isinstance(data, dict):
            data = [data]
        with httpx.Client(timeout=30) as client:
            resp = client.post(url, json=data, headers=self.client._headers())
            resp.raise_for_status()
            return QueryResult(resp.json())

    def upsert(self, data: list[dict], on_conflict: str = "source_row_ref") -> "QueryResult":
        url = f"{self.client.rest_url}/{self._table}"
        headers = self.client._headers()
        headers["Prefer"] = f"return=representation,resolution=merge-duplicates"
        
        if isinstance(data, dict):
            data = [data]

        with httpx.Client(timeout=30) as client:
            resp = client.post(
                url,
                json=data,
                headers=headers,
                params={"on_conflict": on_conflict},
            )
            resp.raise_for_status()
            return QueryResult(resp.json())


class QueryResult:
    """Wraps a PostgREST response."""

    def __init__(self, data: list[dict] | dict):
        if isinstance(data, list):
            self.data = data
        elif isinstance(data, dict):
            self.data = [data]
        else:
            self.data = []


def create_client(url: str = None, key: str = None) -> SupabaseClient:
    """Create a Supabase client (drop-in compatible function name)."""
    return SupabaseClient(url, key)
