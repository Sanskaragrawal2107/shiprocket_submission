import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const EMPTY_CONNECTORS = {
  shopify_store_url: "",
  shopify_access_token: "",
  razorpay_key_id: "",
  razorpay_key_secret: "",
  shiprocket_email: "",
  shiprocket_password: "",
  meta_ads_account_id: "",
  meta_ads_access_token: "",
};

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    ...EMPTY_CONNECTORS,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await register(form);
      setMessage(response.message || "Account created successfully");
      navigate("/login", { replace: true, state: { email: form.email } });
    } catch (err) {
      setError(err.message || "Unable to register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell">
      <div className="auth-page-grid auth-page-grid-wide">
        <section className="auth-hero">
          <div className="auth-hero-badge">Merchant setup</div>
          <h1>Register your store and secure its credentials in one place.</h1>
          <p>
            The backend encrypts connector credentials and issues a merchant-scoped JWT for your workspace.
          </p>
        </section>

        <section className="auth-card auth-card-wide">
          <div className="auth-card-header">
            <h2>Create account</h2>
            <p>Add your merchant profile and optional connector credentials.</p>
          </div>

          <form className="auth-form auth-form-grid" onSubmit={handleSubmit}>
            <label>
              <span>Business name</span>
              <input type="text" value={form.name} onChange={updateField("name")} placeholder="Acme D2C" required />
            </label>

            <label>
              <span>Email</span>
              <input type="email" value={form.email} onChange={updateField("email")} placeholder="merchant@brand.com" required />
            </label>

            <label>
              <span>Password</span>
              <input type="password" value={form.password} onChange={updateField("password")} placeholder="Create a password" required />
            </label>

            <div className="auth-form-divider">Connector credentials</div>

            <label>
              <span>Shopify store URL</span>
              <input type="text" value={form.shopify_store_url} onChange={updateField("shopify_store_url")} placeholder="brand.myshopify.com" />
            </label>

            <label>
              <span>Shopify access token</span>
              <input type="password" value={form.shopify_access_token} onChange={updateField("shopify_access_token")} placeholder="shpat_..." />
            </label>

            <label>
              <span>Razorpay key ID</span>
              <input type="text" value={form.razorpay_key_id} onChange={updateField("razorpay_key_id")} placeholder="rzp_test_..." />
            </label>

            <label>
              <span>Razorpay key secret</span>
              <input type="password" value={form.razorpay_key_secret} onChange={updateField("razorpay_key_secret")} placeholder="secret" />
            </label>

            <label>
              <span>Shiprocket email</span>
              <input type="email" value={form.shiprocket_email} onChange={updateField("shiprocket_email")} placeholder="ops@brand.com" />
            </label>

            <label>
              <span>Shiprocket password</span>
              <input type="password" value={form.shiprocket_password} onChange={updateField("shiprocket_password")} placeholder="password" />
            </label>

            <label>
              <span>Meta Ads account ID</span>
              <input type="text" value={form.meta_ads_account_id} onChange={updateField("meta_ads_account_id")} placeholder="act_123456789" />
            </label>

            <label>
              <span>Meta Ads access token</span>
              <input type="password" value={form.meta_ads_access_token} onChange={updateField("meta_ads_access_token")} placeholder="EAAB..." />
            </label>

            {error ? <div className="auth-error auth-error-wide">{error}</div> : null}
            {message ? <div className="auth-success auth-success-wide">{message}</div> : null}

            <button className="auth-submit auth-submit-wide" type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <div className="auth-card-footer">
            <span>Already registered?</span>
            <Link to="/login">Log in</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
