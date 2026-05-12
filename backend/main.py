"""
D2C AI Employee — FastAPI Main Application

Routes:
  GET  /health                     → Health check
  POST /sync/{merchant_id}         → Trigger manual sync
  POST /agent/run/{merchant_id}    → Trigger agent manually
  GET  /agent/insights/{merchant_id} → Get latest insights
  GET  /connectors/status          → Health check all 4 connectors

FastAPI runs on port 8000.
FastMCP server runs separately on port 8001.
"""

import os
import sys

# Add backend directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from sync.sync_job import run_sync
from agent.analyzer import analyze_merchant
from agent.llm_recommender import generate_recommendations
from connectors.shopify import ShopifyConnector
from connectors.razorpay import RazorpayConnector
from connectors.shiprocket import ShiprocketConnector
from connectors.meta_ads import MetaAdsConnector

from supabase_client import create_client

app = FastAPI(
    title="D2C AI Employee",
    description="AI-powered business intelligence assistant for D2C brands",
    version="1.0.0",
)

# CORS for frontend and MCP
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_supabase():
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return create_client(url, key)


# ─── ROUTES ────────────────────────────────────────────────


@app.get("/merchants")
async def list_merchants():
    """Return all merchants stored in the database."""
    try:
        supabase = get_supabase()
        result = supabase.table("merchants").select("merchant_id, name, created_at").order("created_at").execute()
        return {
            "merchants": result.data or [],
            "count": len(result.data or []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching merchants: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "D2C AI Employee",
        "version": "1.0.0",
    }


@app.post("/sync/{merchant_id}")
async def sync_merchant(merchant_id: str):
    """
    Trigger a full sync for a merchant.
    Fetches from all 4 connectors and upserts to Supabase.
    """
    try:
        results = await run_sync(merchant_id)
        return {
            "status": "completed",
            "merchant_id": merchant_id,
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@app.post("/agent/run/{merchant_id}")
async def run_agent(merchant_id: str):
    """
    Trigger the autonomous agent for a merchant.
    1. Runs threshold checks (pure Python, fast)
    2. If anomalies detected → single OpenAI call
    3. Saves insights to agent_insights table
    """
    try:
        # Step 1: Analyze
        analysis = await analyze_merchant(merchant_id)

        if not analysis["needs_llm"]:
            return {
                "status": "no_anomaly",
                "merchant_id": merchant_id,
                "message": "All metrics within normal thresholds. No action needed.",
                "checks_passed": 6,
            }

        # Step 2: Generate recommendations via LLM
        insight = await generate_recommendations(
            merchant_id=merchant_id,
            triggered_conditions=analysis["triggered"],
            data_snapshot=analysis["snapshot"],
        )

        return {
            "status": "anomalies_detected",
            "merchant_id": merchant_id,
            "conditions_triggered": len(analysis["triggered"]),
            "recommendations": insight.get("recommendations", []),
            "estimated_saving": insight.get("estimated_saving", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@app.get("/agent/insights/{merchant_id}")
async def get_insights(merchant_id: str):
    """Get the latest agent insights for a merchant."""
    try:
        supabase = get_supabase()
        result = supabase.table("agent_insights").select("*").eq(
            "merchant_id", merchant_id
        ).order("triggered_at", desc=True).limit(5).execute()

        return {
            "merchant_id": merchant_id,
            "insights": result.data or [],
            "count": len(result.data or []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching insights: {str(e)}")


@app.get("/connectors/status")
async def connectors_status():
    """Health check all 4 connectors."""
    merchant_id = "merchant_001"
    statuses = {}

    connectors = {
        "shopify": ShopifyConnector(merchant_id),
        "razorpay": RazorpayConnector(merchant_id),
        "shiprocket": ShiprocketConnector(merchant_id),
        "meta_ads": MetaAdsConnector(merchant_id),
    }

    for name, connector in connectors.items():
        try:
            healthy = connector.health_check()
            statuses[name] = {
                "status": "healthy" if healthy else "unhealthy",
                "type": "real" if name in ("shopify", "razorpay") else "mock",
            }
        except Exception as e:
            statuses[name] = {"status": "error", "error": str(e)}

    return {"connectors": statuses}


# ─── ENTRY POINT ───────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
