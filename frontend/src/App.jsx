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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import {
  TamboProvider,
  useTambo,
  useTamboThreadInput,
  useTamboThreadList,
  ComponentRenderer,
} from "@tambo-ai/react";
import { tamboComponents } from "./tamboComponents";
import { tamboTools } from "./tamboTools";
import { useAuth } from "./AuthContext";

const TAMBO_API_KEY = import.meta.env.VITE_TAMBO_API_KEY || "";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function MerchantBadge({ merchantId, email }) {
  return (
    <div className="merchant-badge">
      <div className="merchant-badge-label">Signed in merchant</div>
      <div className="merchant-badge-id">{merchantId}</div>
      {email ? <div className="merchant-badge-email">{email}</div> : null}
    </div>
  );
}

function formatThreadMeta(thread) {
  const rawDate =
    thread?.updatedAt ||
    thread?.updated_at ||
    thread?.createdAt ||
    thread?.created_at ||
    thread?.lastMessageAt ||
    thread?.last_message_at;

  if (!rawDate) return "Recent";

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return "Recent";

  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getVisibleMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter((message) => message?.role !== "system");
}

function hasVisibleText(content) {
  if (typeof content === "string") {
    return content.trim().length > 0;
  }

  if (Array.isArray(content)) {
    return content.some((block) => {
      if (block?.type === "text") return typeof block.text === "string" && block.text.trim().length > 0;
      if (block?.type === "component") return true;
      return false;
    });
  }

  return Boolean(String(content || "").trim());
}

function HistoryPanel({ threads, loading, activeThreadId, onSelectThread, onNewChat }) {
  const threadList = Array.isArray(threads) ? threads : [];

  return (
    <section className="history-panel" aria-label="Conversation history">
      <div className="sidebar-section-title">History</div>
      <button type="button" className="history-new-btn" onClick={onNewChat}>
        + New Chat
      </button>

      {loading ? (
        <div className="history-empty">Loading saved chats…</div>
      ) : threadList.length > 0 ? (
        <div className="history-list">
          {threadList.map((thread) => {
            const threadId = thread?.id;
            const title = thread?.name || thread?.title || "Untitled chat";
            const isActive = threadId && threadId === activeThreadId;

            return (
              <button
                key={threadId}
                type="button"
                className={`history-item ${isActive ? "active" : ""}`}
                onClick={() => threadId && onSelectThread(threadId)}
              >
                <span className="history-item-title">{title}</span>
                <span className="history-item-meta">{formatThreadMeta(thread)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="history-empty">No saved chats yet.</div>
      )}
    </section>
  );
}

function MessageMarkdown({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}

/* ══════════════════════════════════════════════════════════
   Sidebar Component
   ══════════════════════════════════════════════════════════ */
function Sidebar({
  onSuggestion,
  merchantId,
  merchantEmail,
  historyThreads,
  historyLoading,
  activeThreadId,
  onSelectThread,
  onNewChat,
}) {
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

      <MerchantBadge merchantId={merchantId} email={merchantEmail} />

      <div className="sidebar-section">
        <HistoryPanel
          threads={historyThreads}
          loading={historyLoading}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onNewChat={onNewChat}
        />

        <div className="sidebar-section-title sidebar-section-title-spaced">
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
function ChatInterface({ merchantId, userEmail }) {
  const {
    messages,
    isStreaming,
    isWaiting,
    currentThreadId,
    startNewThread,
    switchThread,
  } = useTambo();

  const { data: threadListData, isLoading: historyLoading } = useTamboThreadList({
    userKey: `d2c-${merchantId}`,
    limit: 8,
  });

  const { value, setValue, submit, isPending } = useTamboThreadInput();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);
  const visibleMessages = getVisibleMessages(messages);

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
  
  // Extract threads from infinite query pages
  const historyThreads = threadListData?.pages 
    ? threadListData.pages.flatMap(p => p.threads ?? []) 
    : (threadListData?.threads ?? []);

  const handleSelectThread = (threadId) => {
    switchThread(threadId);
  };

  return (
    <div className={`app-container ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
      {isSidebarOpen && (
        <Sidebar
          onSuggestion={fireSuggestion}
          merchantId={merchantId}
          merchantEmail={userEmail}
          historyThreads={historyThreads}
          historyLoading={historyLoading}
          activeThreadId={currentThreadId}
          onSelectThread={handleSelectThread}
          onNewChat={startNewThread}
        />
      )}

      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <div className="main-header-left">
            <button
              type="button"
              className="sidebar-toggle-btn"
              onClick={() => setIsSidebarOpen((open) => !open)}
              aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            </button>
            <span className="main-header-title">
              {currentThreadId ? "Conversation" : "New Chat"}
            </span>
          </div>
          <div className="main-header-actions">
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 8 }}>
              📍 {merchantId}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/dashboard")}>
              ← Dashboard
            </button>
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
              {visibleMessages.map((msg) => (
                <div key={msg.id}>
                  {hasVisibleText(msg.content) && (
                    Array.isArray(msg.content) ? (
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
                              <div className="message-markdown">
                                <MessageMarkdown content={block.text} />
                              </div>
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
                        return null;
                      })
                    ) : (
                      <div className={`message-bubble ${msg.role}`}>
                        <div className="message-role-label">
                          {msg.role === "user" ? "You" : "AI Employee"}
                        </div>
                        <div className="message-markdown">
                          <MessageMarkdown content={String(msg.content)} />
                        </div>
                      </div>
                    )
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
  const { merchant, user, loading: authLoading, authFetch } = useAuth();
  const navigate = useNavigate();
  const merchantId = merchant?.merchant_id || "";
  const userEmail = user?.email || merchant?.email || "";
  const [kpis, setKpis] = useState(null);

  useEffect(() => {
    if (!merchantId) return;
    authFetch(`/agent/insights/${merchantId}`)
      .then(data => {
        const rows = Array.isArray(data?.insights) ? data.insights : [];
        const latest = rows.find(r => r.data_snapshot);
        if (latest?.data_snapshot) setKpis(latest.data_snapshot);
      })
      .catch(console.error);
  }, [merchantId, authFetch]);

  if (authLoading || !merchantId) {
    return (
      <div className="auth-loading-shell">
        <div className="auth-loading-card">
          <div className="auth-loading-kicker">D2C AI Employee</div>
          <div className="auth-loading-title">Preparing your dashboard</div>
          <div className="auth-loading-copy">Checking your session and merchant workspace.</div>
        </div>
      </div>
    );
  }

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
      value: `Active merchant: ${merchantId}. Backend API: ${API_BASE}.
LIVE KPI DATA FOR THIS MERCHANT (use this exact data to populate components if possible):
${kpis ? JSON.stringify(kpis, null, 2) : "No live data available yet."}`,
    }),
  };

  return (
    <TamboProvider
      key={merchantId}
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
        userEmail={userEmail}
      />
    </TamboProvider>
  );
}
