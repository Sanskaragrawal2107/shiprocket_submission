import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useNavigate } from "react-router-dom";
import {
  ComponentRenderer,
  TamboProvider,
  useTambo,
  useTamboThreadInput,
  useTamboThreadList,
} from "@tambo-ai/react";
import { tamboComponents } from "./tamboComponents";
import { tamboTools } from "./tamboTools";
import { useAuth } from "./AuthContext";

const TAMBO_API_KEY = import.meta.env.VITE_TAMBO_API_KEY || "";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

function formatThreadMeta(thread) {
  const rawDate =
    thread?.updatedAt ||
    thread?.updated_at ||
    thread?.createdAt ||
    thread?.created_at ||
    thread?.lastMessageAt ||
    thread?.last_message_at;
  const parsed = rawDate ? new Date(rawDate) : new Date(0);
  if (Number.isNaN(parsed.getTime())) return "Recent";

  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getVisibleMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter((message) => message?.role !== "system");
}

function hasVisibleText(content) {
  if (typeof content === "string") return content.trim().length > 0;

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
      <div className="sidebar-section-title">AI Commerce Agent</div>
      <button type="button" className="history-new-btn" onClick={onNewChat}>
        + New Thread
      </button>

      {loading ? (
        <div className="history-empty">Loading threads...</div>
      ) : threadList.length > 0 ? (
        <div className="history-list">
          {threadList.map((thread) => {
            const threadId = thread?.id;
            const title = thread?.name || thread?.title || "Untitled thread";
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
        <div className="history-empty">No threads yet. Start a conversation.</div>
      )}
    </section>
  );
}

function MessageMarkdown({ content }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
}

function Sidebar({
  onSuggestion,
  historyThreads,
  historyLoading,
  activeThreadId,
  onSelectThread,
  onNewChat,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <HistoryPanel
          threads={historyThreads}
          loading={historyLoading}
          activeThreadId={activeThreadId}
          onSelectThread={onSelectThread}
          onNewChat={onNewChat}
        />

        <div className="sidebar-quick-actions" aria-label="Quick actions">
          <button type="button" onClick={() => onSuggestion("Sync all data")}>
            Sync Data
          </button>
          <button type="button" onClick={() => onSuggestion("Run agent analysis")}>
            Run Agent
          </button>
        </div>
      </div>
    </aside>
  );
}

function WelcomeScreen({ onSuggestion, merchantId }) {
  const suggestions = [
    "Find revenue leaks from the last 7 days",
    "Show delivery RTO rate by channel",
    "Which ad campaigns have poor ROAS?",
    "Summarize payments, refunds, and COD risk",
  ];

  return (
    <div className="welcome-screen">
      <h1 className="welcome-title">
        Ask me anything about your <span>business.</span>
      </h1>
      <p className="welcome-subtitle">
        Search in plain English. The agent will query data for <strong>{merchantId}</strong>,
        check orders, deliveries, payments, and ads, then return cited answers.
      </p>
      <div className="welcome-suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            className="suggestion-chip"
            onClick={() => onSuggestion(suggestion)}
            type="button"
          >
            <span aria-hidden="true">-&gt;</span>
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatInterface({ merchantId, userEmail }) {
  const {
    currentThreadId,
    isStreaming,
    isWaiting,
    messages,
    startNewThread,
    switchThread,
  } = useTambo();

  const { data: threadListData, isLoading: historyLoading } = useTamboThreadList({
    userKey: `d2c-${merchantId}`,
    limit: 8,
  });

  const { value, setValue, submit, isPending } = useTamboThreadInput();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const visibleMessages = getVisibleMessages(messages);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handler = (event) => {
      let text = event.detail || "";
      text = text.replace(/for merchant_\w+/gi, `for ${merchantId}`);
      setValue(text);
      setTimeout(async () => {
        try {
          await submit();
        } catch (err) {
          console.error("Submit error:", err);
        }
      }, 100);
    };

    window.addEventListener("tambo-suggestion", handler);
    return () => window.removeEventListener("tambo-suggestion", handler);
  }, [merchantId, setValue, submit]);

  const handleSubmit = async (event) => {
    event?.preventDefault();
    if (!value.trim() || isPending) return;

    try {
      await submit();
    } catch (err) {
      console.error("Submit error:", err);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const fireSuggestion = (text) => {
    window.dispatchEvent(new CustomEvent("tambo-suggestion", { detail: text }));
  };

  const handleSelectThread = (threadId) => {
    switchThread(threadId);
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const historyThreads = threadListData?.pages
    ? threadListData.pages.flatMap((page) => page.threads ?? [])
    : threadListData?.threads ?? [];

  const hasMessages = visibleMessages.length > 0;

  return (
    <div className={`app-container ${isSidebarOpen ? "sidebar-open" : "sidebar-collapsed"}`}>
      <div className="chat-layout">
        {isSidebarOpen && (
          <Sidebar
            onSuggestion={fireSuggestion}
            historyThreads={historyThreads}
            historyLoading={historyLoading}
            activeThreadId={currentThreadId}
            onSelectThread={handleSelectThread}
            onNewChat={startNewThread}
          />
        )}

        <main className="main-content">
          <header className="main-header">
            <div className="main-header-left">
              <button
                type="button"
                className="sidebar-toggle-btn"
                onClick={() => setIsSidebarOpen((open) => !open)}
                aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
              >
                {isSidebarOpen ? "Hide" : "Threads"}
              </button>
              <span className="agent-icon" aria-hidden="true">AI</span>
              <div className="agent-heading">
                <span className="main-header-title">AI Commerce Agent</span>
                <span className="thread-status">
                  {currentThreadId ? "Thread selected" : "No thread selected"} <b>Ready</b>
                </span>
              </div>
            </div>
            <div className="main-header-actions">
              <span className="topbar-merchant">{userEmail || merchantId}</span>
              <Link className="btn btn-ghost btn-sm" to="/dashboard">
                Dashboard
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={startNewThread} type="button">
                New Thread
              </button>
              <button type="button" className="btn btn-ghost btn-sm logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </header>

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
                              <div key={`${msg.id}-text-${idx}`} className={`message-bubble ${msg.role}`}>
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
                              <div key={block.id || `${msg.id}-comp-${idx}`} className="message-component-wrapper">
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

            <form className="chat-input-container" onSubmit={handleSubmit}>
              <div className="chat-input-wrapper">
                <textarea
                  ref={textareaRef}
                  className="chat-input"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask: 'Find revenue leaks from the last 7 days' - Shift+Enter for new line"
                  disabled={isPending || isStreaming}
                  rows={1}
                />
                <button
                  type="submit"
                  className="chat-send-btn"
                  disabled={!value.trim() || isPending || isStreaming}
                  aria-label="Send message"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <div className="chat-input-hint">
                Merchant-only - AI-powered by MCP agent - Press Enter to send
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { merchant, user, loading: authLoading, authFetch } = useAuth();
  const merchantId = merchant?.merchant_id || "";
  const userEmail = user?.email || merchant?.email || "";
  const [kpis, setKpis] = useState(null);

  useEffect(() => {
    if (!merchantId) return;

    authFetch(`/agent/insights/${merchantId}`)
      .then((data) => {
        const rows = Array.isArray(data?.insights) ? data.insights : [];
        const latest = rows.find((row) => row.data_snapshot);
        if (latest?.data_snapshot) setKpis(latest.data_snapshot);
      })
      .catch(console.error);
  }, [authFetch, merchantId]);

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

  const contextHelpers = {
    systemBehavior: () => ({
      key: "systemBehavior",
      value: `You are the D2C AI Employee, a proactive business intelligence assistant for D2C brands.

CURRENT MERCHANT: ${merchantId}
BACKEND: ${API_BASE}

CRITICAL RULES:
1. NEVER ask the user for merchant ID or date range. Use current merchant "${merchantId}" and last 7 days by default.
2. ALWAYS render a UI component immediately in response to any business query.
3. Revenue/sales query -> render RevenueCard immediately.
4. Orders query -> render OrdersChart immediately.
5. Deliveries/shipping/RTO query -> render DeliveryTracker immediately.
6. Payments/transactions/refunds query -> render PaymentLedger immediately.
7. Ads/ROAS/campaigns query -> render AdsDashboard immediately.
8. Insights/alerts/anomalies query -> render InsightsList immediately.
9. Cross-channel/trends query -> render CrossChannelChart immediately.
10. Health/overview/dashboard query -> render HealthScore immediately.
11. Sync request -> call syncMerchant with merchant_id="${merchantId}", then confirm.
12. Least profitable product / product margin / root cause -> call getProfitability with merchant_id="${merchantId}" and render a single ProfitabilityCard.
13. For broad mixed questions about orders, ads, payments, and deliveries, keep the response clean: prefer one profitability answer over multiple charts unless the user explicitly asks for separate breakdowns.
14. Analysis/agent request -> call runAgent with merchant_id="${merchantId}".
15. Populate components with realistic data if live data is unavailable.
16. Be concise: one short sentence max before rendering the component.
17. Every cited number must reference its source table and row ID in the citations array.`,
    }),
    merchantContext: () => ({
      key: "merchantContext",
      value: `Active merchant: ${merchantId}. Backend API: ${API_BASE}.
LIVE KPI DATA FOR THIS MERCHANT:
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
      <ChatInterface merchantId={merchantId} userEmail={userEmail} />
    </TamboProvider>
  );
}
