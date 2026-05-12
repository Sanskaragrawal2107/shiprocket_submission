import { z } from "zod";
import { CitationsPanel } from "./CitationsPanel";

const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads"),
  ref:    z.string().describe("Source row reference e.g. razorpay#pay_AbcXyz"),
  field:  z.string().describe("The field name this citation covers"),
  value:  z.any().describe("The raw value from the source row"),
}).or(z.string());

/* ── Schema ────────────────────────────────────────────── */
// All fields are .optional() — Tambo streams props one at a time so they
// arrive as undefined until the LLM finishes generating.
export const PaymentLedgerSchema = z.object({
  payments: z.array(z.object({
    id:        z.string().optional().default("").describe("Payment ID"),
    amount:    z.number().optional().default(0).describe("Payment amount in INR"),
    status:    z.string().optional().default("pending").describe("Payment status"),
    method:    z.string().optional().describe("Payment method"),
    date:      z.string().optional().describe("Payment date"),
    order_ref: z.string().optional().describe("Linked order reference"),
  })).optional().default([]).describe("List of payments"),
  total_captured: z.number().optional().describe("Total captured amount"),
  total_refunded: z.number().optional().describe("Total refunded amount"),
  success_rate:   z.number().optional().describe("Payment success rate %"),
  citations: z.array(CitationObjectSchema).optional()
    .describe("Source citations — each cites the exact table, row_id, field and value this number comes from"),
});

const STATUS_STYLES = {
  captured: { bg: "rgba(52,211,153,0.1)",  color: "#34d399", border: "rgba(52,211,153,0.2)" },
  paid:     { bg: "rgba(52,211,153,0.1)",  color: "#34d399", border: "rgba(52,211,153,0.2)" },
  refunded: { bg: "rgba(251,191,36,0.1)",  color: "#fbbf24", border: "rgba(251,191,36,0.2)" },
  failed:   { bg: "rgba(244,63,94,0.1)",   color: "#f43f5e", border: "rgba(244,63,94,0.2)" },
  pending:  { bg: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "rgba(148,163,184,0.2)" },
};

/* ── Component ─────────────────────────────────────────── */
export function PaymentLedger({ payments, total_captured, total_refunded, success_rate, citations }) {
  // Guard every prop — they arrive as undefined/null during Tambo streaming
  const safePayments    = Array.isArray(payments) ? payments : [];
  const safeSuccessRate = typeof success_rate   === "number" ? success_rate   : null;
  const safeCaptured    = typeof total_captured  === "number" ? total_captured  : null;
  const safeRefunded    = typeof total_refunded  === "number" ? total_refunded  : null;

  const fmt = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;

  return (
    <div className="data-card" style={{ minWidth: 340, maxWidth: 620 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>💳</span>
          Payment Ledger
        </div>
        <span className="data-card-badge badge-neutral">{safePayments.length} payments</span>
      </div>
      <div className="data-card-body">
        {(safeCaptured !== null || safeRefunded !== null || safeSuccessRate !== null) && (
          <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 16 }}>
            {safeCaptured !== null && (
              <div className="stat-item">
                <div className="stat-item-value" style={{ color: "var(--accent-emerald)", fontSize: 18 }}>
                  {fmt(safeCaptured)}
                </div>
                <div className="stat-item-label">Captured</div>
              </div>
            )}
            {safeRefunded !== null && (
              <div className="stat-item">
                <div className="stat-item-value" style={{ color: "var(--accent-amber)", fontSize: 18 }}>
                  {fmt(safeRefunded)}
                </div>
                <div className="stat-item-label">Refunded</div>
              </div>
            )}
            {safeSuccessRate !== null && (
              <div className="stat-item">
                <div className="stat-item-value" style={{
                  color: safeSuccessRate > 90 ? "var(--accent-emerald)" : "var(--accent-rose)",
                  fontSize: 18,
                }}>
                  {safeSuccessRate.toFixed(1)}%
                </div>
                <div className="stat-item-label">Success Rate</div>
              </div>
            )}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Method</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {safePayments.slice(0, 10).map((p, i) => {
                const statusKey = (p.status || "pending").toLowerCase();
                const st = STATUS_STYLES[statusKey] || STATUS_STYLES.pending;
                return (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{p.id || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.amount)}</td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        background: st.bg,
                        color: st.color,
                        border: `1px solid ${st.border}`,
                      }}>
                        {p.status || "pending"}
                      </span>
                    </td>
                    <td>{p.method || "—"}</td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.date || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {safePayments.length > 10 && (
            <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)" }}>
              Showing 10 of {safePayments.length} payments
            </div>
          )}
        </div>
      </div>
      <CitationsPanel citations={citations} />
    </div>
  );
}
