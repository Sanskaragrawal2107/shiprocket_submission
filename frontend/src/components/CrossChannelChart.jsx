import { z } from "zod";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { CitationsPanel } from "./CitationsPanel";

const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads"),
  ref:    z.string().describe("Source row reference e.g. shopify#order_12345"),
  field:  z.string().describe("The field name this citation covers"),
  value:  z.any().describe("The raw value from the source row"),
}).or(z.string());

/* ── Schema ────────────────────────────────────────────── */
// All fields are .optional() — Tambo streams props one at a time so they
// arrive as undefined until the LLM finishes generating.
export const CrossChannelChartSchema = z.object({
  data: z.array(z.object({
    date:        z.string().optional().default("").describe("Date label"),
    revenue:     z.number().optional().describe("Revenue amount"),
    ad_spend:    z.number().optional().describe("Ad spend amount"),
    orders:      z.number().optional().describe("Number of orders"),
    deliveries:  z.number().optional().describe("Number of deliveries"),
  })).optional().default([]).describe("Time-series data across channels"),
  title:   z.string().optional().describe("Chart title"),
  metrics: z.array(z.string()).optional().describe("Which metrics to show"),
  citations: z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

const METRIC_CONFIG = {
  revenue:    { color: "#34d399", label: "Revenue" },
  ad_spend:   { color: "#f43f5e", label: "Ad Spend" },
  orders:     { color: "#6366f1", label: "Orders" },
  deliveries: { color: "#fbbf24", label: "Deliveries" },
};

/* ── Component ─────────────────────────────────────────── */
export function CrossChannelChart({ data, title, metrics, citations }) {
  const safeData    = Array.isArray(data)    ? data    : [];
  const safeMetrics = Array.isArray(metrics) ? metrics : Object.keys(METRIC_CONFIG);
  const activeMetrics = safeMetrics.length > 0 ? safeMetrics : Object.keys(METRIC_CONFIG);

  return (
    <div className="data-card" style={{ minWidth: 380, maxWidth: 640 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>📈</span>
          {title || "Cross-Channel Overview"}
        </div>
      </div>
      <div className="data-card-body">
        <div className="chart-container" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={safeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  background: "#1e1e2e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
              {activeMetrics.map(key => {
                const cfg = METRIC_CONFIG[key];
                if (!cfg) return null;
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={cfg.label}
                    stroke={cfg.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: cfg.color }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <CitationsPanel citations={citations} />
    </div>
  );
}
