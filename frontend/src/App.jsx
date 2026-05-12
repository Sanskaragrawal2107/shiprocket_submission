/**
 * D2C AI Employee — Main Application
 *
 * Features:
 * - Sidebar with branding, navigation, and connection status
 * - Merchant selector (reads live merchant list from backend)
 * - Chat interface with Tambo generative UI
 * - Welcome screen with suggestion chips
 * - Dynamic component rendering from LLM responses
 */

import { useState, useRef, useEffect } from "react";
import {
  TamboProvider,
  useTambo,
  useTamboThreadInput,
  ComponentRenderer,
} from "@tambo-ai/react";
import { tamboComponents } from "./tamboComponents";
import { tamboTools } from "./tamboTools";

const TAMBO_API_KEY = import.meta.env.VITE_TAMBO_API_KEY || "";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ══════════════════════════════════════════════════════════
   useMerchants — fetches merchant list from Supabase via backend
   ══════════════════════════════════════════════════════════ */
function useMerchants() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading]    = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/merchants`)
      .then((r) => (r.ok ? r.json() : { merchants: [] }))
      .then((d) => setMerchants(d.merchants || []))
      .catch(() => setMerchants([]))
      .finally(() => setLoading(false));
  }, []);

  return { merchants, loading };
}

/* ══════════════════════════════════════════════════════════
   MerchantSelector — compact dropdown in the sidebar
   ══════════════════════════════════════════════════════════ */
function MerchantSelector({ merchants, selected, onChange, loading }) {
  return (
    <div className="merchant-selector">
      <div className="merchant-selector-label">Merchant</div>
      {loading ? (
        <div className="merchant-selector-loading">Loading…</div>
      ) : (
        <select
          className="merchant-selector-select"
          value={selected}
          onChange={(e) => onChange(e.target.value)}
        >
          {merchants.length === 0 && (
            <option value="merchant_001">merchant_001 (default)</option>
          )}
          {merchants.map((m) => (
            <option key={m.merchant_id} value={m.merchant_id}>
              {m.name ? `${m.name} (${m.merchant_id})` : m.merchant_id}
            </option>
          ))}
        </select>
      )}
      <div className="merchant-selector-id">{selected}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Sidebar Component
   ══════════════════════════════════════════════════════════ */
function Sidebar({ onSuggestion, merchantId, merchants, merchantsLoading, onMerchantChange }) {
  const navItems = [
    { icon: "💬", label: "Chat",       query: null },
    { icon: "📊", label: "Revenue",    query: "Show me revenue data" },
    { icon: "📦", label: "Orders",     query: "Show me orders breakdown" },
    { icon: "🚚", label: "Deliveries", query: "Show delivery status and RTO rate" },
    { icon: "💳", label: "Payments",   query: "Show payment ledger" },
    { icon: "📈", label: "Ads",        query: "Show ads performance and ROAS" },
    { icon: "🧠", label: "Insights",   query: "Show AI insights and anomalies" },
  ];

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">⚡</div>
          <div>
            <div className="sidebar-logo-text">D2C AI Employee</div>
            <span className="sidebar-logo-badge">AI-Powered</span>
          </div>
        </div>
      </div>

      {/* Merchant Selector */}
      <MerchantSelector
        merchants={merchants}
        selected={merchantId}
        onChange={onMerchantChange}
        loading={merchantsLoading}
      />

      {/* Navigation */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Dashboard</div>
        {navItems.map((item, i) => (
          <div
            key={i}
            className={`sidebar-nav-item ${item.label === "Chat" && !item.query ? "active" : ""}`}
            onClick={() => item.query && onSuggestion(item.query)}
          >
            <span className="sidebar-nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}

        <div className="sidebar-section-title" style={{ marginTop: 20 }}>
          Quick Actions
        </div>
        <div
          className="sidebar-nav-item"
          onClick={() => onSuggestion(`Sync all data for ${merchantId}`)}
        >
          <span className="sidebar-nav-icon">🔄</span>
          Sync Data
        </div>
        <div
          className="sidebar-nav-item"
          onClick={() => onSuggestion(`Run agent analysis for ${merchantId}`)}
        >
          <span className="sidebar-nav-icon">🤖</span>
          Run Agent
        </div>
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-status">
          <span className="status-dot"></span>
          <span>All systems operational</span>
        </div>
      </div>
    </aside>
  );
}

/* ══════════════════════════════════════════════════════════
   Welcome Screen
   ══════════════════════════════════════════════════════════ */
function WelcomeScreen({ onSuggestion, merchantId }) {
  const suggestions = [
    "What's my revenue this week?",
    "Show delivery RTO rate",
    "Which ad campaigns have poor ROAS?",
    "Run a full health check",
    "List failed payments from Razorpay",
    "Show cross-channel trends",
  ];

  return (
    <div className="welcome-screen">
      <div className="welcome-icon">⚡</div>
      <h1 className="welcome-title">D2C AI Employee</h1>
      <p className="welcome-subtitle">
        Analysing data for <strong style={{ color: "var(--accent-cyan)" }}>{merchantId}</strong>.
        Ask anything about your Shopify orders, Shiprocket deliveries, Razorpay
        payments, or Meta Ads — with every number cited back to its source row.
      </p>
      <div className="welcome-suggestions">
        {suggestions.map((s, i) => (
          <button
            key={i}
            className="suggestion-chip"
            onClick={() => onSuggestion(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Chat Interface (inside TamboProvider)
   ══════════════════════════════════════════════════════════ */
function ChatInterface({ merchantId, merchants, merchantsLoading, onMerchantChange }) {
  const {
    messages,
    isStreaming,
    isWaiting,
    currentThreadId,
    startNewThread,
  } = useTambo();

  const { value, setValue, submit, isPending } = useTamboThreadInput();

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle suggestion from sidebar/welcome — inject merchant ID
  useEffect(() => {
    const handler = (e) => {
      // Replace any "for merchant_XXX" pattern with the live selected merchant
      let text = e.detail || "";
      text = text.replace(/for merchant_\w+/gi, `for ${merchantId}`);
      setValue(text);
      setTimeout(async () => {
        try { await submit(); } catch (err) { console.error("Submit error:", err); }
      }, 100);
    };
    window.addEventListener("tambo-suggestion", handler);
    return () => window.removeEventListener("tambo-suggestion", handler);
  }, [setValue, submit, merchantId]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!value.trim() || isPending) return;
    try { await submit(); } catch (err) { console.error("Submit error:", err); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const fireSuggestion = (text) => {
    window.dispatchEvent(new CustomEvent("tambo-suggestion", { detail: text }));
  };

  const hasMessages = messages && messages.length > 0;

  return (
    <div className="app-container">
      <Sidebar
        onSuggestion={fireSuggestion}
        merchantId={merchantId}
        merchants={merchants}
        merchantsLoading={merchantsLoading}
        onMerchantChange={onMerchantChange}
      />

      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <span className="main-header-title">
            {currentThreadId ? "Conversation" : "New Chat"}
          </span>
          <div className="main-header-actions">
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8 }}>
              📍 {merchantId}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={startNewThread}>
              + New Chat
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="chat-area">
          {!hasMessages ? (
            <WelcomeScreen onSuggestion={fireSuggestion} merchantId={merchantId} />
          ) : (
            <div className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {Array.isArray(msg.content) ? (
                    msg.content.map((block, idx) => {
                      if (block.type === "text" && block.text) {
                        return (
                          <div
                            key={`${msg.id}-text-${idx}`}
                            className={`message-bubble ${msg.role}`}
                          >
                            <div className="message-role-label">
                              {msg.role === "user" ? "You" : "AI Employee"}
                            </div>
                            {block.text}
                          </div>
                        );
                      }
                      if (block.type === "component") {
                        return (
                          <div
                            key={block.id || `${msg.id}-comp-${idx}`}
                            className="message-component-wrapper"
                          >
                            <ComponentRenderer
                              content={block}
                              threadId={currentThreadId}
                              messageId={msg.id}
                            />
                          </div>
                        );
                      }
                      if (block.type === "tool_use") {
                        return (
                          <div
                            key={block.id || `${msg.id}-tool-${idx}`}
                            className="tool-call-indicator"
                          >
                            <div className="spinner"></div>
                            {block.statusMessage || `Running ${block.name}…`}
                          </div>
                        );
                      }
                      return null;
                    })
                  ) : (
                    <div className={`message-bubble ${msg.role}`}>
                      <div className="message-role-label">
                        {msg.role === "user" ? "You" : "AI Employee"}
                      </div>
                      {String(msg.content)}
                    </div>
                  )}
                  {msg.renderedComponent && (
                    <div className="message-component-wrapper">
                      {msg.renderedComponent}
                    </div>
                  )}
                </div>
              ))}

              {(isStreaming || isWaiting) && (
                <div className="message-bubble assistant">
                  <div className="message-role-label">AI Employee</div>
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input */}
          <form className="chat-input-container" onSubmit={handleSubmit}>
            <div className="chat-input-wrapper">
              <textarea
                ref={textareaRef}
                className="chat-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask about ${merchantId}'s revenue, orders, deliveries, payments, or ads…`}
                disabled={isPending || isStreaming}
                rows={1}
              />
              <button
                type="submit"
                className="chat-send-btn"
                disabled={!value.trim() || isPending || isStreaming}
              >
                <svg
                  width="18" height="18" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div className="chat-input-hint">
              Press Enter to send · Shift+Enter for new line · Powered by Tambo AI
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   App Root — manages merchantId state, wraps in TamboProvider
   ══════════════════════════════════════════════════════════ */
export default function App() {
  const { merchants, loading: merchantsLoading } = useMerchants();
  const [merchantId, setMerchantId] = useState("merchant_001");

  // Once merchants load, default to the first one
  useEffect(() => {
    if (merchants.length > 0 && merchantId === "merchant_001") {
      setMerchantId(merchants[0].merchant_id);
    }
  }, [merchants]);

  // Build dynamic context helpers that always reflect current merchantId
  const contextHelpers = {
    systemBehavior: () => ({
      key: "systemBehavior",
      value: `You are the D2C AI Employee — a proactive business intelligence assistant for D2C brands.

CURRENT MERCHANT: ${merchantId}
BACKEND: ${API_BASE}

CRITICAL RULES (always follow):
1. NEVER ask the user for merchant ID or date range.
   ALWAYS use the current merchant "${merchantId}" and last 7 days as defaults.
2. ALWAYS render a UI component immediately in response to any business query.
   Do not respond with only text when a component exists for that topic.
3. Revenue/sales query            → render RevenueCard immediately.
4. Orders query                   → render OrdersChart immediately.
5. Deliveries/shipping/RTO query  → render DeliveryTracker immediately.
6. Payments/transactions/refunds  → render PaymentLedger immediately.
7. Ads/ROAS/campaigns query       → render AdsDashboard immediately.
8. Insights/alerts/anomalies      → render InsightsList immediately.
9. Cross-channel/trends query     → render CrossChannelChart immediately.
10. Health/overview/dashboard     → render HealthScore immediately.
11. Sync request → call syncMerchant tool with merchant_id="${merchantId}", then confirm.
12. Analysis/agent request → call runAgent tool with merchant_id="${merchantId}".
13. Populate components with realistic data if live data isn't available yet.
14. Be concise — one short sentence max before rendering the component.
15. Every cited number must reference its source table and row ID in the citations array.`,
    }),
    merchantContext: () => ({
      key: "merchantContext",
      value: `Active merchant: ${merchantId}. Backend API: ${API_BASE}.`,
    }),
  };

  return (
    <TamboProvider
      apiKey={TAMBO_API_KEY}
      userKey={`d2c-${merchantId}`}
      components={tamboComponents}
      tools={tamboTools}
      autoGenerateThreadName={true}
      autoGenerateNameThreshold={2}
      contextHelpers={contextHelpers}
    >
      <ChatInterface
        merchantId={merchantId}
        merchants={merchants}
        merchantsLoading={merchantsLoading}
        onMerchantChange={setMerchantId}
      />
    </TamboProvider>
  );
}
