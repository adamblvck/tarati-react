import React from "react";
import { Link } from "react-router-dom";
import "./AccountPages.css";

// Baseline GDPR privacy notice. Review with counsel before production launch.
const PrivacyPolicyPage = () => (
  <div className="acct-page">
    <div className="acct-card acct-prose">
      <h1 className="acct-title">Privacy Policy</h1>
      <p className="acct-muted">Tarati online multiplayer — how we handle your data.</p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details</strong>: your email address and display name. If you sign in with
          Google, we receive your email, name and profile image from Google.
        </li>
        <li>
          <strong>Authentication data</strong>: a securely hashed password (email sign-ups only) and
          session tokens needed to keep you signed in.
        </li>
        <li>
          <strong>Game data</strong>: the games you create or join, the moves played, results, and
          timestamps — stored so you and your opponent can review completed games.
        </li>
      </ul>

      <h2>Why we process it (lawful basis)</h2>
      <ul>
        <li>To provide the service you asked for — accounts, matchmaking and replays (contract).</li>
        <li>To keep the service secure and prevent abuse (legitimate interests).</li>
      </ul>

      <h2>Where your data lives</h2>
      <p>
        Data is stored in the EU on Scaleway infrastructure (Amsterdam region). Transactional emails
        (verification and password reset) are sent via Scaleway Transactional Email in the EU.
      </p>

      <h2>Sub-processors</h2>
      <ul>
        <li>Scaleway (EU hosting, database, serverless functions, transactional email).</li>
        <li>Google (only if you choose "Continue with Google" for authentication).</li>
      </ul>

      <h2>Retention</h2>
      <p>
        We keep your account and game data until you delete your account. When you delete your
        account, your profile and credentials are removed and your name is detached from any shared
        games so your opponents keep their own replays.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access and export all of your data, and permanently delete your account, at any time
        from <Link to="/settings">Settings</Link>. You also have the right to rectification and to
        lodge a complaint with your data protection authority.
      </p>

      <h2>Cookies</h2>
      <p>
        We use a single strictly-necessary cookie to keep you signed in. We don't use advertising or
        tracking cookies.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about your data? Email <a href="mailto:adam@blvckstudios.com">adam@blvckstudios.com</a>.
      </p>
    </div>
  </div>
);

export default PrivacyPolicyPage;
