# D2C AI Employee

> AI-powered business intelligence assistant for D2C brands.  
> One place to ask anything about your Shopify orders, Shiprocket deliveries, Razorpay payments, and Meta Ads — with every number cited back to its source row.

---

## Architecture

```
┌──────────────┐    ┌───────────────┐    ┌───────────────┐
│  React + Tambo│◄──►│  FastAPI       │◄──►│  Supabase     │
│  (Chat + UI)  │    │  (API + MCP)   │    │  (PostgreSQL)  │
└──────────────┘    └───────────────┘    └───────────────┘
                          │                      │
                    ┌─────┴─────┐          ┌─────┴─────┐
                    │  Connectors│          │  pg_cron   │
                    ├───────────┤          │  pg_net    │
                    │ Shopify    │          └───────────┘
                    │ Razorpay   │
                    │ Shiprocket │
                    │ Meta Ads   │
                    └───────────┘
```

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | React + Vite + Tambo AI + Recharts |
| Backend   | FastAPI (Python)                  |
| Database  | Supabase (PostgreSQL)             |
| MCP       | FastMCP (Python)                  |
| Cron      | pg_cron + pg_net (Supabase)       |

## Project Structure

```
shiprocket/
├── backend/
│   ├── connectors/
│   │   ├── base.py            # BaseConnector ABC
│   │   ├── shopify.py         # Shopify Orders API
│   │   ├── razorpay.py        # Razorpay Payments API
│   │   ├── shiprocket.py      # Shiprocket Shipments (mock)
│   │   └── meta_ads.py        # Meta Ads API (mock)
│   ├── sync/
│   │   └── sync_job.py        # Orchestrates all connectors
│   ├── agent/
│   │   ├── conditions.py      # Anomaly detection rules
│   │   ├── analyzer.py        # Scans data & detects anomalies
│   │   └── llm_recommender.py # GPT-powered recommendations
│   ├── mcp/
│   │   └── server.py          # 8 MCP tools with citations
│   ├── supabase_client.py     # Lightweight httpx Supabase client
│   ├── main.py                # FastAPI app entry point
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── RevenueCard.jsx
│   │   │   ├── OrdersChart.jsx
│   │   │   ├── DeliveryTracker.jsx
│   │   │   ├── PaymentLedger.jsx
│   │   │   ├── AdsDashboard.jsx
│   │   │   ├── InsightsList.jsx
│   │   │   ├── CrossChannelChart.jsx
│   │   │   └── HealthScore.jsx
│   │   ├── tamboComponents.js  # Component registry
│   │   ├── tamboTools.js       # Tool definitions
│   │   ├── App.jsx             # Main app with TamboProvider
│   │   ├── main.jsx            # Entry point
│   │   └── index.css           # Design system
│   ├── .env.example
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Fill in .env with your keys
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_TAMBO_API_KEY in .env
npm run dev
```

### 3. Environment Variables

**Backend (`.env`)**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_TOKEN=shpat_xxx
RAZORPAY_KEY_ID=rzp_xxx
RAZORPAY_KEY_SECRET=xxx
OPENAI_API_KEY=sk-xxx
```

**Frontend (`.env`)**
```
VITE_TAMBO_API_KEY=your-tambo-api-key
VITE_API_URL=http://localhost:8000
```

## API Endpoints

| Method | Path                    | Description                   |
|--------|-------------------------|-------------------------------|
| GET    | `/health`               | Health check                  |
| GET    | `/health/connectors`    | Connector status              |
| POST   | `/sync/{merchant_id}`   | Trigger full data sync        |
| POST   | `/agent/run/{merchant_id}` | Run AI analysis agent      |
| GET    | `/insights/{merchant_id}` | Get latest insights          |

## MCP Tools

The MCP server exposes 8 tools:

| Tool                     | Description                                         |
|--------------------------|-----------------------------------------------------|
| `get_revenue_summary`    | Total revenue, order count, AOV with citations       |
| `get_orders_by_status`   | Order distribution by status                         |
| `get_delivery_breakdown` | Delivery performance: RTO, in-transit, delivered     |
| `get_payment_status`     | Payment success rate, captured vs refunded           |
| `get_ad_performance`     | Meta Ads: ROAS, spend, clicks, CTR by campaign       |
| `get_cross_channel_data` | Revenue × Ad Spend × Orders × Deliveries over time  |
| `get_business_health`    | Overall health score with category breakdown         |
| `get_latest_insights`    | AI agent-generated anomaly alerts & recommendations  |

Every tool returns a `citations[]` array mapping each number to its source row.

## Generative UI Components

The frontend registers 8 components with Tambo:

| Component          | Triggered by                              |
|--------------------|--------------------------------------------|
| `RevenueCard`      | Revenue, sales, GMV queries                |
| `OrdersChart`      | Order counts, status breakdowns            |
| `DeliveryTracker`  | Shipping, delivery, RTO queries            |
| `PaymentLedger`    | Payment status, refund queries             |
| `AdsDashboard`     | ROAS, ad performance, marketing spend      |
| `InsightsList`     | Alerts, anomalies, recommendations         |
| `CrossChannelChart`| Cross-platform trend comparisons           |
| `HealthScore`      | Business health, overall performance       |

## pg_cron Setup (Supabase)

Run this SQL in your Supabase SQL editor to set up automated syncing:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Sync every 6 hours
SELECT cron.schedule(
  'sync-merchant-001',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-backend-url.com/sync/merchant_001',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Run agent analysis every 8 hours  
SELECT cron.schedule(
  'agent-merchant-001',
  '0 */8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-backend-url.com/agent/run/merchant_001',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Check running jobs
SELECT * FROM cron.job;

-- View job history
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## Database Tables

| Table                | Purpose                             |
|----------------------|-------------------------------------|
| `unified_orders`     | Shopify orders                      |
| `unified_payments`   | Razorpay payments                   |
| `unified_shipments`  | Shiprocket shipments                |
| `unified_ad_metrics` | Meta Ads campaign data              |
| `agent_insights`     | AI-detected anomalies & actions     |

## Design System

The frontend uses a premium dark theme with:
- **Glassmorphism** effects with backdrop blur
- **Gradient accents** (indigo → purple)
- **Neon status indicators** with glow animations
- **Inter + JetBrains Mono** typography
- **Responsive layout** (sidebar collapses on mobile)
- **Micro-animations** for message and component entrance

## License

Private — Internal use only.
