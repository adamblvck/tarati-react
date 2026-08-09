import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Data from "../helpers/position";
import { gameBoard } from "../GameBoard";
import { listLiveGames, getSpectateGame, resultText } from "../lib/gamesApi";
import "./SpectatePage.css";

// Read from across a room, so this polls a little slower than a player's board
// and never blocks the view on a spinner after the first paint.
const POLL_MS = 2500;

const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A static, non-interactive board.
 *
 * Deliberately not the shared `Board` component: that one carries a DndContext,
 * a fixed-position turn indicator and drag sensors, none of which make sense
 * with a dozen boards on one screen. The geometry comes from the same
 * `GameBoard` data, so what's drawn is identical.
 */
const MiniBoard = ({ state, size = 260 }) => {
  const aspect = 1.2;
  const w = size / aspect;
  const vWidth = size / 9;
  const dims = { w, h: size };

  return (
    <svg viewBox={`0 0 ${w} ${size}`} className="spec-board" role="img" aria-label="Tarati board">
      {gameBoard.edges.map(([from, to], i) => {
        const a = Data.getPosition(from, dims, vWidth);
        const b = Data.getPosition(to, dims, vWidth);
        return (
          <line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="spec-edge" />
        );
      })}
      {gameBoard.vertices.map((v) => {
        const p = Data.getPosition(v, dims, vWidth);
        return <circle key={`v${v}`} cx={p.x} cy={p.y} r={vWidth / 7} className="spec-vertex" />;
      })}
      {Object.entries(state.checkers).map(([v, c]) => {
        const p = Data.getPosition(v, dims, vWidth);
        return (
          <g key={`c${v}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={vWidth / 2.6}
              className={`spec-piece ${c.color === "WHITE" ? "is-white" : "is-black"}`}
            />
            {c.isUpgraded && (
              <circle
                cx={p.x}
                cy={p.y}
                r={vWidth / 5}
                className={`spec-rok ${c.color === "WHITE" ? "is-white" : "is-black"}`}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};

const PlayerRow = ({ color, name, isTurn, live }) => (
  <div className={`spec-player ${isTurn && live ? "is-turn" : ""}`}>
    <span className={`spec-dot ${color === "WHITE" ? "is-white" : "is-black"}`} />
    <span className="spec-name">{name || "—"}</span>
    {isTurn && live && <span className="spec-turn-tag">to move</span>}
  </div>
);

const GameCard = ({ game, skewMs, boardSize, focusable = true }) => {
  const live = game.status === "active";
  const remaining =
    live && game.turnDeadline ? Date.parse(game.turnDeadline) - Date.now() - skewMs : null;
  const expired = remaining !== null && remaining <= 0;

  const body = (
    <>
      <div className="spec-card-head">
        <span className="spec-title">{game.name}</span>
        {live ? (
          expired ? (
            <span className="spec-badge is-expired">time up</span>
          ) : (
            <span className="spec-badge is-live">{fmtClock(remaining)}</span>
          )
        ) : (
          <span className="spec-badge is-done">final</span>
        )}
      </div>

      <MiniBoard state={game.boardState} size={boardSize} />

      <div className="spec-players">
        <PlayerRow
          color="WHITE"
          name={game.players.white}
          isTurn={game.currentTurn === "WHITE"}
          live={live}
        />
        <PlayerRow
          color="BLACK"
          name={game.players.black}
          isTurn={game.currentTurn === "BLACK"}
          live={live}
        />
      </div>

      <div className="spec-foot">
        <span>{game.moveCount === 1 ? "1 move" : `${game.moveCount} moves`}</span>
        {!live && <span className="spec-result">{resultText(game, null)}</span>}
      </div>
    </>
  );

  if (!focusable) return <div className="spec-card">{body}</div>;
  return (
    <Link className="spec-card" to={`/watch/${game.id}`}>
      {body}
    </Link>
  );
};

/** The wall: every live game at once, for a projector. */
export const SpectateWallPage = () => {
  const [games, setGames] = useState(null);
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await listLiveGames();
      // Clocks are rendered from the server's own notion of "now", so a
      // projector machine with a wrong system clock still counts down right.
      skewRef.current = Date.now() - Date.parse(res.serverTime);
      setGames(res.games);
      setError(null);
    } catch (err) {
      setError(
        err.status === 404
          ? "Spectator mode is switched off."
          : "Could not reach the server."
      );
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Drive the countdowns between polls.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const liveCount = useMemo(
    () => (games || []).filter((g) => g.status === "active").length,
    [games]
  );

  // Fewer, bigger boards when the wall is quiet; smaller as it fills up.
  const boardSize = !games || games.length <= 2 ? 380 : games.length <= 6 ? 300 : 240;

  return (
    <div className="spec-page">
      <header className="spec-header">
        <h1>Tarati — live games</h1>
        <div className="spec-stats">
          {error ? (
            <span className="spec-error">{error}</span>
          ) : games === null ? (
            <span>connecting…</span>
          ) : (
            <span>
              {liveCount} in play · {games.length} shown
            </span>
          )}
        </div>
      </header>

      {games !== null && games.length === 0 && !error && (
        <div className="spec-empty">
          <p>No games yet.</p>
          <p className="spec-empty-sub">
            Start one at <strong>tarati.blvckstudios.com</strong> and it appears here.
          </p>
        </div>
      )}

      <div className="spec-grid">
        {(games || []).map((g) => (
          <GameCard key={g.id} game={g} skewMs={skewRef.current} boardSize={boardSize} />
        ))}
      </div>
    </div>
  );
};

/** One game, large — for when a crowd gathers around a single match. */
export const SpectateGamePage = () => {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);
  const skewRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await getSpectateGame(gameId);
      skewRef.current = Date.now() - Date.parse(res.serverTime);
      setGame(res.game);
      setError(null);
    } catch (err) {
      setError(err.status === 404 ? "That game isn't available to watch." : "Could not reach the server.");
    }
  }, [gameId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="spec-page">
      <header className="spec-header">
        <Link className="spec-back" to="/watch">
          ← all games
        </Link>
        <h1>{game ? game.name : "Watching"}</h1>
        <div className="spec-stats">{error && <span className="spec-error">{error}</span>}</div>
      </header>
      {game && (
        <div className="spec-solo">
          <GameCard game={game} skewMs={skewRef.current} boardSize={620} focusable={false} />
        </div>
      )}
    </div>
  );
};

export default SpectateWallPage;
