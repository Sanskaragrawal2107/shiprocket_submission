"""
Shiprocket Connector — MOCK data generator.
Generates realistic delivery data with distributions designed to trigger agent conditions.

Distribution:
- 65% delivered, 15% failed, 12% in-transit, 8% returned
- Zone 5-6 BlueDart failure rate = 45% (triggers agent)
"""

import random
from datetime import date, datetime, timedelta
from .base import BaseConnector

# Courier → allowed zones
COURIERS = {
    "BlueDart": [1, 2, 3],
    "Delhivery": [2, 3, 4, 5],
    "Ekart": [4, 5, 6],
    "DTDC": [1, 2, 3, 4],
}

# Zone-based failure rates
ZONE_FAILURE_RATES = {
    1: 0.05, 2: 0.05,
    3: 0.12, 4: 0.12,
    5: 0.32, 6: 0.32,
}

# CRITICAL: BlueDart Zone 5-6 override (triggers agent)
BLUEDART_HIGH_ZONE_FAILURE = 0.45

# Shipping cost ranges by zone (INR)
SHIPPING_COSTS = {
    1: (60, 80),
    2: (85, 110),
    3: (85, 110),
    4: (130, 160),
    5: (130, 160),
    6: (180, 220),
}

CITIES = {
    1: ["Mumbai", "Delhi", "Bangalore"],
    2: ["Pune", "Hyderabad", "Chennai"],
    3: ["Jaipur", "Lucknow", "Ahmedabad"],
    4: ["Patna", "Bhopal", "Ranchi"],
    5: ["Guwahati", "Imphal", "Shillong"],
    6: ["Leh", "Srinagar", "Port Blair"],
}


class ShiprocketConnector(BaseConnector):
    """Mock connector generating realistic delivery data."""

    def __init__(self, merchant_id: str, credentials: dict | None = None):
        super().__init__(merchant_id, credentials)
        random.seed(42)  # Deterministic for reproducibility

    def _generate_deliveries(self, from_date: date, to_date: date) -> list[dict]:
        """Generate ~200 realistic delivery records."""
        deliveries = []
        num_records = 200
        date_range = (to_date - from_date).days or 1

        for i in range(num_records):
            # Pick a random courier and a valid zone for it
            courier = random.choice(list(COURIERS.keys()))
            zone = random.choice(COURIERS[courier])

            # Determine failure rate
            if courier == "BlueDart" and zone >= 5:
                failure_rate = BLUEDART_HIGH_ZONE_FAILURE
            else:
                failure_rate = ZONE_FAILURE_RATES.get(zone, 0.10)

            # Determine status based on distribution
            roll = random.random()
            if roll < failure_rate:
                status = "failed"
            elif roll < failure_rate + 0.08:
                status = "returned"
            elif roll < failure_rate + 0.08 + 0.12:
                status = "in-transit"
            else:
                status = "delivered"

            # Override to match overall distribution targets
            # 65% delivered, 15% failed, 12% in-transit, 8% returned
            if i % 100 < 65:
                if roll >= failure_rate:
                    status = "delivered"
            elif i % 100 < 80:
                status = "failed"
            elif i % 100 < 92:
                status = "in-transit"
            else:
                status = "returned"

            # But keep high failure for BlueDart Zone 5+
            if courier == "BlueDart" and zone >= 5 and random.random() < BLUEDART_HIGH_ZONE_FAILURE:
                status = "failed"

            # Dates
            dispatch_offset = random.randint(0, date_range - 1) if date_range > 1 else 0
            dispatch_date = from_date + timedelta(days=dispatch_offset)
            delivery_days = random.randint(1, 5) if status == "delivered" else None
            delivery_date = (dispatch_date + timedelta(days=delivery_days)) if delivery_days else None

            # Shipping cost based on zone
            cost_range = SHIPPING_COSTS.get(zone, (100, 150))
            shipping_cost = round(random.uniform(*cost_range), 2)

            city = random.choice(CITIES.get(zone, ["Unknown"]))

            deliveries.append({
                "merchant_id": self.merchant_id,
                "order_ref": f"ORD-{1000 + i}",
                "courier": courier,
                "zone": f"Zone {zone}",
                "status": status,
                "shipping_cost": shipping_cost,
                "city": city,
                "dispatch_date": dispatch_date.isoformat(),
                "delivery_date": delivery_date.isoformat() if delivery_date else None,
                "source": "shiprocket_mock",
                "source_row_ref": f"shiprocket_deliveries#{i}",
            })

        return deliveries

    async def fetch_orders(self, from_date: date, to_date: date) -> list[dict]:
        """Fetch mock delivery data (mapped as 'orders' from shiprocket perspective)."""
        deliveries = self._generate_deliveries(from_date, to_date)
        print(f"[Shiprocket Mock] Generated {len(deliveries)} delivery records")
        return deliveries

    async def fetch_returns(self, from_date: date, to_date: date) -> list[dict]:
        """Fetch returned/failed deliveries."""
        all_deliveries = self._generate_deliveries(from_date, to_date)
        returns = [d for d in all_deliveries if d["status"] in ("returned", "failed")]
        print(f"[Shiprocket Mock] Found {len(returns)} returns/failures")
        return returns

    async def health_check(self) -> bool:
        """Mock connector is always healthy."""
        return True
