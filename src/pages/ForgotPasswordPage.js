import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "../lib/authClient";
import "./AccountPages.css";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // Better Auth emails a reset link that lands on /reset-password?token=...
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result?.error) {
        setError(result.error.message || "Could not send the reset email.");
        return;
      }
      setSent(true);
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct-page acct-narrow">
      <div className="acct-card">
        <h1 className="acct-title">Reset your password</h1>
        <p className="acct-subtitle">
          Enter your email and we'll send you a link to choose a new password.
        </p>

        {error && <div className="acct-error">{error}</div>}
        {sent ? (
          <div className="acct-notice">
            If an account exists for {email}, a reset link is on its way. Check your inbox.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="acct-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <button className="acct-btn" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <div className="acct-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
