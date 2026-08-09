import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "../lib/authClient";
import "./AccountPages.css";

const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      setError("This reset link is invalid or has expired. Request a new one.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result?.error) {
        setError(result.error.message || "Could not reset the password. The link may have expired.");
        return;
      }
      navigate("/login", { replace: true });
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct-page acct-narrow">
      <div className="acct-card">
        <h1 className="acct-title">Choose a new password</h1>
        <p className="acct-subtitle">Enter a new password for your account.</p>

        {error && <div className="acct-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="acct-field">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="acct-field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <button className="acct-btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Reset password"}
          </button>
        </form>

        <div className="acct-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
