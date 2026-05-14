/**
 * Tambo Component Registry
 *
 * IMPORTANT: Descriptions must be prescriptive — they tell the LLM WHEN to
 * render each component without asking the user for more info first.
 * The LLM should always use the currently signed-in merchant and render the
 * component immediately with reasonable defaults.
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
import { ProfitabilityCard, ProfitabilityCardSchema } from "./components/ProfitabilityCard";
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
      "Use this when the user explicitly asks about revenue, sales, GMV, earnings, or income. Use the signed-in merchant and the last 7 days as defaults.",
    propsSchema: RevenueCardSchema,
  },
  {
    name: "OrdersChart",
    component: OrdersChart,
    description:
      "Use this when the user explicitly asks about orders, order counts, order status, or order breakdown. Use the signed-in merchant as default.",
    propsSchema: OrdersChartSchema,
  },
  {
    name: "DeliveryTracker",
    component: DeliveryTracker,
    description:
      "Use this when the user explicitly asks about deliveries, shipping performance, RTO rate, return-to-origin, or logistics. Use the signed-in merchant as default.",
    propsSchema: DeliveryTrackerSchema,
  },
  {
    name: "PaymentLedger",
    component: PaymentLedger,
    description:
      "Use this when the user explicitly asks about payments, transactions, refunds, payment success rate, or Razorpay data. Use the signed-in merchant as default.",
    propsSchema: PaymentLedgerSchema,
  },
  {
    name: "AdsDashboard",
    component: AdsDashboard,
    description:
      "Use this when the user explicitly asks about ads, ROAS, Meta Ads, ad spend, marketing performance, campaigns, clicks, or CTR. Use the signed-in merchant as default.",
    propsSchema: AdsDashboardSchema,
  },
  {
    name: "ProfitabilityCard",
    component: ProfitabilityCard,
    description:
      "Use this when the user asks for the least profitable product, product margin, profitability, root cause, or why a product is not profitable. Keep the response clean and prefer a single profitability card over multiple charts.",
    propsSchema: ProfitabilityCardSchema,
  },
  {
    name: "InsightsList",
    component: InsightsList,
    description:
      "Use this when the user asks about insights, alerts, anomalies, recommendations, what needs attention, or AI analysis results. Use the signed-in merchant as default.",
    propsSchema: InsightsListSchema,
  },
  {
    name: "CrossChannelChart",
    component: CrossChannelChart,
    description:
      "Use this when the user asks for a cross-channel view, trends, platform comparison, or wants to see revenue vs ad spend vs orders together over time. Use the signed-in merchant as default.",
    propsSchema: CrossChannelChartSchema,
  },
  {
    name: "HealthScore",
    component: HealthScore,
    description:
      "Use this when the user asks about overall business health, health score, performance overview, quick status check, or a dashboard summary. Use the signed-in merchant as default.",
    propsSchema: HealthScoreSchema,
  },
];
