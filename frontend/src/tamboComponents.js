/**
 * Tambo Component Registry
 *
 * IMPORTANT: Descriptions must be prescriptive — they tell the LLM WHEN to
 * render each component without asking the user for more info first.
 * The LLM should always default to merchant_001 when no merchant is specified,
 * and always render the component immediately with reasonable defaults.
 */

import { RevenueCard, RevenueCardSchema } from "./components/RevenueCard";
import { OrdersChart, OrdersChartSchema } from "./components/OrdersChart";
import {
  DeliveryTracker,
  DeliveryTrackerSchema,
} from "./components/DeliveryTracker";
import { PaymentLedger, PaymentLedgerSchema } from "./components/PaymentLedger";
import { AdsDashboard, AdsDashboardSchema } from "./components/AdsDashboard";
import { InsightsList, InsightsListSchema } from "./components/InsightsList";
import {
  CrossChannelChart,
  CrossChannelChartSchema,
} from "./components/CrossChannelChart";
import { HealthScore, HealthScoreSchema } from "./components/HealthScore";

export const tamboComponents = [
  {
    name: "RevenueCard",
    component: RevenueCard,
    description:
      "ALWAYS render this immediately when the user asks about revenue, sales, GMV, earnings, or income. Do NOT ask for clarification — use merchant_001 and the last 7 days as defaults. Populate with realistic demo data if no live data is available.",
    propsSchema: RevenueCardSchema,
  },
  {
    name: "OrdersChart",
    component: OrdersChart,
    description:
      "ALWAYS render this immediately when the user asks about orders, order counts, order status, or order breakdown. Use merchant_001 as default. Show a bar chart split by status: delivered, processing, cancelled, returned.",
    propsSchema: OrdersChartSchema,
  },
  {
    name: "DeliveryTracker",
    component: DeliveryTracker,
    description:
      "ALWAYS render this immediately when the user asks about deliveries, shipping performance, RTO rate, return-to-origin, or logistics. Use merchant_001 as default. Show donut chart with delivered/in-transit/RTO/failed breakdown.",
    propsSchema: DeliveryTrackerSchema,
  },
  {
    name: "PaymentLedger",
    component: PaymentLedger,
    description:
      "ALWAYS render this immediately when the user asks about payments, transactions, refunds, payment success rate, or Razorpay data. Use merchant_001 as default. Show a table of recent payments with status badges.",
    propsSchema: PaymentLedgerSchema,
  },
  {
    name: "AdsDashboard",
    component: AdsDashboard,
    description:
      "ALWAYS render this immediately when the user asks about ads, ROAS, Meta Ads, ad spend, marketing performance, campaigns, clicks, or CTR. Use merchant_001 as default. Show ROAS bar chart per campaign.",
    propsSchema: AdsDashboardSchema,
  },
  {
    name: "InsightsList",
    component: InsightsList,
    description:
      "ALWAYS render this immediately when the user asks about insights, alerts, anomalies, recommendations, what needs attention, or AI analysis results. Use merchant_001 as default.",
    propsSchema: InsightsListSchema,
  },
  {
    name: "CrossChannelChart",
    component: CrossChannelChart,
    description:
      "ALWAYS render this immediately when the user asks for a cross-channel view, trends, platform comparison, or wants to see revenue vs ad spend vs orders together over time. Use merchant_001 as default.",
    propsSchema: CrossChannelChartSchema,
  },
  {
    name: "HealthScore",
    component: HealthScore,
    description:
      "ALWAYS render this immediately when the user asks about overall business health, health score, performance overview, quick status check, or a dashboard summary. Use merchant_001 as default.",
    propsSchema: HealthScoreSchema,
  },
];
