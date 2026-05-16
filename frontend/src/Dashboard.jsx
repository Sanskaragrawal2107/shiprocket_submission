/**
 * D2C AI Employee — Main Dashboard
 *
 * Sections:
 * 1. Top navbar: branding, merchant info, notification bell, logout
 * 2. KPI bar: Total Orders, Revenue, RTO%, ROAS, Settlement Pending, Ad Spend
 * 3. Anomaly / Action cards from /agent/insights
 * 4. Sync status bar with last_synced_at + Sync Now button
 * 5. Floating "Chat with AI" button → opens Tambo chatbot panel
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  TamboProvider,
  useTambo,
  useTamboThreadInput,
  useTamboThreadList,
  ComponentRenderer,
} from "@tambo-ai/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "./AuthContext";
import OnboardingModal from "./components/OnboardingModal";
import { tamboComponents } from "./tamboComponents";
import { tamboTools } from "./tamboTools";
import { formatAppDateTime } from "./time";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TAMBO_API_KEY = import.meta.env.VITE_TAMBO_API_KEY || "";

/* ══════════════════════════════════════════════════════════
   Priority badge colours
   ══════════════════════════════════════════════════════════ */
const PRIORITY_CONFIG = {
  P0: { bg: "#ff6b6b", color: "#fff", label: "P0 Critical" },
  P1: { bg: "#ffd93d", color: "#000", label: "P1 High" },
  P2: { bg: "#c4b5fd", color: "#000", label: "P2 Medium" },
};

/* ══════════════════════════════════════════════════════════
   Currency / number formatters
   ══════════════════════════════════════════════════════════ */
function fmtINR(val) {
  const n = Number(val);
  if (isNaN(n)) return "—";
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function fmtPct(val) {
  const n = Number(val);
  return isNaN(n) ? "—" : `${n.toFixed(1)}%`;
}

function fmtNum(val) {
  const n = Number(val);
  if (isNaN(n)) return "—";
  if (n >= 1_00_000) return `${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/* ══════════════════════════════════════════════════════════
   KPI Card
   ══════════════════════════════════════════════════════════ */
function KpiCard({ icon, label, value, accent, loading }) {
  return (
    <div
      className="kpi-card"
      style={{ borderTop: `5px solid ${accent || "#ffd93d"}` }}
    >
      <div className="kpi-icon">{icon}</div>
      <div className="kpi-value">{loading ? <span className="kpi-skeleton" /> : value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Anomaly / Action Card
   ══════════════════════════════════════════════════════════ */
function AnomalyCard({ insight, onResolve }) {
  const priority = insight.priority || "P2";
  const cfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.P2;
  const [resolved, setResolved] = useState(false);

  const handle = () => {
    setResolved(true);
    if (onResolve) onResolve(insight);
  };

  if (resolved) return null;

  return (
    <div className="anomaly-card" style={{ borderLeft: `6px solid ${cfg.bg}` }}>
      <div className="anomaly-card-header">
        <span
          className="anomaly-priority-badge"
          style={{ background: cfg.bg, color: cfg.color }}
        >
          {cfg.label}
        </span>
        <h3 className="anomaly-title">{insight.title || insight.type || "Anomaly"}</h3>
      </div>

      {insight.issue && (
        <p className="anomaly-issue">{insight.issue}</p>
      )}
      {insight.recommendation && !insight.issue && (
        <p className="anomaly-issue">{insight.recommendation}</p>
      )}

      {(insight.action) && (
        <div className="anomaly-action">
          <span className="anomaly-action-label">→ Action</span>
          <span>{insight.action}</span>
        </div>
      )}

      {/* Evidence metrics */}
      {Array.isArray(insight.evidence) && insight.evidence.length > 0 && (
        <div className="anomaly-evidence">
          {insight.evidence.map((ev, i) => (
            <span key={i} className="evidence-chip">
              {ev.metric}: <strong>{ev.value}</strong>
              {ev.threshold ? ` (threshold: ${ev.threshold})` : ""}
            </span>
          ))}
        </div>
      )}

      {insight.estimated_saving != null && (
        <div className="anomaly-saving">
          💰 Est. saving: <strong>{fmtINR(insight.estimated_saving)}</strong>
        </div>
      )}

      <div className="anomaly-card-footer">
        {insight.created_at && (
          <span className="anomaly-time">
            {formatAppDateTime(insight.created_at)}
          </span>
        )}
        <button className="anomaly-resolve-btn" onClick={handle}>
          ✓ Mark Resolved
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Notification Bell
   ══════════════════════════════════════════════════════════ */
function NotificationBell({ notifications, unreadCount, onMarkRead, onMarkAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        className="notif-bell-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={onMarkAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No new notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${n.is_read ? "read" : "unread"}`}
                  onClick={() => onMarkRead(n.id)}
                >
                  <div className="notif-item-title">{n.title}</div>
                  <div className="notif-item-msg">{n.message}</div>
                  <div className="notif-item-time">
                    {formatAppDateTime(n.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Sync Status Bar
   ══════════════════════════════════════════════════════════ */
function SyncBar({ lastSyncedAt, merchantId, authFetch, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const handleSync = async () => {
    setSyncing(true);
    setError("");
    try {
      await authFetch(`/sync/${merchantId}`, { method: "POST" });
      if (onSynced) onSynced();
    } catch (err) {
      setError(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const lastSyncStr = lastSyncedAt
    ? formatAppDateTime(lastSyncedAt)
    : "Never synced";

  return (
    <div className="sync-bar">
      <div className="sync-bar-left">
        <span className="sync-dot" style={{ background: lastSyncedAt ? "#22c55e" : "#ffd93d" }} />
        <span className="sync-label">Last sync: <strong>{lastSyncStr}</strong></span>
      </div>
      <div className="sync-bar-right">
        {error && <span className="sync-error">{error}</span>}
        <button
          className="sync-btn"
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? "Syncing…" : "⟳ Sync Now"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Thread History Sidebar
   ══════════════════════════════════════════════════════════ */
function ThreadHistorySidebar({ onClose, merchantId }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTamboThreadList({ userKey: `d2c-${merchantId}`, limit: 30 });
  const { currentThreadId, switchThread, startNewThread } = useTambo();

  // Flatten pages (useTamboThreadList returns infinite query pages)
  const threads = data?.pages
    ? data.pages.flatMap((p) => p.threads ?? [])
    : (data?.threads ?? []);

  return (
    <div className="chat-history-sidebar">
      <div className="chat-history-header">
        <span className="chat-history-title">💬 History</span>
        <button className="chat-panel-icon-btn" onClick={onClose} title="Close">✕</button>
      </div>

      <button
        className="chat-history-new-btn"
        onClick={() => startNewThread()}
      >
        + New Chat
      </button>

      <div className="chat-history-list">
        {isLoading ? (
          <div className="chat-history-loading">
            <div className="loading-dots"><span /><span /><span /></div>
          </div>
        ) : threads.length === 0 ? (
          <div className="chat-history-empty">No conversations yet</div>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              className={`chat-history-item ${thread.id === currentThreadId ? "active" : ""}`}
              onClick={() => { switchThread(thread.id); onClose(); }}
            >
              <span className="chat-history-item-name">
                {thread.name || "Untitled conversation"}
              </span>
              <span className="chat-history-item-date">
                {formatAppDateTime(thread.updatedAt ?? thread.createdAt)}
              </span>
            </button>
          ))
        )}

        {hasNextPage && (
          <button
            className="chat-history-load-more"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Floating Chat Panel (Tambo)
   ══════════════════════════════════════════════════════════ */
function ChatPanel({ merchantId, onClose }) {
  const navigate = useNavigate();
  const { messages, isStreaming, isWaiting, startNewThread } = useTambo();
  const { value, setValue, submit, isPending } = useTamboThreadInput();
  const messagesEndRef = useRef(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const visibleMessages = (Array.isArray(messages) ? messages : []).filter(
    (m) => m?.role !== "system"
  );

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isPending) submit();
    }
  };

  return (
    <div className="chat-panel">
      {/* History sidebar slides in from the left */}
      {showHistory && (
        <ThreadHistorySidebar merchantId={merchantId} onClose={() => setShowHistory(false)} />
      )}

      <div className="chat-panel-main">
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <button
              className="chat-panel-icon-btn"
              onClick={() => setShowHistory((v) => !v)}
              title="Chat history"
              style={{ marginRight: 6 }}
            >
              ☰
            </button>
            <span>⚡</span> AI Employee
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="chat-panel-icon-btn" onClick={() => startNewThread()} title="New chat">✦</button>
            <button
              className="chat-panel-icon-btn"
              onClick={() => navigate("/chat")}
              title="Open full-screen chat"
            >
              ⤢
            </button>
            <button className="chat-panel-icon-btn" onClick={onClose} title="Close">✕</button>
          </div>
        </div>

        <div className="chat-panel-messages">
          {visibleMessages.length === 0 ? (
            <div className="chat-panel-welcome">
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>Ask me anything</div>
              <div style={{ fontSize: 12, opacity: 0.65 }}>
                Revenue · Orders · Deliveries · Payments · Ads
              </div>
              <div style={{ fontSize: 11, opacity: 0.45, marginTop: 8 }}>
                Tap ☰ to browse your conversation history
              </div>
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const content = msg.content;
              return (
                <div key={msg.id}>
                  {Array.isArray(content)
                    ? content.map((block, idx) => {
                        if (block.type === "text" && block.text) {
                          return (
                            <div
                              key={`${msg.id}-t${idx}`}
                              className={`chat-panel-bubble ${msg.role}`}
                            >
                              <div className="chat-panel-role">
                                {msg.role === "user" ? "You" : "AI Employee"}
                              </div>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {block.text}
                              </ReactMarkdown>
                            </div>
                          );
                        }
                        if (block.type === "component") {
                          return (
                            <div key={block.id || `${msg.id}-c${idx}`} style={{ padding: "8px 0" }}>
                              <ComponentRenderer
                                content={block}
                                threadId={msg.threadId}
                                messageId={msg.id}
                              />
                            </div>
                          );
                        }
                        return null;
                      })
                    : (
                      <div className={`chat-panel-bubble ${msg.role}`}>
                        <div className="chat-panel-role">
                          {msg.role === "user" ? "You" : "AI Employee"}
                        </div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {String(content || "")}
                        </ReactMarkdown>
                      </div>
                    )}
                </div>
              );
            })
          )}

          {(isStreaming || isWaiting) && (
            <div className="chat-panel-bubble assistant">
              <div className="chat-panel-role">AI Employee</div>
              <div className="loading-dots">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-panel-input-wrap">
          <textarea
            className="chat-panel-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about revenue, RTO, ROAS…"
            rows={1}
            disabled={isPending || isStreaming}
          />
          <button
            className="chat-panel-send"
            disabled={!value.trim() || isPending || isStreaming}
            onClick={() => submit()}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Dashboard Inner (uses auth context)
   ══════════════════════════════════════════════════════════ */

function DashboardInner() {
  const { merchant, logout, authFetch, refreshSession, saveMerchantPreferences } = useAuth();
  const merchantId = merchant?.merchant_id || "";
  const isFirstTimeOnboarding = !merchant?.onboarded;

  /* State */
  const [kpis, setKpis] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(merchant?.last_synced_at || null);
  const [chatOpen, setChatOpen] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(!merchant?.onboarded);

  /* Derived */
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  /* Fetch KPIs from agent_insights.data_snapshot */
  const fetchInsights = useCallback(async () => {
    if (!merchantId) return;
    setInsightsLoading(true);
    try {
      const data = await authFetch(`/agent/insights/${merchantId}`);
      const rows = Array.isArray(data?.insights) ? data.insights : [];
      setInsights(rows);

      const latest = rows.find((r) => r.data_snapshot);
      const snapshot = latest?.data_snapshot?.metrics_checked || latest?.data_snapshot || null;
      if (snapshot) {
        setKpis(snapshot);
      }
    } catch (err) {
      console.error("Insights fetch failed:", err);
    } finally {
      setInsightsLoading(false);
      setKpiLoading(false);
    }
  }, [merchantId, authFetch]);

  /* Fetch notifications */
  const fetchNotifications = useCallback(async () => {
    if (!merchantId) return;
    try {
      const data = await authFetch("/notifications");
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch (err) {
      console.error("Notifications fetch failed:", err);
    }
  }, [merchantId, authFetch]);

  /* Fetch merchant profile for last_synced_at */
  const fetchProfile = useCallback(async () => {
    if (!merchantId) return;
    try {
      const profile = await authFetch("/auth/me");
      if (profile?.last_synced_at) setLastSyncedAt(profile.last_synced_at);
    } catch {/* ignore */}
  }, [merchantId, authFetch]);

  useEffect(() => {
    fetchInsights();
    fetchNotifications();
    fetchProfile();
  }, [fetchInsights, fetchNotifications, fetchProfile]);

  useEffect(() => {
    setShowOnboarding(!merchant?.onboarded);
  }, [merchant]);

  /* Mark one notification read */
  const handleMarkRead = async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await authFetch(`/notifications/${id}/read`, { method: "PUT" });
    } catch {/* optimistic, ignore */}
  };

  /* Mark all read */
  const handleMarkAll = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await authFetch("/notifications/read-all", { method: "PUT" });
    } catch {/* optimistic */}
  };

  /* After sync, refresh profile + insights */
  const handleSynced = () => {
    fetchProfile();
    setTimeout(fetchInsights, 3000); // give backend a moment
  };

  /* Run agent */
  const handleRunAgent = async () => {
    if (agentRunning) return;
    setAgentRunning(true);
    try {
      await authFetch(`/agent/run/${merchantId}`, { method: "POST" });
      await fetchInsights();
      await fetchNotifications();
    } catch (err) {
      console.error("Agent run failed:", err);
    } finally {
      setAgentRunning(false);
    }
  };

  const handleOnboardingSave = async (values) => {
    try {
      saveMerchantPreferences(merchantId, { onboarded: true, settings: values });
      await authFetch("/auth/me", { method: "PUT", body: { settings: values, onboarded: true } });
      await refreshSession();
      setShowOnboarding(false);
    } catch (err) {
      console.error("Onboarding save failed:", err);
    }
  };

  const handleOnboardingSkip = async (defaults) => {
    if (!isFirstTimeOnboarding) {
      setShowOnboarding(false);
      return;
    }

    try {
      saveMerchantPreferences(merchantId, { onboarded: true, settings: defaults });
      await authFetch("/auth/me", { method: "PUT", body: { settings: defaults, onboarded: true } });
      await refreshSession();
    } catch (err) {
      console.error("Onboarding skip failed:", err);
    } finally {
      setShowOnboarding(false);
    }
  };

  /* KPI display helpers — normalized from agent_insights.data_snapshot.metrics_checked */
  const totalOrders = kpis?.total_orders ?? null;
  const revenue = kpis?.total_revenue ?? null;
  const rtoRate = kpis?.rto_rate ?? null;
  const roas = kpis?.roas ?? null;
  const settlementGap = kpis?.settlement_gap_percent ?? null;
  const adSpend = kpis?.total_ad_spend ?? null;

  /**
   * Flatten insights into displayable anomaly cards.
   * The DB stores two useful fields:
   *   - conditions_triggered: array of {condition, message, actual, threshold, details}
   *   - recommendations: flat string array (group into one card per insight row)
   */
  const allInsights = insights.flatMap((row) => {
    const cards = [];

    // 1. conditions_triggered → one card per triggered condition
    if (Array.isArray(row.conditions_triggered) && row.conditions_triggered.length > 0) {
      row.conditions_triggered.forEach((ct, idx) => {
        cards.push({
          id: `${row.id}-cond-${idx}`,
          title: ct.message || ct.condition || "Anomaly Detected",
          issue: ct.message || "",
          action: "",
          priority: ct.actual > ct.threshold * 1.5 ? "P0" : "P1",
          evidence: [{
            metric: ct.condition,
            value: ct.actual,
            threshold: ct.threshold,
            source_table: ct.details ? Object.keys(ct.details).join(", ") : "",
          }],
          estimated_saving: null,
          created_at: row.triggered_at,
        });
      });
    }

    // 2. recommendations (flat string array) → group into one summary card
    if (Array.isArray(row.recommendations) && row.recommendations.length > 0) {
      // Find header lines (end with ":**") and their following body text
      const sections = [];
      let current = null;
      row.recommendations.forEach((line) => {
        if (typeof line !== "string") return;
        if (line.endsWith(":**") || line.endsWith("**")) {
          if (current) sections.push(current);
          current = { title: line.replace(/\*+/g, "").replace(/:$/, "").trim(), lines: [] };
        } else if (current) {
          current.lines.push(line);
        }
      });
      if (current) sections.push(current);

      if (sections.length > 0) {
        sections.forEach((sec, idx) => {
          cards.push({
            id: `${row.id}-rec-${idx}`,
            title: sec.title,
            issue: sec.lines[0] || "",
            action: sec.lines.slice(1).join(" "),
            priority: "P2",
            evidence: [],
            estimated_saving: row.estimated_saving,
            created_at: row.triggered_at,
          });
        });
      } else {
        // Fallback: single card with all text
        cards.push({
          id: `${row.id}-rec-0`,
          title: "Recommendation",
          issue: row.recommendations.slice(0, 3).join(" "),
          action: row.recommendations.slice(3).join(" "),
          priority: "P2",
          evidence: [],
          estimated_saving: row.estimated_saving,
          created_at: row.triggered_at,
        });
      }
    }

    return cards;
  });

  /* Build Tambo context helpers */
  const contextHelpers = {
    systemBehavior: () => ({
      key: "systemBehavior",
      value: `You are the D2C AI Employee — a proactive business intelligence assistant for D2C brands.
CURRENT MERCHANT: ${merchantId}
BACKEND: ${API_BASE}
CRITICAL RULES:
1. NEVER ask for merchant ID. Always use "${merchantId}".
2. Always render a UI component immediately in response to any business query.
3. Revenue/sales → RevenueCard. Orders → OrdersChart. Deliveries/RTO → DeliveryTracker.
4. Payments → PaymentLedger. Ads/ROAS → AdsDashboard. Insights → InsightsList.
5. Cross-channel → CrossChannelChart. Health/overview → HealthScore.
6. Sync request → call syncMerchant tool with merchant_id="${merchantId}".
7. Analysis/agent request → call runAgent tool with merchant_id="${merchantId}".
8. Populate components with realistic data if live data isn't available yet.
9. Be concise — one short sentence max before rendering component.`,
    }),
    merchantContext: () => ({
      key: "merchantContext",
      value: `Active merchant: ${merchantId}. Backend: ${API_BASE}.
LIVE KPI DATA FOR THIS MERCHANT (use this exact data to populate components if possible):
${kpis ? JSON.stringify(kpis, null, 2) : "No live data available yet."}`,
    }),
  };

  return (
    <div className="db-shell">
      <OnboardingModal
        open={showOnboarding}
        initialSettings={merchant?.settings}
        onSave={handleOnboardingSave}
        onSkip={handleOnboardingSkip}
        onClose={() => setShowOnboarding(false)}
        isFirstTime={isFirstTimeOnboarding}
      />
      {/* ── TOP NAV ── */}
      <header className="db-nav">
        <div className="db-nav-left">
          <div className="db-logo">
            <span className="db-logo-icon">⚡</span>
            <span className="db-logo-name">D2C AI Employee</span>
            <span className="db-logo-badge">AI-Powered</span>
          </div>
        </div>

        <div className="db-nav-right">
          <div className="db-merchant-chip">
            <span className="db-merchant-id">{merchantId}</span>
            {merchant?.name && <span className="db-merchant-name">{merchant.name}</span>}
          </div>

          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={handleMarkRead}
            onMarkAll={handleMarkAll}
          />

          <button
            className="db-settings-btn"
            onClick={() => setShowOnboarding(true)}
            title="Merchant settings"
            aria-label="Open merchant settings"
          >
            ⚙
          </button>

          <button className="db-logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      {/* ── SYNC BAR ── */}
      <SyncBar
        lastSyncedAt={lastSyncedAt}
        merchantId={merchantId}
        authFetch={authFetch}
        onSynced={handleSynced}
      />

      {/* ── MAIN CONTENT ── */}
      <main className="db-main">
        {/* KPI Bar */}
        <section className="db-section">
          <div className="db-section-header">
            <h2 className="db-section-title">Key Metrics</h2>
            <button
              className="db-run-agent-btn"
              onClick={handleRunAgent}
              disabled={agentRunning}
            >
              {agentRunning ? "Analysing…" : "🤖 Run Agent"}
            </button>
          </div>

          <div className="kpi-grid">
            <KpiCard
              icon="📦"
              label="Total Orders"
              value={totalOrders !== null ? fmtNum(totalOrders) : "—"}
              accent="#ffd93d"
              loading={kpiLoading}
            />
            <KpiCard
              icon="₹"
              label="Revenue"
              value={revenue !== null ? fmtINR(revenue) : "—"}
              accent="#22c55e"
              loading={kpiLoading}
            />
            <KpiCard
              icon="🔄"
              label="RTO Rate"
              value={rtoRate !== null ? fmtPct(rtoRate) : "—"}
              accent={rtoRate > 15 ? "#ff6b6b" : "#ffd93d"}
              loading={kpiLoading}
            />
            <KpiCard
              icon="📈"
              label="ROAS"
              value={roas !== null ? `${Number(roas).toFixed(2)}x` : "—"}
              accent={roas < 2 ? "#ff6b6b" : "#c4b5fd"}
              loading={kpiLoading}
            />
            <KpiCard
              icon="⏳"
              label="Settlement Gap"
              value={settlementGap !== null ? fmtPct(settlementGap) : "—"}
              accent={settlementGap > 20 ? "#ff6b6b" : "#ffd93d"}
              loading={kpiLoading}
            />
            <KpiCard
              icon="📣"
              label="Ad Spend"
              value={adSpend !== null ? fmtINR(adSpend) : "—"}
              accent="#c4b5fd"
              loading={kpiLoading}
            />
          </div>
        </section>

        {/* Anomaly Cards */}
        <section className="db-section">
          <div className="db-section-header">
            <h2 className="db-section-title">
              Anomalies & Recommendations
              {allInsights.length > 0 && (
                <span className="db-count-badge">{allInsights.length}</span>
              )}
            </h2>
          </div>

          {insightsLoading ? (
            <div className="db-loading-row">
              <div className="db-skeleton-card" />
              <div className="db-skeleton-card" />
              <div className="db-skeleton-card" />
            </div>
          ) : allInsights.length === 0 ? (
            <div className="db-empty-state">
              <div className="db-empty-icon">✅</div>
              <div className="db-empty-title">All systems healthy</div>
              <div className="db-empty-sub">
                No anomalies detected. Click "Run Agent" to analyse your latest data.
              </div>
            </div>
          ) : (
            <div className="anomaly-grid">
              {allInsights.map((insight, i) => (
                <AnomalyCard key={insight.id || i} insight={insight} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── FLOATING CHAT BUTTON ── */}
      {!chatOpen && (
        <button className="fab-chat-btn" onClick={() => { setChatOpen(true); }}>
          <span className="fab-chat-icon">⚡</span>
          <span>Chat with AI</span>
        </button>
      )}

      {/* ── CHAT PANEL ── */}
      {chatOpen && (
        <TamboProvider
          key={merchantId}
          apiKey={TAMBO_API_KEY}
          userKey={`d2c-${merchantId}`}
          components={tamboComponents}
          tools={tamboTools}
          autoGenerateThreadName={true}
          contextHelpers={contextHelpers}
        >
          <ChatPanel
            merchantId={merchantId}
            onClose={() => { setChatOpen(false); }}
          />
        </TamboProvider>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Dashboard export — wraps with auth guard
   ══════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { merchant, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading-shell">
        <div className="auth-loading-card">
          <div className="auth-loading-kicker">D2C AI Employee</div>
          <div className="auth-loading-title">Loading your dashboard</div>
          <div className="auth-loading-copy">Fetching merchant data…</div>
        </div>
      </div>
    );
  }

  if (!merchant) return null;

  return <DashboardInner />;
}
