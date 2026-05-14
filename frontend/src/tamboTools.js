/**
 * Tambo Tools — define tools that call the FastAPI backend
 * Uses defineTool pattern from Tambo docs.
 * Fixes:
 *   - sync/agent/insights now use POST where required
 *   - corrected API paths to match backend routes
 *   - outputSchema added to every tool
 */

import { z } from "zod";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const AUTH_TOKEN_KEY = "d2c_ai_employee_token";
const MERCHANT_KEY = "d2c_ai_employee_merchant";

function getStoredMerchantId() {
  try {
    const merchantRaw = localStorage.getItem(MERCHANT_KEY);
    if (!merchantRaw) return "";
    const merchant = JSON.parse(merchantRaw);
    return merchant?.merchant_id || "";
  } catch {
    return "";
  }
}

function getAuthHeaders() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) || "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

const GenericResponseSchema = z.object({
  status: z.string().optional(),
  message: z.string().optional(),
  merchant_id: z.string().optional(),
  data: z.any().optional(),
});

const ProfitabilitySchema = z.object({
  merchant_id: z.string().optional(),
  period: z.string().optional(),
  summary: z.any().optional(),
  least_profitable_product: z.any().optional(),
  root_cause: z.any().optional(),
  products: z.array(z.any()).optional(),
  citations: z.array(z.any()).optional(),
});

export const tamboTools = [
  {
    name: "syncMerchant",
    description:
      "Trigger a full data sync for a merchant. Pulls fresh data from Shopify, Razorpay, Shiprocket, and Meta Ads and saves to the database. Call this when the user asks to sync or refresh data.",
    inputSchema: z.object({
      merchant_id: z.string().optional().describe("Merchant ID. Defaults to the signed-in merchant."),
    }),
    outputSchema: GenericResponseSchema,
    tool: async ({ merchant_id }) => {
      const resolvedMerchantId = merchant_id || getStoredMerchantId();
      if (!resolvedMerchantId) {
        throw new Error("No signed-in merchant available for sync");
      }
      return post(`/sync/${resolvedMerchantId}`);
    },
  },
  {
    name: "runAgent",
    description:
      "Run the AI agent to analyze a merchant's data, detect anomalies, and generate recommendations. Call this when the user asks to run analysis or detect issues.",
    inputSchema: z.object({
      merchant_id: z.string().optional().describe("Merchant ID. Defaults to the signed-in merchant."),
    }),
    outputSchema: GenericResponseSchema,
    tool: async ({ merchant_id }) => {
      const resolvedMerchantId = merchant_id || getStoredMerchantId();
      if (!resolvedMerchantId) {
        throw new Error("No signed-in merchant available for analysis");
      }
      return post(`/agent/run/${resolvedMerchantId}`);
    },
  },
  {
    name: "getInsights",
    description:
      "Get the latest AI-generated insights and anomaly alerts for a merchant.",
    inputSchema: z.object({
      merchant_id: z.string().optional().describe("Merchant ID. Defaults to the signed-in merchant."),
    }),
    outputSchema: z.object({
      merchant_id: z.string().optional(),
      insights: z.array(z.any()).optional(),
      count: z.number().optional(),
    }),
    tool: async ({ merchant_id }) => {
      const resolvedMerchantId = merchant_id || getStoredMerchantId();
      if (!resolvedMerchantId) {
        throw new Error("No signed-in merchant available for insights");
      }
      return get(`/agent/insights/${resolvedMerchantId}`);
    },
  },
  {
    name: "getProfitability",
    description:
      "Analyze the merchant's profitability and return the least profitable product, root cause, and supporting metrics. Use this when the user asks for the worst product, margin analysis, or why a product is not profitable.",
    inputSchema: z.object({
      merchant_id: z.string().optional().describe("Merchant ID. Defaults to the signed-in merchant."),
    }),
    outputSchema: ProfitabilitySchema,
    tool: async ({ merchant_id }) => {
      const resolvedMerchantId = merchant_id || getStoredMerchantId();
      if (!resolvedMerchantId) {
        throw new Error("No signed-in merchant available for profitability analysis");
      }
      return get(`/analysis/profitability/${resolvedMerchantId}`);
    },
  },
];
