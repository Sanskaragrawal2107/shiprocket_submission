import { z } from "zod";
import { CitationsPanel } from "./CitationsPanel";

const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads, agent_analysis"),
  ref:    z.string().describe("Source row reference e.g. agent_analysis#health_uuid"),
  field:  z.string().describe("The field name this citation covers"),
  value:  z.any().describe("The raw value from the source row"),
}).or(z.string());

/* ── Schema ────────────────────────────────────────────── */
export const HealthScoreSchema = z.object({
  overall_score: z.number().optional().default(0).describe("Overall health score 0-100"),
  categories: z.array(z.object({
    name:   z.string().describe("Category name like Revenue, Delivery, Payments, Ads"),
    score:  z.number().describe("Score 0-100"),
    status: z.enum(["healthy", "warning", "critical"]).describe("Status"),
    detail: z.string().optional().describe("Brief detail"),
  })).optional().default([]).describe("Category breakdown"),
  merchant_id: z.string().optional().describe("Merchant ID"),
  citations: z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

const STATUS_COLORS = {
  healthy:  { color: "#34d399", bg: "rgba(52,211,153,0.1)",  ring: "rgba(52,211,153,0.3)" },
  warning:  { color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  ring: "rgba(251,191,36,0.3)" },
  critical: { color: "#f43f5e", bg: "rgba(244,63,94,0.1)",   ring: "rgba(244,63,94,0.3)" },
};

function getScoreColor(score) {
  if (score >= 75) return "#34d399";
  if (score >= 50) return "#fbbf24";
  return "#f43f5e";
}

/* ── Component ─────────────────────────────────────────── */
export function HealthScore({ overall_score, categories, merchant_id, citations }) {
  // Guard against undefined/null during Tambo streaming — props may arrive before LLM finishes
  const safeScore = typeof overall_score === "number" ? overall_score : 0;
  const safeCategories = Array.isArray(categories) ? categories : [];

  const scoreColor = getScoreColor(safeScore);
  const circumference = 2 * Math.PI * 52;
  const progress = ((100 - safeScore) / 100) * circumference;

  return (
    <div className="data-card" style={{ minWidth: 340, maxWidth: 480 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>🏥</span>
          Business Health
        </div>
        {merchant_id && (
          <span className="data-card-badge badge-neutral">{merchant_id}</span>
        )}
      </div>
      <div className="data-card-body">
        {/* Score Ring */}
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 20 }}>
          <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r="52"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={progress}
                transform="rotate(-90 60 60)"
                style={{ transition: "stroke-dashoffset 1s ease-out" }}
              />
            </svg>
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor, letterSpacing: "-0.03em" }}>
                {safeScore}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500 }}>/ 100</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {safeScore >= 75 ? "Looking Good! 🎉" : safeScore >= 50 ? "Needs Attention ⚠️" : "Critical Issues 🚨"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {safeScore >= 75
                ? "Your business metrics are in good shape."
                : safeScore >= 50
                  ? "Some areas need improvement."
                  : "Multiple critical issues detected."}
            </div>
          </div>
        </div>

        {/* Category Bars */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {safeCategories.map((cat, i) => {
            const st = STATUS_COLORS[cat.status] || STATUS_COLORS.healthy;
            return (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{cat.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: st.color }}>{cat.score}</span>
                </div>
                <div style={{
                  height: 6,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${cat.score}%`,
                    background: st.color,
                    borderRadius: 3,
                    transition: "width 0.8s ease-out",
                  }} />
                </div>
                {cat.detail && (
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                    {cat.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <CitationsPanel citations={citations} />
    </div>
  );
}
