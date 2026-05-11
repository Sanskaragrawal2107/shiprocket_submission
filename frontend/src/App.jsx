/**
 * D2C AI Employee — Main Application
 *
 * Features:
 * - Sidebar with branding, navigation, and connection status
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

/* ══════════════════════════════════════════════════════════
   Sidebar Component
   ══════════════════════════════════════════════════════════ */
function Sidebar({ onSuggestion }) {
  const navItems = [
    { icon: "💬", label: "Chat", active: true },
    { icon: "📊", label: "Revenue" },
    { icon: "📦", label: "Orders" },
    { icon: "🚚", label: "Deliveries" },
    { icon: "💳", label: "Payments" },
    { icon: "📈", label: "Ads" },
    { icon: "🧠", label: "Insights" },
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

      {/* Navigation */}
      <div className="sidebar-section">
        <div className="sidebar-section-title">Dashboard</div>
        {navItems.map((item, i) => (
          <div
            key={i}
            className={`sidebar-nav-item ${item.active ? "active" : ""}`}
            onClick={() => {
              if (item.label !== "Chat") {
                onSuggestion(`Show me ${item.label.toLowerCase()} data`);
              }
            }}
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
          onClick={() => onSuggestion("Sync all data for merchant_001")}
        >
          <span className="sidebar-nav-icon">🔄</span>
          Sync Data
        </div>
        <div
          className="sidebar-nav-item"
          onClick={() =>
            onSuggestion("Run agent analysis for merchant_001")
          }
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
function WelcomeScreen({ onSuggestion }) {
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
        Your AI-powered business intelligence assistant. Ask anything about your
        Shopify orders, Shiprocket deliveries, Razorpay payments, or Meta Ads —
        with every number cited back to its source.
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
function ChatInterface() {
  const {
    messages,
    isStreaming,
    isWaiting,
    isIdle,
    currentThreadId,
    startNewThread,
  } = useTambo();

  const { value, setValue, submit, isPending } = useTamboThreadInput();

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle suggestion from sidebar/welcome
  useEffect(() => {
    const handler = (e) => {
      setValue(e.detail);
      // Auto-submit after a tick
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
  }, [setValue, submit]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!value.trim() || isPending) return;
    try {
      await submit();
    } catch (err) {
      console.error("Submit error:", err);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const fireSuggestion = (text) => {
    window.dispatchEvent(
      new CustomEvent("tambo-suggestion", { detail: text })
    );
  };

  const hasMessages = messages && messages.length > 0;

  return (
    <div className="app-container">
      <Sidebar onSuggestion={fireSuggestion} />

      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <span className="main-header-title">
            {currentThreadId ? "Conversation" : "New Chat"}
          </span>
          <div className="main-header-actions">
            <button className="btn btn-ghost btn-sm" onClick={startNewThread}>
              + New Chat
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="chat-area">
          {!hasMessages ? (
            <WelcomeScreen onSuggestion={fireSuggestion} />
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
                            {block.statusMessage ||
                              `Running ${block.name}...`}
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
                placeholder="Ask about revenue, orders, deliveries, payments, or ads..."
                disabled={isPending || isStreaming}
                rows={1}
              />
              <button
                type="submit"
                className="chat-send-btn"
                disabled={!value.trim() || isPending || isStreaming}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <div className="chat-input-hint">
              Press Enter to send · Shift+Enter for new line · Powered by Tambo
              AI
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   App Root — wraps everything in TamboProvider
   ══════════════════════════════════════════════════════════ */
export default function App() {
  return (
    <TamboProvider
      apiKey={TAMBO_API_KEY}
      userKey="d2c-user-local"
      components={tamboComponents}
      tools={tamboTools}
      autoGenerateThreadName={true}
      autoGenerateNameThreshold={2}
      contextHelpers={{
        systemBehavior: () => ({
          key: "systemBehavior",
          value: `You are the D2C AI Employee — a proactive business intelligence assistant for D2C brands.

CRITICAL RULES (always follow):
1. NEVER ask the user for merchant ID or date range. ALWAYS default to merchant_001 and last 7 days.
2. ALWAYS render a UI component immediately in response to any business query. Do not respond with only text when a component exists for that topic.
3. When user asks about revenue/sales → render RevenueCard immediately.
4. When user asks about orders → render OrdersChart immediately.
5. When user asks about deliveries/shipping/RTO → render DeliveryTracker immediately.
6. When user asks about payments/transactions/refunds → render PaymentLedger immediately.
7. When user asks about ads/ROAS/campaigns → render AdsDashboard immediately.
8. When user asks about insights/alerts/anomalies → render InsightsList immediately.
9. When user asks for cross-channel or trends → render CrossChannelChart immediately.
10. When user asks about health/overview/dashboard → render HealthScore immediately.
11. If sync is requested → call syncMerchant tool with merchant_001, then confirm success.
12. If analysis/agent is requested → call runAgent tool with merchant_001.
13. Populate components with realistic demo data if live data isn't available yet.
14. Be concise. One short sentence max before rendering the component.`,
        }),
        merchantContext: () => ({
          key: "merchantContext",
          value: "Default merchant: merchant_001. Backend: http://localhost:8000.",
        }),
      }}
    >
      <ChatInterface />
    </TamboProvider>
  );
}
