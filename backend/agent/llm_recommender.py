"""
LLM Recommender — Single OpenAI call per anomalous merchant.

Only called when threshold checks detect anomalies.
Saves recommendations to agent_insights table in Supabase.
"""

import os
import json
import re
from datetime import datetime
from openai import OpenAI
from supabase_client import create_client, SupabaseClient


def get_supabase() -> SupabaseClient:
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return create_client(url, key)


SYSTEM_PROMPT = """You are an operations analyst for a D2C (Direct-to-Consumer) brand in India.
You analyze anomalies in shipping, payments, ads, and orders data.
Give 2-3 SPECIFIC, actionable recommendations with estimated ₹ savings.
Be specific with numbers — reference the actual data provided.
Format each recommendation as a clear action item.
At the end, provide a single total estimated monthly saving in ₹."""


def build_user_prompt(triggered_conditions: list[dict], data_snapshot: dict) -> str:
    """Build the user prompt for the LLM call."""
    conditions_text = "\n".join(
        f"- {c['condition']}: {c['message']}"
        for c in triggered_conditions
    )

    return f"""Anomalies detected for this D2C merchant:

{conditions_text}

Data snapshot (last 7 days):
{json.dumps(data_snapshot, indent=2)}

Based on these anomalies and data:
1. Give 2-3 specific, actionable recommendations
2. For each recommendation, estimate the ₹ saving per month
3. Be specific — reference actual numbers from the data
4. End with total estimated monthly saving"""


def parse_recommendations(llm_response: str) -> tuple[list[str], float]:
    """Parse LLM response into recommendations list and estimated saving."""
    lines = llm_response.strip().split("\n")
    recommendations = []
    estimated_saving = 0

    for line in lines:
        line = line.strip()
        if line and (line.startswith(("1.", "2.", "3.", "-", "•", "*"))):
            recommendations.append(line.lstrip("0123456789.-•* "))

    # Extract ₹ saving from last few lines
    saving_patterns = [
        r'₹\s*([\d,]+(?:\.\d+)?)',
        r'Rs\.?\s*([\d,]+(?:\.\d+)?)',
        r'INR\s*([\d,]+(?:\.\d+)?)',
    ]
    
    for line in reversed(lines[-5:]):
        for pattern in saving_patterns:
            match = re.search(pattern, line)
            if match:
                try:
                    estimated_saving = float(match.group(1).replace(",", ""))
                    break
                except ValueError:
                    continue
        if estimated_saving > 0:
            break

    if not recommendations:
        recommendations = [llm_response[:500]]

    return recommendations, estimated_saving


async def generate_recommendations(
    merchant_id: str,
    triggered_conditions: list[dict],
    data_snapshot: dict,
) -> dict:
    """
    Make a single OpenAI call for an anomalous merchant.
    Save results to agent_insights table.
    Returns the saved insight record.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")

    if not api_key or api_key.startswith("sk-xxx"):
        # No valid API key — save without LLM reasoning
        insight = {
            "merchant_id": merchant_id,
            "triggered_at": datetime.now().isoformat(),
            "conditions_triggered": triggered_conditions,
            "data_snapshot": data_snapshot,
            "llm_reasoning": "OpenAI API key not configured. Conditions triggered but no LLM analysis available.",
            "recommendations": [c["message"] for c in triggered_conditions],
            "estimated_saving": 0,
            "status": "pending_review",
        }
        supabase = get_supabase()
        supabase.table("agent_insights").insert(insight).execute()
        return insight

    try:
        client = OpenAI(api_key=api_key)

        user_prompt = build_user_prompt(triggered_conditions, data_snapshot)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=800,
            temperature=0.3,
        )

        llm_text = response.choices[0].message.content or ""
        recommendations, estimated_saving = parse_recommendations(llm_text)

        insight = {
            "merchant_id": merchant_id,
            "triggered_at": datetime.now().isoformat(),
            "conditions_triggered": triggered_conditions,
            "data_snapshot": data_snapshot,
            "llm_reasoning": llm_text,
            "recommendations": recommendations,
            "estimated_saving": estimated_saving,
            "status": "pending_review",
        }

        supabase = get_supabase()
        supabase.table("agent_insights").insert(insight).execute()

        print(f"[Agent] Saved insights for {merchant_id}: {len(recommendations)} recommendations, est. saving ₹{estimated_saving}")
        return insight

    except Exception as e:
        print(f"[Agent] LLM error for {merchant_id}: {e}")
        # Save error state
        insight = {
            "merchant_id": merchant_id,
            "triggered_at": datetime.now().isoformat(),
            "conditions_triggered": triggered_conditions,
            "data_snapshot": data_snapshot,
            "llm_reasoning": f"Error: {str(e)}",
            "recommendations": [c["message"] for c in triggered_conditions],
            "estimated_saving": 0,
            "status": "error",
        }
        supabase = get_supabase()
        supabase.table("agent_insights").insert(insight).execute()
        return insight
