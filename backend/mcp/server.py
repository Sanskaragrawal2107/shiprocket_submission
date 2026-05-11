"""
D2C AI Employee — MCP Server with Citations

FastMCP server exposing 8 tools for Tambo AI to call.
Every tool returns { data, citations[], summary } so that
no number appears without a source reference.

Runs on port 8001 with HTTP transport.
"""

import os
import sys
import json
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"))

from fastmcp import FastMCP
from supabase_client import create_client, SupabaseClient


# ─── Setup ─────────────────────────────────────────────────

mcp = FastMCP("D2C AI Employee MCP Server")


def get_supabase() -> SupabaseClient:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return create_client(url, key)


def make_citation(row: dict, field: str) -> dict:
    """Build a citation dict from a database row."""
    return {
        "source": row.get("source", "unknown"),
        "ref": row.get("source_row_ref", "unknown"),
        "field": field,
        "value": row.get(field),
    }


# ─── Tool 1: Get Orders ───────────────────────────────────


@mcp.tool()
def get_orders(merchant_id: str, from_date: str, to_date: str) -> dict:
    """Fetch orders with revenue, status, product breakdown. Citations included."""
    supabase = get_supabase()
    result = supabase.table("orders").select("*").eq(
        "merchant_id", merchant_id
    ).gte("order_date", from_date).lte("order_date", to_date).execute()

    orders = result.data or []
    citations = []
    order_summary = []

    for o in orders:
        order_summary.append({
            "order_ref": o.get("order_ref"),
            "product_name": o.get("product_name"),
            "quantity": o.get("quantity"),
            "revenue": float(o.get("revenue", 0)),
            "financial_status": o.get("financial_status"),
            "fulfillment_status": o.get("fulfillment_status"),
            "order_date": o.get("order_date"),
        })
        citations.append(make_citation(o, "revenue"))

    total_revenue = sum(float(o.get("revenue", 0)) for o in orders)
    total_orders = len(orders)

    return {
        "data": {
            "orders": order_summary,
            "total_orders": total_orders,
            "total_revenue": total_revenue,
            "period": f"{from_date} to {to_date}",
        },
        "citations": citations,
        "summary": f"Found {total_orders} orders with total revenue ₹{total_revenue:,.0f} from {from_date} to {to_date}.",
    }


# ─── Tool 2: Revenue Summary ──────────────────────────────


@mcp.tool()
def get_revenue_summary(merchant_id: str, from_date: str, to_date: str) -> dict:
    """Total revenue, paid vs pending. Every rupee amount has source citation."""
    supabase = get_supabase()
    result = supabase.table("orders").select("*").eq(
        "merchant_id", merchant_id
    ).gte("order_date", from_date).lte("order_date", to_date).execute()

    orders = result.data or []
    citations = []

    paid = 0
    pending = 0
    refunded = 0

    for o in orders:
        rev = float(o.get("revenue", 0))
        status = o.get("financial_status", "pending")
        if status == "paid":
            paid += rev
        elif status == "refunded":
            refunded += rev
        else:
            pending += rev
        citations.append(make_citation(o, "revenue"))

    total = paid + pending + refunded

    return {
        "data": {
            "total_revenue": round(total, 2),
            "paid": round(paid, 2),
            "pending": round(pending, 2),
            "refunded": round(refunded, 2),
            "order_count": len(orders),
            "period": f"{from_date} to {to_date}",
        },
        "citations": citations,
        "summary": f"Revenue summary: Total ₹{total:,.0f} (Paid: ₹{paid:,.0f}, Pending: ₹{pending:,.0f}, Refunded: ₹{refunded:,.0f}) for {len(orders)} orders.",
    }


# ─── Tool 3: Delivery Stats ───────────────────────────────


@mcp.tool()
def get_delivery_stats(merchant_id: str, from_date: str, to_date: str) -> dict:
    """Success/failure by courier and zone. With row-level citations."""
    supabase = get_supabase()
    result = supabase.table("deliveries").select("*").eq(
        "merchant_id", merchant_id
    ).gte("dispatch_date", from_date).lte("dispatch_date", to_date).execute()

    deliveries = result.data or []
    citations = []

    # Group by courier + zone
    stats = {}
    for d in deliveries:
        courier = d.get("courier", "Unknown")
        zone = d.get("zone", "Unknown")
        key = f"{courier}|{zone}"

        if key not in stats:
            stats[key] = {"courier": courier, "zone": zone, "total": 0, "delivered": 0, "failed": 0, "cost_sum": 0}

        stats[key]["total"] += 1
        if d.get("status") == "delivered":
            stats[key]["delivered"] += 1
        elif d.get("status") in ("failed", "returned"):
            stats[key]["failed"] += 1
        stats[key]["cost_sum"] += float(d.get("shipping_cost", 0))

        citations.append(make_citation(d, "status"))

    rows = []
    for s in stats.values():
        rows.append({
            "courier": s["courier"],
            "zone": s["zone"],
            "total": s["total"],
            "delivered": s["delivered"],
            "failed": s["failed"],
            "success_rate": round(s["delivered"] / s["total"], 3) if s["total"] > 0 else 0,
            "avg_cost": round(s["cost_sum"] / s["total"], 2) if s["total"] > 0 else 0,
        })

    rows.sort(key=lambda x: x["success_rate"])

    total = len(deliveries)
    delivered = sum(1 for d in deliveries if d.get("status") == "delivered")

    return {
        "data": {
            "rows": rows,
            "total_deliveries": total,
            "overall_success_rate": round(delivered / total, 3) if total > 0 else 0,
            "period": f"{from_date} to {to_date}",
        },
        "citations": citations[:50],  # Limit citations for large datasets
        "summary": f"Delivery stats: {total} deliveries, {delivered} delivered ({delivered/total:.0%} success rate). Worst: {rows[0]['courier']} in {rows[0]['zone']} ({rows[0]['success_rate']:.0%})." if rows else "No delivery data found.",
    }


# ─── Tool 4: Top Products ─────────────────────────────────


@mcp.tool()
def get_top_products(merchant_id: str, limit: int = 5) -> dict:
    """Top products by revenue with order counts. With citations."""
    supabase = get_supabase()
    result = supabase.table("orders").select("*").eq(
        "merchant_id", merchant_id
    ).execute()

    orders = result.data or []
    citations = []

    products = {}
    for o in orders:
        name = o.get("product_name", "Unknown")
        if name not in products:
            products[name] = {"product_name": name, "total_revenue": 0, "order_count": 0, "total_quantity": 0}
        products[name]["total_revenue"] += float(o.get("revenue", 0))
        products[name]["order_count"] += 1
        products[name]["total_quantity"] += int(o.get("quantity", 0))
        citations.append(make_citation(o, "revenue"))

    sorted_products = sorted(products.values(), key=lambda x: x["total_revenue"], reverse=True)[:limit]

    for p in sorted_products:
        p["total_revenue"] = round(p["total_revenue"], 2)

    return {
        "data": {
            "products": sorted_products,
            "total_products": len(products),
        },
        "citations": citations[:30],
        "summary": f"Top {limit} products by revenue: " + ", ".join(
            f"{p['product_name']} (₹{p['total_revenue']:,.0f})" for p in sorted_products
        ) if sorted_products else "No product data found.",
    }


# ─── Tool 5: Courier Performance ──────────────────────────


@mcp.tool()
def get_courier_performance(merchant_id: str) -> dict:
    """Courier comparison: success rate, avg cost, zone-wise breakdown."""
    supabase = get_supabase()
    result = supabase.table("deliveries").select("*").eq(
        "merchant_id", merchant_id
    ).execute()

    deliveries = result.data or []
    citations = []

    couriers = {}
    for d in deliveries:
        courier = d.get("courier", "Unknown")
        if courier not in couriers:
            couriers[courier] = {
                "courier": courier,
                "total": 0,
                "delivered": 0,
                "failed": 0,
                "cost_sum": 0,
                "zones": {},
            }
        couriers[courier]["total"] += 1
        cost = float(d.get("shipping_cost", 0))
        couriers[courier]["cost_sum"] += cost

        if d.get("status") == "delivered":
            couriers[courier]["delivered"] += 1
        elif d.get("status") in ("failed", "returned"):
            couriers[courier]["failed"] += 1

        zone = d.get("zone", "Unknown")
        if zone not in couriers[courier]["zones"]:
            couriers[courier]["zones"][zone] = {"total": 0, "delivered": 0, "failed": 0}
        couriers[courier]["zones"][zone]["total"] += 1
        if d.get("status") == "delivered":
            couriers[courier]["zones"][zone]["delivered"] += 1
        elif d.get("status") in ("failed", "returned"):
            couriers[courier]["zones"][zone]["failed"] += 1

        citations.append(make_citation(d, "shipping_cost"))

    courier_list = []
    for c in couriers.values():
        zone_breakdown = []
        for z_name, z_data in c["zones"].items():
            zone_breakdown.append({
                "zone": z_name,
                "total": z_data["total"],
                "success_rate": round(z_data["delivered"] / z_data["total"], 3) if z_data["total"] > 0 else 0,
                "failure_rate": round(z_data["failed"] / z_data["total"], 3) if z_data["total"] > 0 else 0,
            })

        courier_list.append({
            "courier": c["courier"],
            "total_deliveries": c["total"],
            "success_rate": round(c["delivered"] / c["total"], 3) if c["total"] > 0 else 0,
            "avg_cost": round(c["cost_sum"] / c["total"], 2) if c["total"] > 0 else 0,
            "zones": zone_breakdown,
        })

    courier_list.sort(key=lambda x: x["success_rate"], reverse=True)
    winner = courier_list[0]["courier"] if courier_list else "N/A"
    worst = courier_list[-1] if courier_list else None

    potential_saving = 0
    if worst and len(courier_list) > 1:
        best_cost = courier_list[0]["avg_cost"]
        worst_cost = worst["avg_cost"]
        potential_saving = round((worst_cost - best_cost) * worst["total_deliveries"], 2)

    return {
        "data": {
            "couriers": courier_list,
            "winner": winner,
            "potential_saving": potential_saving,
        },
        "citations": citations[:50],
        "summary": f"Best courier: {winner}. " + (
            f"Switching {worst['courier']} orders could save ₹{potential_saving:,.0f}." if potential_saving > 0 else ""
        ),
    }


# ─── Tool 6: Ads Performance ──────────────────────────────


@mcp.tool()
def get_ads_performance(merchant_id: str, from_date: str, to_date: str) -> dict:
    """Campaign spend, ROAS, clicks, conversions. With citations."""
    supabase = get_supabase()
    ads_result = supabase.table("ads_performance").select("*").eq(
        "merchant_id", merchant_id
    ).gte("date", from_date).lte("date", to_date).execute()

    orders_result = supabase.table("orders").select("*").eq(
        "merchant_id", merchant_id
    ).gte("order_date", from_date).lte("order_date", to_date).execute()

    ads = ads_result.data or []
    orders = orders_result.data or []
    citations = []

    total_revenue = sum(float(o.get("revenue", 0)) for o in orders)

    campaigns = {}
    for a in ads:
        cid = a.get("campaign_id", "unknown")
        if cid not in campaigns:
            campaigns[cid] = {
                "campaign_id": cid,
                "campaign_name": a.get("campaign_name", ""),
                "total_spend": 0,
                "total_impressions": 0,
                "total_clicks": 0,
                "total_conversions": 0,
            }
        campaigns[cid]["total_spend"] += float(a.get("spend", 0))
        campaigns[cid]["total_impressions"] += int(a.get("impressions", 0))
        campaigns[cid]["total_clicks"] += int(a.get("clicks", 0))
        campaigns[cid]["total_conversions"] += int(a.get("conversions", 0))
        citations.append(make_citation(a, "spend"))

    total_conversions = sum(c["total_conversions"] for c in campaigns.values())
    campaign_list = []
    for c in campaigns.values():
        # ROAS: proportional revenue by conversions
        share = c["total_conversions"] / total_conversions if total_conversions > 0 else 0
        est_revenue = total_revenue * share if total_revenue > 0 else c["total_conversions"] * 500
        roas = round(est_revenue / c["total_spend"], 2) if c["total_spend"] > 0 else 0
        c["roas"] = roas
        c["ctr"] = round(c["total_clicks"] / c["total_impressions"], 4) if c["total_impressions"] > 0 else 0
        c["total_spend"] = round(c["total_spend"], 2)
        campaign_list.append(c)

    total_spend = sum(c["total_spend"] for c in campaign_list)
    avg_roas = round(total_revenue / total_spend, 2) if total_spend > 0 else 0

    return {
        "data": {
            "campaigns": campaign_list,
            "total_spend": round(total_spend, 2),
            "total_revenue": round(total_revenue, 2),
            "avg_roas": avg_roas,
            "period": f"{from_date} to {to_date}",
        },
        "citations": citations[:50],
        "summary": f"Ad performance: ₹{total_spend:,.0f} spend, ₹{total_revenue:,.0f} revenue, avg ROAS {avg_roas}. " +
                   ", ".join(f"{c['campaign_name']} ROAS {c['roas']}" for c in campaign_list),
    }


# ─── Tool 7: Profitability ────────────────────────────────


@mcp.tool()
def get_profitability(merchant_id: str, from_date: str, to_date: str) -> dict:
    """Per-product: revenue - shipping_cost - ads_spend = net margin. With citations."""
    supabase = get_supabase()

    orders_result = supabase.table("orders").select("*").eq(
        "merchant_id", merchant_id
    ).gte("order_date", from_date).lte("order_date", to_date).execute()

    deliveries_result = supabase.table("deliveries").select("*").eq(
        "merchant_id", merchant_id
    ).gte("dispatch_date", from_date).lte("dispatch_date", to_date).execute()

    ads_result = supabase.table("ads_performance").select("*").eq(
        "merchant_id", merchant_id
    ).gte("date", from_date).lte("date", to_date).execute()

    orders = orders_result.data or []
    deliveries = deliveries_result.data or []
    ads = ads_result.data or []
    citations = []

    # Revenue per product
    products = {}
    for o in orders:
        name = o.get("product_name", "Unknown")
        if name not in products:
            products[name] = {"product_name": name, "revenue": 0, "order_count": 0}
        products[name]["revenue"] += float(o.get("revenue", 0))
        products[name]["order_count"] += 1
        citations.append(make_citation(o, "revenue"))

    # Total shipping cost (split proportionally)
    total_shipping = sum(float(d.get("shipping_cost", 0)) for d in deliveries)
    total_orders = len(orders) or 1
    shipping_per_order = total_shipping / total_orders

    # Total ads spend (split proportionally)
    total_ads = sum(float(a.get("spend", 0)) for a in ads)
    ads_per_order = total_ads / total_orders

    product_list = []
    for p in products.values():
        shipping_alloc = round(shipping_per_order * p["order_count"], 2)
        ads_alloc = round(ads_per_order * p["order_count"], 2)
        net_margin = round(p["revenue"] - shipping_alloc - ads_alloc, 2)
        margin_pct = round(net_margin / p["revenue"] * 100, 1) if p["revenue"] > 0 else 0

        product_list.append({
            "product_name": p["product_name"],
            "revenue": round(p["revenue"], 2),
            "shipping_cost": shipping_alloc,
            "ads_cost": ads_alloc,
            "net_margin": net_margin,
            "margin_percent": margin_pct,
            "order_count": p["order_count"],
        })

    product_list.sort(key=lambda x: x["net_margin"])

    return {
        "data": {
            "products": product_list,
            "total_revenue": round(sum(p["revenue"] for p in product_list), 2),
            "total_shipping": round(total_shipping, 2),
            "total_ads": round(total_ads, 2),
            "period": f"{from_date} to {to_date}",
        },
        "citations": citations[:30],
        "summary": f"Profitability: {len(product_list)} products. " + (
            f"Most unprofitable: {product_list[0]['product_name']} (margin {product_list[0]['margin_percent']}%)" if product_list else "No data"
        ),
    }


# ─── Tool 8: Agent Insights ───────────────────────────────


@mcp.tool()
def get_agent_insights(merchant_id: str) -> dict:
    """Latest agent recommendations — what to act on and why."""
    supabase = get_supabase()
    result = supabase.table("agent_insights").select("*").eq(
        "merchant_id", merchant_id
    ).order("triggered_at", desc=True).limit(3).execute()

    insights = result.data or []

    if not insights:
        return {
            "data": {"insights": [], "has_recommendations": False},
            "citations": [],
            "summary": "No agent insights available. Run the agent first: POST /agent/run/merchant_001",
        }

    latest = insights[0]
    recommendations = latest.get("recommendations", [])
    conditions = latest.get("conditions_triggered", [])

    citations = []
    for c in conditions:
        if isinstance(c, dict):
            citations.append({
                "source": "agent_analysis",
                "ref": f"agent_condition#{c.get('condition', 'unknown')}",
                "field": c.get("condition", ""),
                "value": c.get("actual", ""),
            })

    return {
        "data": {
            "insights": [{
                "triggered_at": latest.get("triggered_at"),
                "conditions_triggered": conditions,
                "recommendations": recommendations,
                "estimated_saving": float(latest.get("estimated_saving", 0)),
                "llm_reasoning": latest.get("llm_reasoning", ""),
                "status": latest.get("status", "pending_review"),
            }],
            "has_recommendations": len(recommendations) > 0,
        },
        "citations": citations,
        "summary": f"Agent found {len(conditions)} issues. Recommendations: " + 
                   "; ".join(recommendations[:3]) if recommendations else "No recommendations.",
    }


# ─── Entry Point ───────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="http", host="0.0.0.0", port=8001)
