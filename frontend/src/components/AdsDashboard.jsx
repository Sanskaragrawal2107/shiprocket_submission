import { z } from "zod";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { CitationsPanel } from "./CitationsPanel";

const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads"),
  ref:    z.string().describe("Source row reference e.g. meta_ads#campaign_987654"),
  field:  z.string().describe("The field name this citation covers"),
  value:  z.any().describe("The raw value from the source row"),
}).or(z.string());

/* ── Schema ────────────────────────────────────────────── */
// campaigns required inner fields are also optional — Tambo streams array items
// partially, so name/spend/clicks can arrive as undefined mid-stream.
export const AdsDashboardSchema = z.object({
  campaigns: z.array(z.object({
    name:        z.string().optional().default("").describe("Campaign name"),
    spend:       z.number().optional().default(0).describe("Amount spent in INR"),
    impressions: z.number().optional().default(0).describe("Number of impressions"),
    clicks:      z.number().optional().default(0).describe("Number of clicks"),
    conversions: z.number().optional().describe("Number of conversions"),
    roas:        z.number().optional().describe("Return on ad spend"),
    ctr:         z.number().optional().describe("Click-through rate %"),
  })).optional().default([]).describe("Campaign data"),
  total_spend: z.number().optional().describe("Total ad spend"),
  avg_roas:    z.number().optional().describe("Average ROAS across campaigns"),
  citations: z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

/* ── Component ─────────────────────────────────────────── */
export function AdsDashboard({ campaigns, total_spend, avg_roas, citations }) {
  // Guard every prop — they arrive as undefined/null during Tambo streaming
  const safeCampaigns = Array.isArray(campaigns) ? campaigns : [];
  const fmt = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

  const chartData = safeCampaigns.slice(0, 8).map(c => ({
    name: (c.name || "").length > 15 ? (c.name || "").slice(0, 15) + "…" : (c.name || ""),
    ROAS: c.roas ?? 0,
    spend: c.spend ?? 0,
  }));

  return (
    <div className="data-card" style={{ minWidth: 340, maxWidth: 620 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>📊</span>
          Ads Performance
        </div>
        {avg_roas !== undefined && avg_roas !== null && (
          <span className={`data-card-badge ${avg_roas >= 2 ? "badge-positive" : "badge-negative"}`}>
            {avg_roas.toFixed(1)}x ROAS
          </span>
        )}
      </div>
      <div className="data-card-body">
        {(total_spend !== undefined && total_spend !== null) || (avg_roas !== undefined && avg_roas !== null) ? (
          <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 16 }}>
            {total_spend !== undefined && total_spend !== null && (
              <div className="stat-item">
                <div className="stat-item-value" style={{ fontSize: 18 }}>{fmt(total_spend)}</div>
                <div className="stat-item-label">Total Spend</div>
              </div>
            )}
            {avg_roas !== undefined && avg_roas !== null && (
              <div className="stat-item">
                <div className="stat-item-value" style={{
                  fontSize: 18,
                  color: avg_roas >= 2 ? "var(--accent-emerald)" : "var(--accent-rose)",
                }}>
                  {avg_roas.toFixed(2)}x
                </div>
                <div className="stat-item-label">Avg ROAS</div>
              </div>
            )}
          </div>
        ) : null}

        {chartData.length > 0 && (
          <div className="chart-container" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="ROAS" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.ROAS >= 2 ? "#34d399" : entry.ROAS >= 1 ? "#fbbf24" : "#f43f5e"}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Spend</th>
                <th>Clicks</th>
                <th>CTR</th>
                <th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {safeCampaigns.slice(0, 6).map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || "—"}
                  </td>
                  <td>{fmt(c.spend)}</td>
                  <td>{(c.clicks ?? 0).toLocaleString()}</td>
                  <td>{c.ctr !== undefined && c.ctr !== null ? `${c.ctr.toFixed(1)}%` : "—"}</td>
                  <td style={{
                    fontWeight: 600,
                    color: (c.roas ?? 0) >= 2 ? "var(--accent-emerald)" : "var(--accent-rose)"
                  }}>
                    {c.roas !== undefined && c.roas !== null ? `${c.roas.toFixed(1)}x` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <CitationsPanel citations={citations} />
    </div>
  );
}
