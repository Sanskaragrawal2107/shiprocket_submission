import { z } from "zod";
import { CitationsPanel } from "./CitationsPanel";

const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads, agent_analysis"),
  ref:    z.string().describe("Source row reference e.g. agent_analysis#insight_uuid"),
  field:  z.string().describe("The field name this citation covers"),
  value:  z.any().describe("The raw value from the source row"),
}).or(z.string());

/* ── Schema ────────────────────────────────────────────── */
export const InsightsListSchema = z.object({
  insights: z.array(z.object({
    type:           z.string().describe("Insight type like delivery_rto, payment_failure, ad_roas"),
    severity:       z.enum(["critical", "warning", "info"]).describe("Severity level"),
    title:          z.string().describe("Short insight title"),
    recommendation: z.string().describe("AI recommendation text"),
    metric_value:   z.string().optional().describe("Key metric value"),
    created_at:     z.string().optional().describe("When insight was created"),
  })).describe("List of AI agent insights"),
  merchant_id: z.string().optional().describe("Merchant ID"),
  citations: z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

const SEVERITY_ICONS = { critical: "🔴", warning: "🟡", info: "🔵" };

/* ── Component ─────────────────────────────────────────── */
export function InsightsList({ insights, merchant_id, citations }) {
  if (!insights || insights.length === 0) {
    return (
      <div className="data-card" style={{ minWidth: 320 }}>
        <div className="data-card-header">
          <div className="data-card-title">
            <span style={{ fontSize: 16 }}>🧠</span>
            AI Insights
          </div>
        </div>
        <div className="data-card-body" style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
          No anomalies detected. Everything looks healthy! ✅
        </div>
      </div>
    );
  }

  return (
    <div className="data-card" style={{ minWidth: 340, maxWidth: 560 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>🧠</span>
          AI Insights
        </div>
        <span className="data-card-badge badge-warning">
          {insights.length} alert{insights.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="data-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {insights.map((insight, i) => (
          <div key={i} className={`insight-card severity-${insight.severity}`}>
            <div className="insight-title">
              {SEVERITY_ICONS[insight.severity] || "🔵"} {insight.title}
            </div>
            <div className="insight-body">{insight.recommendation}</div>
            <div className="insight-meta">
              <span style={{
                padding: "1px 6px",
                borderRadius: "4px",
                background: "rgba(255,255,255,0.04)",
                fontSize: 9,
                textTransform: "uppercase",
                fontWeight: 600,
              }}>
                {insight.type}
              </span>
              {insight.metric_value && <span>Metric: {insight.metric_value}</span>}
              {insight.created_at && <span>{new Date(insight.created_at).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
      <CitationsPanel citations={citations} />
    </div>
  );
}
