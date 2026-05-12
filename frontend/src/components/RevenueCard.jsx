import { z } from "zod";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { CitationsPanel } from "./CitationsPanel";

/* ── Citation object schema (matches MCP make_citation output) ── */
const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads"),
  ref:    z.string().describe("Source row reference e.g. shopify#order_12345"),
  field:  z.string().describe("The field name this citation covers"),
  value:  z.any().describe("The raw value from the source row"),
}).or(z.string());

/* ── Schema ────────────────────────────────────────────── */
// All required fields are .optional() with defaults — Tambo streams props one
// at a time so they arrive as undefined until the LLM finishes generating.
export const RevenueCardSchema = z.object({
  total_revenue:   z.number().optional().default(0).describe("Total revenue in INR"),
  order_count:     z.number().optional().default(0).describe("Number of orders"),
  avg_order_value: z.number().optional().default(0).describe("Average order value in INR"),
  trend: z.array(z.object({
    date:    z.string().describe("Date label"),
    revenue: z.number().describe("Revenue for the day"),
  })).optional().describe("Daily revenue trend data"),
  period:     z.string().optional().describe("Period label like 'Last 7 days'"),
  change_pct: z.number().optional().describe("% change vs previous period"),
  citations: z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

/* ── Component ─────────────────────────────────────────── */
export function RevenueCard({
  total_revenue, order_count, avg_order_value, trend, period, change_pct, citations
}) {
  // Guard every numeric prop — they arrive as undefined/null during Tambo streaming
  const safeRevenue   = typeof total_revenue   === "number" ? total_revenue   : 0;
  const safeOrders    = typeof order_count      === "number" ? order_count      : 0;
  const safeAvgOrder  = typeof avg_order_value  === "number" ? avg_order_value  : 0;
  const safeTrend     = Array.isArray(trend) ? trend : [];
  const safeChangePct = typeof change_pct === "number" ? change_pct : null;

  const isPositive = (safeChangePct ?? 0) >= 0;
  const formatCurrency = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

  return (
    <div className="data-card" style={{ minWidth: 340, maxWidth: 520 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>💰</span>
          Revenue Overview
        </div>
        {period && (
          <span className="data-card-badge badge-neutral">{period}</span>
        )}
      </div>
      <div className="data-card-body">
        <div style={{ marginBottom: 16 }}>
          <div className="metric-value" style={{
            background: "linear-gradient(135deg, #34d399, #22d3ee)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            {formatCurrency(safeRevenue)}
          </div>
          {safeChangePct !== null && (
            <span className={`metric-change ${isPositive ? "up" : "down"}`}>
              {isPositive ? "↑" : "↓"} {Math.abs(safeChangePct).toFixed(1)}%
            </span>
          )}
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="stat-item">
            <div className="stat-item-value">{safeOrders}</div>
            <div className="stat-item-label">Orders</div>
          </div>
          <div className="stat-item">
            <div className="stat-item-value">{formatCurrency(safeAvgOrder)}</div>
            <div className="stat-item-label">Avg Order Value</div>
          </div>
        </div>

        {safeTrend.length > 0 && (
          <div className="chart-container" style={{ height: 160, marginTop: 16 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={safeTrend}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip contentStyle={{
                  background: "#1e1e2e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, fontSize: 12,
                }} />
                <Area type="monotone" dataKey="revenue" stroke="#34d399" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Citations ── */}
      <CitationsPanel citations={citations} />
    </div>
  );
}
