"""
Shopify Connector — REAL API integration.
Uses Shopify REST Admin API 2024-01 to fetch orders.
"""

import httpx
from datetime import date, datetime
from .base import BaseConnector


class ShopifyConnector(BaseConnector):
    """Connects to Shopify REST Admin API to fetch order data."""

    API_VERSION = "2024-01"

    def __init__(self, merchant_id: str, credentials: dict | None = None):
        super().__init__(merchant_id, credentials)
        self.store_url = self.credentials.get("shopify_store_url", "")
        self.access_token = self.credentials.get("shopify_access_token", "")
        self.base_url = f"https://{self.store_url}/admin/api/{self.API_VERSION}"

    def _headers(self) -> dict:
        return {
            "X-Shopify-Access-Token": self.access_token,
            "Content-Type": "application/json",
        }

    async def fetch_orders(self, from_date: date, to_date: date) -> list[dict]:
        """
        GET /admin/api/2024-01/orders.json
        Returns normalized order dicts mapped to our 'orders' table schema.
        """
        if not self.store_url or not self.access_token:
            print("[Shopify] Missing credentials, returning empty.")
            return []

        all_orders = []
        url = f"{self.base_url}/orders.json"
        params = {
            "status": "any",
            "financial_status": "any",
            "created_at_min": f"{from_date.isoformat()}T00:00:00+05:30",
            "created_at_max": f"{to_date.isoformat()}T23:59:59+05:30",
            "limit": 250,
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                while url:
                    resp = await client.get(url, headers=self._headers(), params=params)
                    resp.raise_for_status()
                    data = resp.json()
                    orders = data.get("orders", [])

                    for order in orders:
                        # Each line_item becomes a separate row
                        for item in order.get("line_items", []):
                            normalized = {
                                "merchant_id": self.merchant_id,
                                "order_ref": str(order["order_number"]),
                                "product_name": item.get("title", "Unknown"),
                                "product_type": item.get("product_type", ""),
                                "quantity": item.get("quantity", 1),
                                "revenue": float(item.get("price", 0)) * item.get("quantity", 1),
                                "financial_status": order.get("financial_status", "pending"),
                                "fulfillment_status": order.get("fulfillment_status") or "unfulfilled",
                                "customer_city": (order.get("shipping_address") or {}).get("city", ""),
                                "customer_zip": (order.get("shipping_address") or {}).get("zip", ""),
                                "source": "shopify",
                                "source_row_ref": f"shopify_orders#{order['id']}_{item['id']}",
                                "order_date": order.get("created_at", datetime.now().isoformat()),
                            }
                            all_orders.append(normalized)

                    # Handle pagination via Link header
                    link_header = resp.headers.get("Link", "")
                    url = None
                    params = None  # Only use params on first request
                    if 'rel="next"' in link_header:
                        for part in link_header.split(","):
                            if 'rel="next"' in part:
                                url = part.split(";")[0].strip().strip("<>")
                                break

        except httpx.HTTPError as e:
            print(f"[Shopify] HTTP error: {e}")
        except Exception as e:
            print(f"[Shopify] Error fetching orders: {e}")

        print(f"[Shopify] Fetched {len(all_orders)} order line items")
        return all_orders

    async def fetch_returns(self, from_date: date, to_date: date) -> list[dict]:
        """Fetch orders with fulfillment_status = 'restocked' (returns)."""
        all_orders = await self.fetch_orders(from_date, to_date)
        returns = [o for o in all_orders if o.get("fulfillment_status") == "restocked"]
        print(f"[Shopify] Found {len(returns)} returns")
        return returns

    async def health_check(self) -> bool:
        """Check if Shopify API is reachable."""
        if not self.store_url or not self.access_token:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self.base_url}/shop.json",
                    headers=self._headers(),
                )
                return resp.status_code == 200
        except Exception:
            return False
