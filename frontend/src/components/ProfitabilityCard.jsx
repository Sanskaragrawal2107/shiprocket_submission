import { z } from "zod";
import { CitationsPanel } from "./CitationsPanel";

const CitationObjectSchema = z.object({
  source: z.string().describe("Data source: shopify, razorpay, shiprocket, meta_ads, agent_analysis"),
  ref: z.string().describe("Source row reference e.g. orders#product:tee"),
  field: z.string().describe("The field name this citation covers"),
  value: z.any().describe("The raw value from the source row"),
}).or(z.string());

export const ProfitabilityCardSchema = z.object({
  period: z.string().optional().describe("Analysis period"),
  least_profitable_product: z.object({
    product_name: z.string().optional().default("Unknown product"),
    order_count: z.number().optional().default(0),
    revenue: z.number().optional().default(0),
    shipping_cost: z.number().optional().default(0),
    ads_cost: z.number().optional().default(0),
    net_margin: z.number().optional().default(0),
    margin_percent: z.number().optional().default(0),
  }).optional().describe("Least profitable product summary"),
  root_cause: z.object({
    title: z.string().optional().default(""),
    summary: z.string().optional().default(""),
    drivers: z.array(z.object({
      label: z.string().optional().default(""),
      value: z.union([z.number(), z.string()]).optional(),
      detail: z.string().optional().default(""),
    })).optional().default([]),
  }).optional().describe("Primary root cause and drivers"),
  products: z.array(z.object({
    product_name: z.string().optional().default(""),
    net_margin: z.number().optional().default(0),
    margin_percent: z.number().optional().default(0),
  })).optional().default([]).describe("Top products sorted by margin"),
  citations: z.array(CitationObjectSchema).optional().describe("Supporting citations for the analysis"),
});

function formatInr(value) {
  const number = Number(value ?? 0);
  return `₹${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function ProfitabilityCard({ period, least_profitable_product, root_cause, products, citations }) {
  const product = least_profitable_product || {};
  const cause = root_cause || {};
  const safeProducts = Array.isArray(products) ? products : [];

  return (
    <div className="data-card" style={{ minWidth: 360, maxWidth: 700 }}>
      <div className="data-card-header">
        <div className="data-card-title">
          <span style={{ fontSize: 16 }}>📉</span>
          Profitability Analysis
        </div>
        {period && <span className="data-card-badge badge-negative">{period}</span>}
      </div>

      <div className="data-card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ border: "4px solid var(--foreground)", padding: 16, background: "var(--bg-secondary)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
            Least profitable product
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, marginBottom: 10 }}>
            {product.product_name || "Unknown product"}
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <div className="stat-item">
              <div className="stat-item-value" style={{ color: "var(--accent-rose)" }}>{formatInr(product.net_margin)}</div>
              <div className="stat-item-label">Net margin</div>
            </div>
            <div className="stat-item">
              <div className="stat-item-value">{Number(product.margin_percent ?? 0).toFixed(1)}%</div>
              <div className="stat-item-label">Margin</div>
            </div>
            <div className="stat-item">
              <div className="stat-item-value">{Number(product.order_count ?? 0).toLocaleString()}</div>
              <div className="stat-item-label">Orders</div>
            </div>
            <div className="stat-item">
              <div className="stat-item-value">{formatInr(product.revenue)}</div>
              <div className="stat-item-label">Revenue</div>
            </div>
          </div>
        </div>

        <div style={{ border: "4px solid var(--foreground)", padding: 16, background: "var(--secondary)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
            Root cause
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>
            {cause.title || "Not enough signal yet"}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 12 }}>
            {cause.summary || "The current data is too sparse to isolate a single cause."}
          </div>

          {Array.isArray(cause.drivers) && cause.drivers.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {cause.drivers.map((driver, index) => (
                <div key={index} style={{ border: "3px solid var(--foreground)", background: "var(--bg-secondary)", padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>
                    {driver.label || "Driver"}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 3 }}>
                    {typeof driver.value === "number" ? formatInr(driver.value) : (driver.value ?? "—")}
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.4, opacity: 0.8 }}>{driver.detail || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {safeProducts.length > 1 && (
          <div style={{ border: "4px solid var(--foreground)", padding: 14, background: "var(--bg-secondary)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>
              Margin ranking
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {safeProducts.slice(0, 4).map((item) => (
                <div key={item.product_name} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                  <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product_name}</span>
                  <span style={{ color: item.net_margin < 0 ? "var(--accent-rose)" : "var(--accent-emerald)", fontWeight: 900 }}>
                    {formatInr(item.net_margin)} · {Number(item.margin_percent ?? 0).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <CitationsPanel citations={citations} />
    </div>
  );
}