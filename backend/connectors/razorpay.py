"""
Razorpay Connector — REAL API integration.
Uses the official razorpay Python SDK to fetch payment/order data.
"""

from datetime import date, datetime, timezone
from .base import BaseConnector

try:
    import razorpay
except ImportError:
    razorpay = None


class RazorpayConnector(BaseConnector):
    """Connects to Razorpay API to fetch payment data."""

    def __init__(self, merchant_id: str, credentials: dict | None = None):
        super().__init__(merchant_id, credentials)
        self.key_id = self.credentials.get("razorpay_key_id", "")
        self.key_secret = self.credentials.get("razorpay_key_secret", "")
        self.client = None
        if razorpay and self.key_id and self.key_secret:
            self.client = razorpay.Client(auth=(self.key_id, self.key_secret))

    def fetch_orders(self, from_date: date, to_date: date) -> list[dict]:
        """
        Fetch Razorpay orders and map to payments table schema.
        Uses client.order.all() with timestamp-based filtering.
        """
        if not self.client:
            print("[Razorpay] Missing credentials or SDK, returning empty.")
            return []

        all_payments = []
        from_ts = int(datetime.combine(from_date, datetime.min.time(),
                                        tzinfo=timezone.utc).timestamp())
        to_ts = int(datetime.combine(to_date, datetime.max.time(),
                                      tzinfo=timezone.utc).timestamp())

        try:
            skip = 0
            count = 100
            while True:
                orders = self.client.order.all({
                    "from": from_ts,
                    "to": to_ts,
                    "count": count,
                    "skip": skip,
                })
                items = orders.get("items", [])
                if not items:
                    break

                for order in items:
                    amount_inr = order.get("amount", 0) / 100  # Razorpay uses paise
                    status = order.get("status", "created")

                    normalized = {
                        "merchant_id": self.merchant_id,
                        "payment_ref": order.get("id", ""),
                        "order_ref": order.get("receipt", ""),
                        "amount": amount_inr,
                        "status": status,
                        "payment_method": order.get("method", "unknown"),
                        "product_name": (order.get("notes") or {}).get("product", ""),
                        "source": "razorpay",
                        "source_row_ref": f"razorpay_orders#{order['id']}",
                        "payment_date": datetime.fromtimestamp(
                            order.get("created_at", 0), tz=timezone.utc
                        ).isoformat(),
                    }
                    all_payments.append(normalized)

                if len(items) < count:
                    break
                skip += count

        except Exception as e:
            print(f"[Razorpay] Error fetching orders: {e}")

        print(f"[Razorpay] Fetched {len(all_payments)} payment records")
        return all_payments

    def fetch_returns(self, from_date: date, to_date: date) -> list[dict]:
        """Fetch refunded payments."""
        all_payments = self.fetch_orders(from_date, to_date)
        refunds = [p for p in all_payments if p.get("status") == "refunded"]
        print(f"[Razorpay] Found {len(refunds)} refunds")
        return refunds

    def health_check(self) -> bool:
        """Check if Razorpay API is reachable."""
        if not self.client:
            return False
        try:
            # Fetch 1 order to test connectivity
            self.client.order.all({"count": 1})
            return True
        except Exception:
            return False
