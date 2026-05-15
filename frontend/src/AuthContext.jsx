import { createContext, useContext, useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const AUTH_TOKEN_KEY = "d2c_ai_employee_token";
const MERCHANT_KEY = "d2c_ai_employee_merchant";
const MERCHANT_PREFS_KEY = "d2c_ai_employee_merchant_prefs";

const AuthContext = createContext(null);

async function requestJson(path, options = {}) {
  const { method = "GET", token, body } = options;
  const headers = { "Content-Type": "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.message || `Request failed with ${response.status}`);
  }

  return data;
}

function readStoredAuth() {
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY) || "";
    const merchantRaw = localStorage.getItem(MERCHANT_KEY);
    const merchant = merchantRaw ? JSON.parse(merchantRaw) : null;
    const prefsRaw = localStorage.getItem(MERCHANT_PREFS_KEY);
    const prefs = prefsRaw ? JSON.parse(prefsRaw) : {};
    if (merchant?.merchant_id && prefs[merchant.merchant_id]) {
      return {
        token,
        merchant: {
          ...merchant,
          ...prefs[merchant.merchant_id],
          settings: {
            ...(merchant.settings || {}),
            ...(prefs[merchant.merchant_id].settings || {}),
          },
        },
      };
    }
    return { token, merchant };
  } catch {
    return { token: "", merchant: null };
  }
}

function readMerchantPrefs() {
  try {
    const raw = localStorage.getItem(MERCHANT_PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistMerchantPrefs(merchantId, prefs) {
  if (!merchantId) return;
  const allPrefs = readMerchantPrefs();
  allPrefs[merchantId] = {
    ...(allPrefs[merchantId] || {}),
    ...prefs,
    settings: {
      ...((allPrefs[merchantId] || {}).settings || {}),
      ...(prefs.settings || {}),
    },
  };
  localStorage.setItem(MERCHANT_PREFS_KEY, JSON.stringify(allPrefs));
}

function mergeMerchantPrefs(merchant) {
  if (!merchant?.merchant_id) return merchant;
  const prefs = readMerchantPrefs()[merchant.merchant_id];
  if (!prefs) return merchant;
  return {
    ...merchant,
    ...prefs,
    settings: {
      ...(merchant.settings || {}),
      ...(prefs.settings || {}),
    },
  };
}

function persistAuth(token, merchant) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  if (merchant) {
    localStorage.setItem(MERCHANT_KEY, JSON.stringify(merchant));
  } else {
    localStorage.removeItem(MERCHANT_KEY);
  }
}

export function AuthProvider({ children }) {
  const [stored] = useState(() => readStoredAuth());
  const storedToken = stored.token;
  const [token, setToken] = useState(stored.token);
  const [merchant, setMerchant] = useState(stored.merchant);
  const [user, setUser] = useState(stored.merchant);
  const [loading, setLoading] = useState(Boolean(stored.token));

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const profile = await requestJson("/auth/me", { token: storedToken });
        if (!active) return;
        setToken(storedToken);
        const mergedProfile = mergeMerchantPrefs(profile);
        setMerchant(mergedProfile);
        setUser(mergedProfile);
        persistAuth(storedToken, mergedProfile);
      } catch {
        if (!active) return;
        setToken("");
        setMerchant(null);
        setUser(null);
        persistAuth("", null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    hydrateSession();
    return () => {
      active = false;
    };
  }, [storedToken]);

  const login = async ({ email, password }) => {
    const response = await requestJson("/auth/login", {
      method: "POST",
      body: { email, password },
    });

    const nextToken = response.access_token || "";
    const profile = nextToken ? await requestJson("/auth/me", { token: nextToken }) : null;
    const nextMerchant = mergeMerchantPrefs(profile || {
      merchant_id: response.merchant_id,
      email: response.email,
      name: response.name,
    });

    setToken(nextToken);
    setMerchant(nextMerchant);
    setUser(nextMerchant);
    persistAuth(nextToken, nextMerchant);

    return { token: nextToken, merchant: nextMerchant, response };
  };

  const register = async (payload) => {
    return requestJson("/auth/register", {
      method: "POST",
      body: payload,
    });
  };

  const logout = () => {
    setToken("");
    setMerchant(null);
    setUser(null);
    persistAuth("", null);
  };

  const authFetch = async (path, options = {}) => {
    if (!token) {
      throw new Error("Not authenticated");
    }

    return requestJson(path, { ...options, token });
  };

  const value = {
    token,
    merchant,
    user,
    loading,
    login,
    register,
    logout,
    authFetch,
    refreshSession: async () => {
      if (!token) return null;
      const profile = await requestJson("/auth/me", { token });
      const mergedProfile = mergeMerchantPrefs(profile);
      setMerchant(mergedProfile);
      setUser(mergedProfile);
      persistAuth(token, mergedProfile);
      return mergedProfile;
    },
    saveMerchantPreferences: (merchantId, prefs) => {
      persistMerchantPrefs(merchantId, prefs);
      setMerchant((current) => (current?.merchant_id === merchantId ? mergeMerchantPrefs(current) : current));
      setUser((current) => (current?.merchant_id === merchantId ? mergeMerchantPrefs(current) : current));
      if (token && merchantId && merchantId === stored.merchant?.merchant_id) {
        const merged = mergeMerchantPrefs(stored.merchant || {});
        persistAuth(token, merged);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
