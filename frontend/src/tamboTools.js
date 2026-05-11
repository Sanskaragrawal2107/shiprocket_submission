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

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

export const tamboTools = [
  {
    name: "syncMerchant",
    description:
      "Trigger a full data sync for a merchant. Pulls fresh data from Shopify, Razorpay, Shiprocket, and Meta Ads and saves to the database. Call this when the user asks to sync or refresh data.",
    inputSchema: z.object({
      merchant_id: z
        .string()
        .describe("Merchant ID — use 'merchant_001' if not specified"),
    }),
    outputSchema: GenericResponseSchema,
    tool: async ({ merchant_id }) => post(`/sync/${merchant_id}`),
  },
  {
    name: "runAgent",
    description:
      "Run the AI agent to analyze a merchant's data, detect anomalies, and generate recommendations. Call this when the user asks to run analysis or detect issues.",
    inputSchema: z.object({
      merchant_id: z
        .string()
        .describe("Merchant ID — use 'merchant_001' if not specified"),
    }),
    outputSchema: GenericResponseSchema,
    tool: async ({ merchant_id }) => post(`/agent/run/${merchant_id}`),
  },
  {
    name: "getInsights",
    description:
      "Get the latest AI-generated insights and anomaly alerts for a merchant.",
    inputSchema: z.object({
      merchant_id: z
        .string()
        .describe("Merchant ID — use 'merchant_001' if not specified"),
    }),
    outputSchema: z.object({
      merchant_id: z.string().optional(),
      insights: z.array(z.any()).optional(),
      count: z.number().optional(),
    }),
    tool: async ({ merchant_id }) => get(`/agent/insights/${merchant_id}`),
  },
  {
    name: "checkHealth",
    description:
      "Check the health and connectivity status of all data connectors (Shopify, Razorpay, Shiprocket, Meta Ads).",
    inputSchema: z.object({}),
    outputSchema: z.object({
      connectors: z.record(z.any()).optional(),
    }),
    tool: async () => get("/connectors/status"),
  },
];
