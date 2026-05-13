import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import Dashboard from "./Dashboard";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading-shell">
        <div className="auth-loading-card">
          <div className="auth-loading-kicker">D2C AI Employee</div>
          <div className="auth-loading-title">Checking session</div>
          <div className="auth-loading-copy">Restoring your merchant workspace.</div>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function PublicRoute({ children }) {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading-shell">
        <div className="auth-loading-card">
          <div className="auth-loading-kicker">D2C AI Employee</div>
          <div className="auth-loading-title">Loading</div>
          <div className="auth-loading-copy">One moment while we verify your session.</div>
        </div>
      </div>
    );
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function RouteIndex() {
  const { token } = useAuth();
  return <Navigate to={token ? "/dashboard" : "/login"} replace />;
}

export default function Root() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RouteIndex />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
