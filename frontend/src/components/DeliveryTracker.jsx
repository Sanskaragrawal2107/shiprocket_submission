import { z } from "zod";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip
} from "recharts";
import { CitationsPanel } from "./CitationsPanel";

const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads"),
  ref:    z.string().describe("Source row reference e.g. shiprocket#shipment_abc123"),
  field:  z.string().describe("The field name this citation covers"),
  value:  z.any().describe("The raw value from the source row"),
}).or(z.string());

/* ── Schema ────────────────────────────────────────────── */
export const DeliveryTrackerSchema = z.object({
  delivered:  z.number().describe("Number of delivered shipments"),
  in_transit: z.number().describe("Number of in-transit shipments"),
  rto:        z.number().describe("Number of RTO (returned) shipments"),
  failed:     z.number().describe("Number of failed deliveries"),
  rto_rate:   z.number().optional().describe("RTO rate as percentage"),
  avg_days:   z.number().optional().describe("Average delivery days"),
  citations:  z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

const SEGMENTS = [
  { key: "delivered",  label: "Delivered",  color: "#34d399" },
  { key: "in_transit", label: "In Transit", color: "#6366f1" },
  { key: "rto",        label: "RTO",        color: "#f43f5e" },
  { key: "failed",     label: "Failed",     color: "#fb923c" },
];

/* ── Component ─────────────────────────────────────────── */
export function DeliveryTracker({ delivered, in_transit, rto, failed, rto_rate, avg_days, citations }) {
  const total = delivered + in_transit + rto + failed;
  const values = { delivered, in_transit, rto, failed };

  const pieData = SEGMENTS.map(s => ({
    name: s.label,
    value: values[s.key] || 0,
    color: s.color,
  })).filter(d => d.value > 0);

  return (
    <div className="data-card" style={{ minWidth: 340, maxWidth: 520 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>🚚</span>
          Delivery Tracker
        </div>
        <span className="data-card-badge badge-neutral">{total} shipments</span>
      </div>
      <div className="data-card-body">
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div className="chart-container" style={{ width: 160, height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.9} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1 }}>
            <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SEGMENTS.map(s => (
                <div key={s.key} className="stat-item" style={{ padding: 10 }}>
                  <div className="stat-item-value" style={{ color: s.color, fontSize: 18 }}>
                    {values[s.key] || 0}
                  </div>
                  <div className="stat-item-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {(rto_rate !== undefined || avg_days !== undefined) && (
          <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
            {rto_rate !== undefined && (
              <div className="stat-item">
                <div className="stat-item-value" style={{
                  color: rto_rate > 10 ? "var(--accent-rose)" : "var(--accent-emerald)"
                }}>
                  {rto_rate.toFixed(1)}%
                </div>
                <div className="stat-item-label">RTO Rate</div>
              </div>
            )}
            {avg_days !== undefined && (
              <div className="stat-item">
                <div className="stat-item-value">{avg_days.toFixed(1)}</div>
                <div className="stat-item-label">Avg Delivery Days</div>
              </div>
            )}
          </div>
        )}
      </div>
      <CitationsPanel citations={citations} />
    </div>
  );
}
