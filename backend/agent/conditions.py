"""
Agent Conditions — 6 threshold checks, pure Python math.
NO LLM calls here. This is the fast filter that runs for every merchant.

Only merchants that trigger at least one condition will get an LLM call.
Scale: 10,000 merchants × Python check = fast. Cost = O(anomalies) not O(merchants).
"""

THRESHOLDS = {
    "delivery_failure_rate": 0.15,    # >15% triggers
    "return_rate": 0.10,              # >10% triggers
    "roas_min": 2.5,                  # <2.5 triggers
    "shipping_cost_per_order": 120,   # >₹120 triggers
    "weekly_order_drop": 0.30,        # >30% drop vs last week triggers
    "settlement_gap": 0.25,           # >25% gap triggers
}


def check_delivery_failure_rate(deliveries: list[dict]) -> dict | None:
    """Check if delivery failure rate exceeds 15%."""
    if not deliveries:
        return None
    
    total = len(deliveries)
    failed = sum(1 for d in deliveries if d.get("status") in ("failed", "returned"))
    rate = failed / total

    if rate > THRESHOLDS["delivery_failure_rate"]:
        return {
            "condition": "delivery_failure_rate",
            "threshold": THRESHOLDS["delivery_failure_rate"],
            "actual": round(rate, 3),
            "message": f"Delivery failure rate is {rate:.1%} (threshold: {THRESHOLDS['delivery_failure_rate']:.0%})",
            "details": {
                "total_deliveries": total,
                "failed_count": failed,
            }
        }
    return None


def check_return_rate(orders: list[dict]) -> dict | None:
    """Check if return rate exceeds 10%."""
    if not orders:
        return None
    
    total = len(orders)
    returned = sum(1 for o in orders if o.get("fulfillment_status") == "restocked")
    rate = returned / total if total > 0 else 0

    if rate > THRESHOLDS["return_rate"]:
        return {
            "condition": "return_rate",
            "threshold": THRESHOLDS["return_rate"],
            "actual": round(rate, 3),
            "message": f"Return rate is {rate:.1%} (threshold: {THRESHOLDS['return_rate']:.0%})",
            "details": {
                "total_orders": total,
                "returned_count": returned,
            }
        }
    return None


def check_roas(ads_data: list[dict], orders: list[dict]) -> dict | None:
    """Check if overall ROAS is below 2.5, using actual order revenue / actual ad spend."""
    if not ads_data:
        return None

    total_ad_spend = sum(float(ad.get("spend", 0)) for ad in ads_data)
    if total_ad_spend <= 0:
        return None

    # Use REAL revenue from orders table — no guessing
    total_revenue = sum(float(o.get("revenue", 0)) for o in orders) if orders else 0

    if total_revenue <= 0:
        # No revenue data available — skip ROAS check rather than hallucinate
        return None

    overall_roas = total_revenue / total_ad_spend

    if overall_roas < THRESHOLDS["roas_min"]:
        return {
            "condition": "roas_min",
            "threshold": THRESHOLDS["roas_min"],
            "actual": round(overall_roas, 2),
            "message": (
                f"Overall ROAS is {overall_roas:.2f} (threshold: {THRESHOLDS['roas_min']}) "
                f"— ₹{total_revenue:.0f} revenue / ₹{total_ad_spend:.0f} ad spend"
            ),
            "details": {
                "total_ad_spend": round(total_ad_spend, 2),
                "total_revenue": round(total_revenue, 2),
                "overall_roas": round(overall_roas, 2),
            },
        }
    return None


def check_shipping_cost(deliveries: list[dict]) -> dict | None:
    """Check if average shipping cost per order exceeds ₹120."""
    if not deliveries:
        return None

    costs = [float(d.get("shipping_cost", 0)) for d in deliveries if d.get("shipping_cost")]
    if not costs:
        return None

    avg_cost = sum(costs) / len(costs)

    if avg_cost > THRESHOLDS["shipping_cost_per_order"]:
        return {
            "condition": "shipping_cost_per_order",
            "threshold": THRESHOLDS["shipping_cost_per_order"],
            "actual": round(avg_cost, 2),
            "message": f"Avg shipping cost ₹{avg_cost:.0f}/order (threshold: ₹{THRESHOLDS['shipping_cost_per_order']})",
            "details": {
                "avg_cost": round(avg_cost, 2),
                "total_deliveries": len(costs),
                "total_shipping_spend": round(sum(costs), 2),
            }
        }
    return None


def check_weekly_order_drop(orders: list[dict]) -> dict | None:
    """Check if this week's orders dropped >30% vs last week."""
    if not orders:
        return None

    from datetime import date, timedelta, datetime

    today = date.today()
    week_start = today - timedelta(days=7)
    prev_week_start = today - timedelta(days=14)

    this_week = 0
    last_week = 0

    for o in orders:
        order_date_str = o.get("order_date", "")
        try:
            if isinstance(order_date_str, str):
                od = datetime.fromisoformat(order_date_str.replace("Z", "+00:00")).date()
            else:
                od = order_date_str
            if week_start <= od <= today:
                this_week += 1
            elif prev_week_start <= od < week_start:
                last_week += 1
        except (ValueError, TypeError):
            continue

    if last_week > 0:
        drop = (last_week - this_week) / last_week
        if drop > THRESHOLDS["weekly_order_drop"]:
            return {
                "condition": "weekly_order_drop",
                "threshold": THRESHOLDS["weekly_order_drop"],
                "actual": round(drop, 3),
                "message": f"Orders dropped {drop:.0%} this week ({this_week}) vs last week ({last_week})",
                "details": {
                    "this_week_orders": this_week,
                    "last_week_orders": last_week,
                }
            }
    return None


def check_settlement_gap(orders: list[dict], payments: list[dict]) -> dict | None:
    """Check if settlement gap (order revenue vs payment received) exceeds 25%."""
    if not orders or not payments:
        return None

    total_order_revenue = sum(float(o.get("revenue", 0)) for o in orders)
    # Accept both 'paid' and 'created' statuses — Razorpay uses 'created' for captured payments
    settled_statuses = {"paid", "created", "captured", "settled"}
    total_payments = sum(
        float(p.get("amount", 0))
        for p in payments
        if p.get("status", "").lower() in settled_statuses
    )

    if total_order_revenue > 0:
        gap = (total_order_revenue - total_payments) / total_order_revenue
        if gap > THRESHOLDS["settlement_gap"]:
            return {
                "condition": "settlement_gap",
                "threshold": THRESHOLDS["settlement_gap"],
                "actual": round(gap, 3),
                "message": (
                    f"Settlement gap is {gap:.0%}: "
                    f"₹{total_order_revenue:.0f} ordered vs ₹{total_payments:.0f} settled"
                ),
                "details": {
                    "total_order_revenue": round(total_order_revenue, 2),
                    "total_payments_settled": round(total_payments, 2),
                    "gap_amount": round(total_order_revenue - total_payments, 2),
                },
            }
    return None


def run_all_checks(
    orders: list[dict],
    deliveries: list[dict],
    payments: list[dict],
    ads_data: list[dict],
) -> list[dict]:
    """
    Run all 6 threshold checks.
    Returns a list of triggered conditions (empty list = no anomalies).
    """
    triggered = []

    checks = [
        check_delivery_failure_rate(deliveries),
        check_return_rate(orders),
        check_roas(ads_data, orders),
        check_shipping_cost(deliveries),
        check_weekly_order_drop(orders),
        check_settlement_gap(orders, payments),
    ]

    for result in checks:
        if result is not None:
            triggered.append(result)

    return triggered
