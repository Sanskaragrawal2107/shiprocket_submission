"""SQL-first agent engine for anomaly detection and recommendations.

The cheap metric scan runs before any LLM call. This is intentional for scale:
for large merchant counts, only anomalous merchants should reach the model.
That keeps the LLM workload proportional to anomalies instead of total tenants.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from openai import AsyncOpenAI

from db import (
    DEFAULT_THRESHOLD_ROWS,
    create_notification,
    get_merchant_context,
    get_threshold_rows,
    list_agent_insights,
    fetch_merchant_rows,
    save_agent_insight,
)

logger = logging.getLogger(__name__)

SETTLED_PAYMENT_STATUSES = {"paid", "created", "captured", "settled"}
FAILED_PAYMENT_STATUSES = {"failed", "cancelled", "expired"}
DELIVERED_STATUSES = {"delivered"}
FAILED_DELIVERY_STATUSES = {"failed", "returned"}


@dataclass(slots=True)
class MerchantFacts:
    metrics: dict[str, float]
    raw_counts: dict[str, Any]
    source_tables: dict[str, str]


def _threshold_map(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not rows:
        rows = DEFAULT_THRESHOLD_ROWS
    return {
        row["metric"]: {
            "threshold_value": float(row["threshold_value"]),
            "operator": row["operator"],
        }
        for row in rows
    }


def _fetch_window() -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=30)


def _safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _calculate_facts(merchant_id: str) -> MerchantFacts:
    from_date = _fetch_window()

    orders = fetch_merchant_rows("orders", merchant_id, "order_date", from_date)
    deliveries = fetch_merchant_rows("deliveries", merchant_id, "dispatch_date", from_date)
    payments = fetch_merchant_rows("payments", merchant_id, "payment_date", from_date)
    meta_ads = fetch_merchant_rows("meta_ads", merchant_id, "date", from_date)

    total_orders = len(orders)
    total_deliveries = len(deliveries)
    failed_deliveries = sum(1 for item in deliveries if str(item.get("status", "")).lower() in FAILED_DELIVERY_STATUSES)
    delivered_deliveries = sum(1 for item in deliveries if str(item.get("status", "")).lower() in DELIVERED_STATUSES)

    total_revenue = sum(_safe_float(item.get("revenue")) for item in orders)
    total_ad_spend = sum(_safe_float(item.get("spend")) for item in meta_ads)
    total_payments = sum(_safe_float(item.get("amount")) for item in payments)
    settled_payments = sum(
        _safe_float(item.get("amount"))
        for item in payments
        if str(item.get("status", "")).lower() in SETTLED_PAYMENT_STATUSES
    )
    failed_payments = sum(
        _safe_float(item.get("amount"))
        for item in payments
        if str(item.get("status", "")).lower() in FAILED_PAYMENT_STATUSES
    )
    payments_pending = max(total_payments - settled_payments, 0)
    unsettled_payments = payments_pending
    delivery_days = []
    for item in deliveries:
        if str(item.get("status", "")).lower() not in DELIVERED_STATUSES:
            continue
        dispatch_date = item.get("dispatch_date")
        delivery_date = item.get("delivery_date")
        if not dispatch_date or not delivery_date:
            continue
        try:
            dispatch_dt = datetime.fromisoformat(str(dispatch_date).replace("Z", "+00:00"))
            delivery_dt = datetime.fromisoformat(str(delivery_date).replace("Z", "+00:00"))
            delivery_days.append((delivery_dt - dispatch_dt).days)
        except ValueError:
            continue

    delivery_delay_days = (sum(delivery_days) / len(delivery_days)) if delivery_days else 0.0

    metrics = {
        "total_orders": float(total_orders),
        "rto_rate": round((failed_deliveries / total_orders) * 100, 2) if total_orders else 0.0,
        "roas": round((total_revenue / total_ad_spend), 2) if total_ad_spend else 0.0,
        "settlement_gap_percent": round((unsettled_payments / total_payments) * 100, 2) if total_payments else 0.0,
        "payment_failure_rate": round((failed_payments / total_payments) * 100, 2) if total_payments else 0.0,
        "delivery_delay_days": round(delivery_delay_days, 2),
    }

    raw_counts = {
        "total_orders": total_orders,
        "total_deliveries": total_deliveries,
        "failed_deliveries": failed_deliveries,
        "delivered_deliveries": delivered_deliveries,
        "total_revenue": round(total_revenue, 2),
        "total_ad_spend": round(total_ad_spend, 2),
        "total_payments": round(total_payments, 2),
        "settled_payments": round(settled_payments, 2),
        "unsettled_payments": round(unsettled_payments, 2),
        "failed_payments": round(failed_payments, 2),
    }

    source_tables = {
        "rto_rate": "deliveries",
        "roas": "orders/meta_ads",
        "settlement_gap_percent": "payments/orders",
        "payment_failure_rate": "payments",
        "delivery_delay_days": "deliveries",
    }

    return MerchantFacts(metrics=metrics, raw_counts=raw_counts, source_tables=source_tables)


def _summary_citation(source: str, table: str, row_id: str, field: str, value: Any) -> dict[str, Any]:
    return {
        "source": source,
        "ref": f"{table}#{row_id}",
        "field": field,
        "value": value,
    }


def build_profitability_snapshot(
    merchant_id: str,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
) -> dict[str, Any]:
    window_end = to_date or datetime.now(timezone.utc)
    window_start = from_date or (window_end - timedelta(days=7))

    orders = fetch_merchant_rows("orders", merchant_id, "order_date", window_start)
    deliveries = fetch_merchant_rows("deliveries", merchant_id, "dispatch_date", window_start)
    payments = fetch_merchant_rows("payments", merchant_id, "payment_date", window_start)
    meta_ads = fetch_merchant_rows("meta_ads", merchant_id, "date", window_start)

    total_orders = len(orders)
    total_deliveries = len(deliveries)
    total_revenue = sum(_safe_float(item.get("revenue")) for item in orders)
    total_shipping = sum(_safe_float(item.get("shipping_cost")) for item in deliveries)
    total_ads = sum(_safe_float(item.get("spend")) for item in meta_ads)
    total_payments = sum(_safe_float(item.get("amount")) for item in payments)
    settled_payments = sum(
        _safe_float(item.get("amount"))
        for item in payments
        if str(item.get("status", "")).lower() in SETTLED_PAYMENT_STATUSES
    )
    failed_payments = sum(
        _safe_float(item.get("amount"))
        for item in payments
        if str(item.get("status", "")).lower() in FAILED_PAYMENT_STATUSES
    )
    failed_deliveries = sum(
        1 for item in deliveries
        if str(item.get("status", "")).lower() in FAILED_DELIVERY_STATUSES
    )
    delivered_deliveries = sum(
        1 for item in deliveries
        if str(item.get("status", "")).lower() in DELIVERED_STATUSES
    )

    payments_pending = max(total_payments - settled_payments, 0)
    unsettled_payments = payments_pending
    delivery_success_rate = round((delivered_deliveries / total_deliveries) * 100, 1) if total_deliveries else 0.0
    delivery_failure_rate = round((failed_deliveries / total_deliveries) * 100, 1) if total_deliveries else 0.0
    payment_gap_rate = round((payments_pending / total_payments) * 100, 1) if total_payments else 0.0
    overall_roas = round((total_revenue / total_ads), 2) if total_ads else 0.0

    product_rows: dict[str, dict[str, Any]] = {}
    for order in orders:
        product_name = order.get("product_name") or "Unknown product"
        bucket = product_rows.setdefault(
            product_name,
            {
                "product_name": product_name,
                "revenue": 0.0,
                "order_count": 0,
                "sample_refs": [],
            },
        )
        bucket["revenue"] += _safe_float(order.get("revenue"))
        bucket["order_count"] += 1
        if order.get("source_row_ref"):
            bucket["sample_refs"].append(order["source_row_ref"])

    shipping_per_order = (total_shipping / total_orders) if total_orders else 0.0
    ads_per_order = (total_ads / total_orders) if total_orders else 0.0

    product_list: list[dict[str, Any]] = []
    for product in product_rows.values():
        shipping_alloc = round(shipping_per_order * product["order_count"], 2)
        ads_alloc = round(ads_per_order * product["order_count"], 2)
        net_margin = round(product["revenue"] - shipping_alloc - ads_alloc, 2)
        margin_pct = round((net_margin / product["revenue"]) * 100, 1) if product["revenue"] else 0.0
        product_list.append(
            {
                "product_name": product["product_name"],
                "order_count": product["order_count"],
                "revenue": round(product["revenue"], 2),
                "shipping_cost": shipping_alloc,
                "ads_cost": ads_alloc,
                "net_margin": net_margin,
                "margin_percent": margin_pct,
                "sample_refs": product["sample_refs"][:2],
            }
        )

    product_list.sort(key=lambda item: item["net_margin"])
    least_profitable = product_list[0] if product_list else None

    drivers: list[dict[str, Any]] = []
    if total_ads > 0:
        drivers.append(
            {
                "label": "Ad spend",
                "value": round(total_ads, 2),
                "detail": f"ROAS {overall_roas:.2f}" if overall_roas else "No measurable ROAS",
            }
        )
    if total_deliveries > 0:
        drivers.append(
            {
                "label": "Deliveries",
                "value": total_deliveries,
                "detail": f"{delivery_failure_rate:.1f}% failed / returned",
            }
        )
    if total_payments > 0:
        drivers.append(
            {
                "label": "Payments",
                "value": round(total_payments, 2),
                "detail": f"{payment_gap_rate:.1f}% unsettled",
            }
        )

    if total_ads > 0 and overall_roas and overall_roas < 1:
        root_cause = {
            "title": "Paid acquisition is unprofitable",
            "summary": f"Revenue is below ad spend, so the least profitable SKU is being pulled down primarily by paid acquisition inefficiency.",
            "drivers": drivers[:2],
        }
    elif delivery_failure_rate >= 15:
        root_cause = {
            "title": "Delivery failures are hurting margin",
            "summary": f"{delivery_failure_rate:.1f}% of shipments failed or returned, which increases re-attempt cost and reduces realized revenue.",
            "drivers": drivers[:2],
        }
    elif payment_gap_rate >= 15:
        root_cause = {
            "title": "Payment settlement gap is high",
            "summary": f"{payment_gap_rate:.1f}% of payment amount is still unsettled, so margin is being delayed or lost to failed capture.",
            "drivers": drivers[:2],
        }
    else:
        root_cause = {
            "title": "Mixed operational drag",
            "summary": "The product is not profitable because shipping, ads, and payment friction are collectively consuming the margin.",
            "drivers": drivers[:3],
        }

    citations: list[dict[str, Any]] = []
    if least_profitable:
        sample_ref = least_profitable["sample_refs"][0] if least_profitable["sample_refs"] else f"product:{least_profitable['product_name']}"
        citations.append(_summary_citation("shopify", "orders", sample_ref, "revenue", least_profitable["revenue"]))

    citations.append(_summary_citation("shiprocket", "deliveries", f"aggregate:{window_start.date().isoformat()}", "delivery_failure_rate", delivery_failure_rate))
    citations.append(_summary_citation("razorpay", "payments", f"aggregate:{window_start.date().isoformat()}", "payment_gap_rate", payment_gap_rate))
    citations.append(_summary_citation("meta_ads", "meta_ads", f"aggregate:{window_start.date().isoformat()}", "total_spend", round(total_ads, 2)))

    return {
        "merchant_id": merchant_id,
        "period": f"{window_start.date().isoformat()} to {window_end.date().isoformat()}",
        "summary": {
            "total_orders": total_orders,
            "total_revenue": round(total_revenue, 2),
            "total_shipping": round(total_shipping, 2),
            "total_ads": round(total_ads, 2),
            "delivery_success_rate": delivery_success_rate,
            "delivery_failure_rate": delivery_failure_rate,
            "payment_gap_rate": payment_gap_rate,
            "overall_roas": overall_roas,
        },
        "least_profitable_product": least_profitable,
        "root_cause": root_cause,
        "products": product_list[:5],
        "citations": citations,
    }


def _find_anomalies(metrics: dict[str, float], thresholds: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    for metric, config in thresholds.items():
        if metric not in metrics:
            continue
        value = metrics[metric]
        threshold = float(config["threshold_value"])
        operator = config["operator"]
        is_triggered = (operator == "greater_than" and value > threshold) or (
            operator == "less_than" and value < threshold
        )
        if is_triggered:
            anomalies.append(
                {
                    "metric": metric,
                    "value": value,
                    "threshold": threshold,
                    "operator": operator,
                    "source_table": metric,
                }
            )
    return anomalies


def _build_prompt(metrics: dict[str, float], raw_counts: dict[str, Any], anomalies: list[dict[str, Any]]) -> str:
    return (
        "You are a D2C business analyst. Use ONLY the data provided below. "
        "Do not assume, invent, or hallucinate any values. "
        "If a value needed for savings calculation is not in the provided data, return estimated_saving as null. "
        "Every recommendation must cite its source metric and table.\n\n"
        f"Metrics: {json.dumps(metrics, indent=2)}\n\n"
        f"Raw counts: {json.dumps(raw_counts, indent=2)}\n\n"
        f"Anomalies: {json.dumps(anomalies, indent=2)}\n\n"
        "Return only JSON with this shape:\n"
        "{\n"
        '  "recommendations": [\n'
        "    {\n"
        '      "title": "string",\n'
        '      "issue": "string",\n'
        '      "action": "string",\n'
        '      "priority": "P0|P1|P2",\n'
        '      "estimated_saving": number | null,\n'
        '      "evidence": [{"metric": "string", "value": number, "threshold": number, "source_table": "string"}],\n'
        '      "assumptions_used": []\n'
        "    }\n"
        "  ]\n"
        "}"
    )


def _validate_recommendations(
    payload: dict[str, Any],
    facts: MerchantFacts,
    thresholds: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    recommendations = payload.get("recommendations", [])
    valid: list[dict[str, Any]] = []

    for recommendation in recommendations:
        evidence = recommendation.get("evidence") or []
        if not evidence:
            logger.warning("Dropping recommendation with empty evidence: %s", recommendation.get("title"))
            continue

        invalid_evidence = False
        for item in evidence:
            metric = item.get("metric")
            if metric not in facts.metrics:
                invalid_evidence = True
                break
            if round(float(item.get("value", 0)), 2) != round(float(facts.metrics[metric]), 2):
                invalid_evidence = True
                break
            expected_threshold = float(thresholds.get(metric, {}).get("threshold_value", _threshold_for_metric(metric)))
            if round(float(item.get("threshold", 0)), 2) != round(expected_threshold, 2):
                invalid_evidence = True
                break
        if invalid_evidence:
            logger.warning("Dropping invalid recommendation evidence for %s", recommendation.get("title"))
            continue

        estimated_saving = recommendation.get("estimated_saving")
        if estimated_saving is not None and not isinstance(estimated_saving, (int, float)):
            logger.warning("Dropping invalid estimated_saving for %s", recommendation.get("title"))
            continue

        valid.append(recommendation)

    return valid


def _threshold_for_metric(metric: str) -> float:
    for row in DEFAULT_THRESHOLD_ROWS:
        if row["metric"] == metric:
            return float(row["threshold_value"])
    return 0.0


def _save_anomaly_snapshot(
    merchant_id: str,
    metrics_checked: dict[str, Any],
    thresholds: dict[str, dict[str, Any]],
    anomalies: list[dict[str, Any]],
    *,
    llm_called: bool,
    recommendations: list[dict[str, Any]] | None = None,
    llm_raw_output: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "merchant_id": merchant_id,
        "triggered_at": datetime.now(timezone.utc).isoformat(),
        "conditions_triggered": anomalies,
        "data_snapshot": {
            "metrics_checked": metrics_checked,
            "thresholds": thresholds,
            "anomalies": anomalies,
            "llm_called": llm_called,
        },
        "llm_reasoning": "LLM response unavailable; saved deterministic anomaly snapshot." if not llm_called else None,
        "recommendations": recommendations or [],
        "estimated_saving": None,
        "status": "anomalies_detected" if anomalies else "no_anomalies",
    }
    if llm_raw_output is not None:
        payload["data_snapshot"]["llm_raw_output"] = llm_raw_output
    return save_agent_insight(payload)


async def run_agent_for_merchant(merchant_id: str) -> dict[str, Any]:
    merchant = get_merchant_context(merchant_id)
    thresholds = _threshold_map(get_threshold_rows(merchant_id))
    facts = _calculate_facts(merchant_id)
    anomalies = _find_anomalies(facts.metrics, thresholds)

    metrics_checked = {
        **facts.raw_counts,
        **facts.metrics,
    }

    if not anomalies:
        insight = _save_anomaly_snapshot(merchant_id, metrics_checked, thresholds, [], llm_called=False)
        return {
            "status": "no_anomalies",
            "merchant_id": merchant_id,
            "llm_called": False,
            "metrics_checked": metrics_checked,
            "insight": insight,
        }

    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("OPENAI_API_KEY missing; saving anomaly state without LLM response for %s", merchant_id)
        insight = _save_anomaly_snapshot(merchant_id, metrics_checked, thresholds, anomalies, llm_called=False)
        return {
            "status": "anomalies_detected",
            "merchant_id": merchant_id,
            "llm_called": False,
            "metrics_checked": metrics_checked,
            "anomalies": anomalies,
            "recommendations": [],
            "insight": insight,
        }

    prompt = _build_prompt(facts.metrics, facts.raw_counts, anomalies)

    try:
        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a D2C business analyst. Use ONLY the data provided below. Do not assume, invent, or hallucinate any values. If a value needed for savings calculation is not in the provided data, return estimated_saving as null. Every recommendation must cite its source metric and table.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )

        raw_text = response.choices[0].message.content or "{}"
        payload = json.loads(raw_text)
        recommendations = _validate_recommendations(payload, facts, thresholds)
    except Exception as exc:
        logger.warning("LLM call failed for %s; saving anomaly state without model output: %s", merchant_id, exc)
        insight = _save_anomaly_snapshot(merchant_id, metrics_checked, thresholds, anomalies, llm_called=False)
        return {
            "status": "anomalies_detected",
            "merchant_id": merchant_id,
            "llm_called": False,
            "metrics_checked": metrics_checked,
            "thresholds": thresholds,
            "anomalies": anomalies,
            "recommendations": [],
            "insight": insight,
        }

    insight = _save_anomaly_snapshot(
        merchant_id,
        metrics_checked,
        thresholds,
        anomalies,
        llm_called=True,
        recommendations=recommendations,
        llm_raw_output=payload,
    )

    for recommendation in recommendations:
        create_notification(
            {
                "merchant_id": merchant_id,
                "type": "anomaly_detected",
                "title": recommendation.get("title", "Anomaly detected"),
                "message": str(recommendation.get("action", ""))[:200],
                "is_read": False,
            }
        )

    return {
        "status": "anomalies_detected",
        "merchant_id": merchant_id,
        "llm_called": True,
        "metrics_checked": metrics_checked,
        "thresholds": thresholds,
        "anomalies": anomalies,
        "recommendations": recommendations,
        "insight": insight,
    }
