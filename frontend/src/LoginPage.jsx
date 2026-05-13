import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login({ email, password });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Unable to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <div className="auth-page-grid">
        <section className="auth-hero">
          <div className="auth-hero-badge">D2C AI Employee</div>
          <h1>Merchant intelligence that ships with your data.</h1>
          <p>
            Sign in to see revenue, delivery, payment, and ad signals in one merchant-scoped workspace.
          </p>
        </section>

        <section className="auth-card">
          <div className="auth-card-header">
            <h2>Log in</h2>
            <p>Use your merchant account to continue.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="merchant@brand.com"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
              />
            </label>

            {error ? <div className="auth-error">{error}</div> : null}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="auth-card-footer">
            <span>New merchant?</span>
            <Link to="/register">Create an account</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
