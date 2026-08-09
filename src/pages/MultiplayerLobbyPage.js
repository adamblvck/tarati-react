import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createGame, joinByCode, joinById, listOpenGames } from "../lib/gamesApi";
import "./AccountPages.css";

const MultiplayerLobbyPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [color, setColor] = useState("random");
  const [code, setCode] = useState("");
  const [openGames, setOpenGames] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const goToGame = useCallback((game) => navigate(`/play/online/${game.id}`), [navigate]);

  const refreshOpen = useCallback(async () => {
    try {
      const res = await listOpenGames();
      setOpenGames(res.games || []);
    } catch (err) {
      // Non-fatal: leave the list empty.
    }
  }, []);

  const handleJoinByCode = useCallback(
    async (rawCode) => {
      setError(null);
      setBusy(true);
      try {
        const res = await joinByCode(rawCode.trim().toUpperCase());
        goToGame(res.game);
      } catch (err) {
        setError(
          err.status === 404
            ? "No game found for that code."
            : err.status === 409
            ? "That game can't be joined."
            : "Could not join the game."
        );
      } finally {
        setBusy(false);
      }
    },
    [goToGame]
  );

  // Auto-join when arriving via an invite link (?join=CODE).
  useEffect(() => {
    const joinCode = searchParams.get("join");
    if (joinCode) handleJoinByCode(joinCode);
  }, [searchParams, handleJoinByCode]);

  useEffect(() => {
    refreshOpen();
    const t = setInterval(refreshOpen, 5000);
    return () => clearInterval(t);
  }, [refreshOpen]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await createGame({ name: name.trim() || "Tarati game", visibility, color });
      goToGame(res.game);
    } catch (err) {
      setError("Could not create the game.");
    } finally {
      setBusy(false);
    }
  };

  const handleJoinOpen = async (id) => {
    setError(null);
    setBusy(true);
    try {
      const res = await joinById(id);
      goToGame(res.game);
    } catch (err) {
      setError("Could not join that game.");
      refreshOpen();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="acct-page">
      <h1 className="acct-title">Multiplayer</h1>
      <p className="acct-subtitle">
        Create a game and invite a friend, or join an open game.{" "}
        <Link to="/watch">Watch every live game →</Link>
      </p>
      {error && <div className="acct-error">{error}</div>}

      <div className="lobby-grid">
        {/* Create */}
        <div className="acct-card">
          <h2 className="acct-title" style={{ fontSize: 18 }}>
            New game
          </h2>
          <form onSubmit={handleCreate}>
            <div className="acct-field">
              <label htmlFor="game-name">Game name</label>
              <input
                id="game-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Friday night Tarati"
                maxLength={80}
              />
            </div>

            <div className="acct-field">
              <label>Visibility</label>
              <div className="color-choice">
                <button
                  type="button"
                  className={visibility === "private" ? "active" : ""}
                  onClick={() => setVisibility("private")}
                >
                  Private (invite only)
                </button>
                <button
                  type="button"
                  className={visibility === "public" ? "active" : ""}
                  onClick={() => setVisibility("public")}
                >
                  Public (lobby)
                </button>
              </div>
            </div>

            <div className="acct-field">
              <label>Play as</label>
              <div className="color-choice">
                {["random", "WHITE", "BLACK"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={color === c ? "active" : ""}
                    onClick={() => setColor(c)}
                  >
                    {c === "random" ? "Random" : c === "WHITE" ? "White" : "Black"}
                  </button>
                ))}
              </div>
            </div>

            <button className="acct-btn" type="submit" disabled={busy}>
              Create game
            </button>
          </form>

          <div className="acct-divider">or join by code</div>
          <div className="acct-field">
            <label htmlFor="join-code">Invite code</label>
            <input
              id="join-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={12}
            />
          </div>
          <button
            className="acct-btn secondary"
            type="button"
            disabled={busy || code.trim().length < 3}
            onClick={() => handleJoinByCode(code)}
          >
            Join game
          </button>
        </div>

        {/* Public lobby */}
        <div className="acct-card">
          <h2 className="acct-title" style={{ fontSize: 18 }}>
            Open games
          </h2>
          {openGames.length === 0 ? (
            <p className="acct-muted">No open games right now. Create one and share the code!</p>
          ) : (
            <ul className="lobby-list">
              {openGames.map((g) => (
                <li key={g.id} className="lobby-item">
                  <div className="meta">
                    <strong>{g.name}</strong>
                    <span>
                      by {g.createdBy?.name || "Player"} · you'd play {g.openColor}
                    </span>
                  </div>
                  <button
                    className="acct-btn secondary auto"
                    disabled={busy}
                    onClick={() => handleJoinOpen(g.id)}
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiplayerLobbyPage;
