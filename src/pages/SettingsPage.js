import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authClient } from "../lib/authClient";
import { deleteAccount, exportAccount, listMyGames } from "../lib/gamesApi";
import "./AccountPages.css";

const badgeClass = (game) => {
  if (game.status !== "finished") return "";
  if (game.winner === "DRAW") return "draw";
  if (!game.yourColor) return "";
  return game.winner === game.yourColor ? "win" : "loss";
};

const statusLabel = (game) => {
  if (game.status === "waiting") return "waiting";
  if (game.status === "active") return "in progress";
  if (game.status === "aborted") return "aborted";
  if (game.winner === "DRAW") return "draw";
  if (!game.yourColor) return `${game.winner} won`;
  return game.winner === game.yourColor ? "won" : "lost";
};

const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialTab = params.get("tab") === "replays" ? "replays" : "account";

  const [tab, setTab] = useState(initialTab);
  const [games, setGames] = useState([]);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab !== "replays") return;
    listMyGames().then(
      (res) => setGames(res.games || []),
      () => setError("Could not load your games.")
    );
  }, [tab]);

  const handleExport = async () => {
    setError(null);
    try {
      const data = await exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tarati-account-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Could not export your data.");
    }
  };

  const handleDelete = async () => {
    setError(null);
    if (confirmText !== "DELETE") {
      setError('Type DELETE to confirm.');
      return;
    }
    setBusy(true);
    try {
      await deleteAccount();
      await authClient.signOut();
      navigate("/", { replace: true });
    } catch (err) {
      setError("Could not delete your account.");
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate("/", { replace: true });
  };

  return (
    <div className="acct-page">
      <h1 className="acct-title">Settings</h1>

      <div className="settings-tabs">
        <button className={`settings-tab ${tab === "account" ? "active" : ""}`} onClick={() => setTab("account")}>
          Account
        </button>
        <button className={`settings-tab ${tab === "replays" ? "active" : ""}`} onClick={() => setTab("replays")}>
          Replays
        </button>
      </div>

      {error && <div className="acct-error">{error}</div>}

      {tab === "account" && (
        <div className="acct-card">
          <h2 className="acct-title" style={{ fontSize: 18 }}>
            {user?.name || "Your account"}
          </h2>
          <p className="acct-subtitle">
            {user?.email} {user?.emailVerified ? "· verified" : "· not verified"}
          </p>

          <button className="acct-btn secondary" onClick={handleSignOut} type="button">
            Sign out
          </button>

          <div className="acct-divider">your data (GDPR)</div>
          <p className="acct-muted" style={{ marginBottom: 12 }}>
            Download everything we store about you, or permanently delete your account. Deleting keeps
            finished games playable for your opponents but removes your name from them.
          </p>
          <button className="acct-btn secondary" onClick={handleExport} type="button" style={{ marginBottom: 18 }}>
            Export my data (JSON)
          </button>

          <div className="acct-field">
            <label htmlFor="confirm-delete">Type DELETE to permanently remove your account</label>
            <input
              id="confirm-delete"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </div>
          <button
            className="acct-btn danger"
            onClick={handleDelete}
            type="button"
            disabled={busy || confirmText !== "DELETE"}
          >
            Delete my account
          </button>
        </div>
      )}

      {tab === "replays" && (
        <div className="acct-card">
          <h2 className="acct-title" style={{ fontSize: 18 }}>
            Your games
          </h2>
          {games.length === 0 ? (
            <p className="acct-muted">
              No games yet. <Link to="/multiplayer">Start one →</Link>
            </p>
          ) : (
            <ul className="replay-list">
              {games.map((g) => {
                const opponent =
                  g.yourColor === "WHITE"
                    ? g.players?.black?.name
                    : g.players?.white?.name;
                const clickable = g.status === "finished" || g.moveCount > 0;
                const row = (
                  <>
                    <div className="meta" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <strong>{g.name}</strong>
                      <span className="acct-muted">
                        vs {opponent || "—"} · {g.moveCount} moves
                      </span>
                    </div>
                    <span className={`badge ${badgeClass(g)}`}>{statusLabel(g)}</span>
                  </>
                );
                return clickable ? (
                  <Link key={g.id} className="replay-row" to={`/replay/${g.id}`}>
                    {row}
                  </Link>
                ) : (
                  <li key={g.id} className="replay-row" style={{ cursor: "default" }}>
                    {row}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
