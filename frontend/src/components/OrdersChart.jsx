import { z } from "zod";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
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
export const OrdersChartSchema = z.object({
  data: z.array(z.object({
    label: z.string().optional().default("").describe("Category or date label"),
    count: z.number().optional().default(0).describe("Number of orders"),
  })).optional().default([]).describe("Bar chart data"),
  title: z.string().optional().describe("Chart title"),
  total: z.number().optional().describe("Total orders"),
  citations: z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

const COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#22d3ee", "#34d399", "#fbbf24", "#fb923c"];

/* ── Component ─────────────────────────────────────────── */
export function OrdersChart({ data, title, total, citations }) {
  const safeData = Array.isArray(data) ? data : [];

  return (
    <div className="data-card" style={{ minWidth: 340, maxWidth: 560 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>📦</span>
          {title || "Orders Breakdown"}
        </div>
        {total !== undefined && total !== null && (
          <span className="data-card-badge badge-neutral">{total} total</span>
        )}
      </div>
      <div className="data-card-body">
        <div className="chart-container" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={safeData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  background: "#1e1e2e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {safeData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <CitationsPanel citations={citations} />
    </div>
  );
}
