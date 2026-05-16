"""
Meta Ads Connector — MOCK data generator.
Generates 30 days of campaign data with 3 campaigns.

Campaign 2 ("New Product Launch") has ROAS 1.9, below the 2.5 threshold → triggers agent.
"""

import random
from datetime import date, timedelta
from .base import BaseConnector

# Campaign definitions with target metrics
CAMPAIGNS = [
    {
        "campaign_id": "camp_001",
        "campaign_name": "Summer Sale",
        "daily_spend": 8000,
        "target_roas": 3.8,
        "ctr": 0.035,  # 3.5% click-through rate
        "conversion_rate": 0.045,  # 4.5% conversion rate
    },
    {
        "campaign_id": "camp_002",
        "campaign_name": "New Product Launch",
        "daily_spend": 12000,
        "target_roas": 1.9,  # BELOW 2.5 threshold — triggers agent
        "ctr": 0.018,  # 1.8% CTR (poor)
        "conversion_rate": 0.012,  # 1.2% conversion (poor)
    },
    {
        "campaign_id": "camp_003",
        "campaign_name": "Retargeting",
        "daily_spend": 3000,
        "target_roas": 4.2,
        "ctr": 0.052,  # 5.2% CTR (excellent)
        "conversion_rate": 0.068,  # 6.8% conversion (excellent)
    },
]


class MetaAdsConnector(BaseConnector):
    """Mock connector generating realistic Meta Ads campaign data."""

    def __init__(self, merchant_id: str, credentials: dict | None = None):
        super().__init__(merchant_id, credentials)
        random.seed(123)  # Deterministic

    def _generate_campaign_data(self, from_date: date, to_date: date) -> list[dict]:
        """Generate daily campaign metrics for all 3 campaigns."""
        records = []
        num_days = (to_date - from_date).days + 1

        for day_offset in range(num_days):
            current_date = from_date + timedelta(days=day_offset)

            for campaign in CAMPAIGNS:
                # Add ±15% daily variation
                variation = random.uniform(0.85, 1.15)
                spend = round(campaign["daily_spend"] * variation, 2)

                # Impressions = spend / CPM, assume CPM ₹150-250
                cpm = random.uniform(150, 250)
                impressions = int((spend / cpm) * 1000)

                # Clicks from CTR
                ctr_var = campaign["ctr"] * random.uniform(0.8, 1.2)
                clicks = int(impressions * ctr_var)

                # Conversions from conversion rate
                conv_var = campaign["conversion_rate"] * random.uniform(0.8, 1.2)
                conversions = int(clicks * conv_var)

                records.append({
                    "merchant_id": self.merchant_id,
                    "campaign_id": campaign["campaign_id"],
                    "campaign_name": campaign["campaign_name"],
                    "spend": spend,
                    "impressions": impressions,
                    "clicks": clicks,
                    "conversions": conversions,
                    "date": current_date.isoformat(),
                    "source": "meta_ads_mock",
                    "source_row_ref": f"meta_ads#{campaign['campaign_id']}#{current_date.isoformat()}",
                })

        return records

    async def fetch_orders(self, from_date: date, to_date: date) -> list[dict]:
        """Fetch mock campaign performance data."""
        data = self._generate_campaign_data(from_date, to_date)
        print(f"[Meta Ads Mock] Generated {len(data)} campaign records")
        return data

    async def fetch_returns(self, from_date: date, to_date: date) -> list[dict]:
        """No concept of returns in ads — return empty."""
        return []

    async def health_check(self) -> bool:
        """Mock connector is always healthy."""
        return True
