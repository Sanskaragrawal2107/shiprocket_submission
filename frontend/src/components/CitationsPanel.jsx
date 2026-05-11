/**
 * CitationsPanel — shared component for all data cards.
 *
 * Renders a collapsible panel showing exactly where every number came from:
 *   Source (shopify/razorpay/etc) | Row Reference | Field | Value
 *
 * Citation object shape (matches MCP server make_citation output):
 *   { source: string, ref: string, field: string, value: any }
 */

import { useState } from "react";

/** Zod schema for a single citation — import this in every component schema */
export const CitationSchema = {
  source: { type: "string" },   // kept as plain shape for z.object() usage
};

// Source → label + colour map
const SOURCE_META = {
  shopify:    { label: "Shopify",     color: "#96bf48", icon: "🛍️" },
  razorpay:   { label: "Razorpay",    color: "#528ff0", icon: "💳" },
  shiprocket: { label: "Shiprocket",  color: "#f4a942", icon: "🚀" },
  meta_ads:   { label: "Meta Ads",    color: "#1877f2", icon: "📣" },
  agent_analysis: { label: "Agent",  color: "#a78bfa", icon: "🧠" },
};

function sourceMeta(source) {
  return SOURCE_META[source?.toLowerCase()] || { label: source || "DB", color: "#64748b", icon: "🗄️" };
}

/** Parse ref → human table + row labels.
 *  ref format: "shopify#order_12345"  or  "unified_orders#uuid"
 */
function parseRef(ref = "") {
  if (!ref || ref === "unknown") return { table: "—", rowId: "—" };
  const parts = ref.split("#");
  if (parts.length === 2) return { table: parts[0], rowId: parts[1] };
  // fallback: treat full ref as row id
  return { table: ref.includes("_") ? ref.split("_").slice(0, -1).join("_") : "table", rowId: ref };
}

/** Format value for display */
function fmtValue(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return v % 1 === 0 ? v.toLocaleString("en-IN") : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }
  return String(v);
}

export function CitationsPanel({ citations }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  if (!citations || citations.length === 0) return null;

  // Normalise: citations may be objects OR legacy strings
  const normalised = citations.map((c) => {
    if (typeof c === "string") {
      return { source: "db", ref: c, field: "—", value: "—" };
    }
    return c;
  });

  const PAGE_SIZE = 8;
  const totalPages = Math.ceil(normalised.length / PAGE_SIZE);
  const pageSlice = normalised.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Summary pill groups by source
  const bySource = normalised.reduce((acc, c) => {
    const s = (c.source || "db").toLowerCase();
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="citations-panel">
      {/* ── Collapsed row ── */}
      <button
        className="citations-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="citations-toggle-icon">📎</span>
        <span className="citations-toggle-label">
          {normalised.length} source{normalised.length !== 1 ? "s" : ""} cited
        </span>
        <span className="citations-source-pills">
          {Object.entries(bySource).map(([src, count]) => {
            const m = sourceMeta(src);
            return (
              <span
                key={src}
                className="citations-source-pill"
                style={{ borderColor: m.color, color: m.color }}
              >
                {m.icon} {m.label} ×{count}
              </span>
            );
          })}
        </span>
        <span className="citations-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {/* ── Expanded table ── */}
      {open && (
        <div className="citations-table-wrapper">
          <table className="citations-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Source</th>
                <th>Table</th>
                <th>Row ID</th>
                <th>Field</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {pageSlice.map((c, i) => {
                const m = sourceMeta(c.source);
                const { table, rowId } = parseRef(c.ref);
                return (
                  <tr key={i}>
                    <td className="citation-num">{page * PAGE_SIZE + i + 1}</td>
                    <td>
                      <span
                        className="citation-source-badge"
                        style={{ borderColor: m.color, color: m.color }}
                      >
                        {m.icon} {m.label}
                      </span>
                    </td>
                    <td>
                      <code className="citation-table-name">{table}</code>
                    </td>
                    <td>
                      <code className="citation-row-id" title={rowId}>
                        {rowId.length > 20 ? rowId.slice(0, 18) + "…" : rowId}
                      </code>
                    </td>
                    <td>
                      <span className="citation-field">{c.field || "—"}</span>
                    </td>
                    <td>
                      <span className="citation-value">{fmtValue(c.value)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="citations-pagination">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="citations-page-btn"
              >
                ← Prev
              </button>
              <span className="citations-page-info">
                {page + 1} / {totalPages} ({normalised.length} rows)
              </span>
              <button
                disabled={page === totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="citations-page-btn"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
