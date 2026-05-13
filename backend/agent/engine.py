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

from openai import OpenAI

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
    unsettled_payments = max(total_payments - settled_payments, 0)

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
        insight = save_agent_insight(
            {
                "merchant_id": merchant_id,
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "llm_called": False,
                "status": "no_anomalies",
                "metrics_checked": metrics_checked,
                "thresholds": thresholds,
                "anomalies": [],
                "recommendations": [],
            }
        )
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
        insight = save_agent_insight(
            {
                "merchant_id": merchant_id,
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "llm_called": False,
                "status": "anomalies_detected",
                "metrics_checked": metrics_checked,
                "thresholds": thresholds,
                "anomalies": anomalies,
                "recommendations": [],
            }
        )
        return {
            "status": "anomalies_detected",
            "merchant_id": merchant_id,
            "llm_called": False,
            "metrics_checked": metrics_checked,
            "anomalies": anomalies,
            "recommendations": [],
            "insight": insight,
        }

    client = OpenAI(api_key=api_key)
    prompt = _build_prompt(facts.metrics, facts.raw_counts, anomalies)

    response = client.chat.completions.create(
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

    insight = save_agent_insight(
        {
            "merchant_id": merchant_id,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
            "llm_called": True,
            "status": "anomalies_detected",
            "metrics_checked": metrics_checked,
            "thresholds": thresholds,
            "anomalies": anomalies,
            "llm_raw_output": payload,
            "recommendations": recommendations,
        }
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
