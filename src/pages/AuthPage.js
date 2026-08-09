import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { authClient } from "../lib/authClient";
import "./AccountPages.css";

// Combined login / signup screen. `mode` is "login" or "signup".
const AuthPage = ({ mode = "login" }) => {
  const isSignup = mode === "signup";
  const navigate = useNavigate();
  const location = useLocation();
  const dest = location.state?.from?.pathname || "/multiplayer";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const callbackURL = `${window.location.origin}${dest}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (isSignup && !consent) {
      setError("Please accept the privacy policy to create an account.");
      return;
    }
    setBusy(true);
    try {
      const result = isSignup
        ? await authClient.signUp.email({ name, email, password, callbackURL })
        : await authClient.signIn.email({ email, password, callbackURL });

      if (result?.error) {
        setError(result.error.message || "Something went wrong. Please try again.");
        return;
      }
      // The session store is populated asynchronously. Navigating before it
      // settles lets RequireAuth see an anonymous user and bounce a
      // just-created account straight back to /login, which looks exactly like
      // "signup is broken".
      await authClient.getSession();
      navigate(dest, { replace: true });
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Social login is only wired when the API has Google credentials. Without
  // this flag the button renders but does nothing: better-auth *returns*
  // {error} rather than throwing, so the catch below never fires and a visitor
  // just taps a dead button.
  const googleEnabled = process.env.REACT_APP_GOOGLE_ENABLED === "true";

  const handleGoogle = async () => {
    setError(null);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL });
      if (result?.error) {
        setError(result.error.message || "Google sign-in is unavailable right now.");
      }
    } catch (err) {
      setError("Could not start Google sign-in.");
    }
  };

  return (
    <div className="acct-page acct-narrow">
      <div className="acct-card">
        <h1 className="acct-title">{isSignup ? "Create your account" : "Welcome back"}</h1>
        <p className="acct-subtitle">
          {isSignup
            ? "Play Tarati online against friends and save your games."
            : "Sign in to play online and review your games."}
        </p>

        {error && <div className="acct-error">{error}</div>}
        {notice && <div className="acct-notice">{notice}</div>}

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div className="acct-field">
              <label htmlFor="name">Display name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

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

          <div className="acct-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
          </div>

          {isSignup && (
            <label className="acct-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I agree to the <Link to="/privacy">privacy policy</Link> and to Tarati storing my
                account and game data.
              </span>
            </label>
          )}

          <button className="acct-btn" type="submit" disabled={busy}>
            {busy ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="acct-divider">or</div>
            <button className="acct-btn google" onClick={handleGoogle} type="button">
              Continue with Google
            </button>
          </>
        )}

        <div className="acct-links">
          {isSignup ? (
            <Link to="/login">Already have an account? Sign in</Link>
          ) : (
            <>
              <Link to="/signup">Create an account</Link>
              <Link to="/forgot-password">Forgot password?</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
