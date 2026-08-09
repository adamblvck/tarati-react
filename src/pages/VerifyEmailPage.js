import React, { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "../lib/authClient";
import { useAuth } from "../context/AuthContext";
import "./AccountPages.css";

// Landing page for email verification. Better Auth verifies the token on the
// API side and redirects the browser here (or to the app), so this mostly
// confirms status and offers a resend for anyone still unverified.
const VerifyEmailPage = () => {
  const { user } = useAuth();
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const resend = async () => {
    setError(null);
    if (!user?.email) {
      setError("Sign in first, then request a new verification email.");
      return;
    }
    try {
      await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: `${window.location.origin}/verify-email`,
      });
      setNotice("Verification email sent. Check your inbox.");
    } catch (err) {
      setError("Could not send the verification email.");
    }
  };

  return (
    <div className="acct-page acct-narrow">
      <div className="acct-card">
        <h1 className="acct-title">Email verification</h1>
        {user?.emailVerified ? (
          <div className="acct-notice">Your email is verified. You're all set.</div>
        ) : (
          <p className="acct-subtitle">
            If you just clicked the link in your email, you're verified. Otherwise you can request a
            new verification email below.
          </p>
        )}
        {notice && <div className="acct-notice">{notice}</div>}
        {error && <div className="acct-error">{error}</div>}

        {!user?.emailVerified && (
          <button className="acct-btn secondary" onClick={resend} type="button">
            Resend verification email
          </button>
        )}

        <div className="acct-links">
          <Link to="/multiplayer">Go to multiplayer</Link>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
