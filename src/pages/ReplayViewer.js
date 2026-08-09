import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { gameBoard, applyMoveToBoard } from "../GameBoard";
import { useBoardSize } from "../hooks/useBoardSize";
import Board from "../components/Board";
import { getReplay, resultText } from "../lib/gamesApi";
import "./GamePage.css";
import "./AccountPages.css";

const flip = (color) => (color === "WHITE" ? "BLACK" : "WHITE");
const noop = () => {};
const never = () => false;

const ReplayViewer = () => {
  const { gameId } = useParams();
  const [replay, setReplay] = useState(null);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);

  const boardRef = useRef(null);
  const { boardSize, vWidth } = useBoardSize(boardRef);

  useEffect(() => {
    getReplay(gameId).then(
      (res) => {
        setReplay(res);
        setIndex(res.moves.length); // start at the final position
      },
      (err) => setError(err.status === 403 ? "You can't view this game." : "Replay not found.")
    );
  }, [gameId]);

  // Reconstruct every position by replaying [from,to] through the engine.
  const states = useMemo(() => {
    if (!replay) return [];
    const list = [replay.start];
    let cur = replay.start;
    for (const m of replay.moves) {
      const applied = applyMoveToBoard(cur, m.from, m.to);
      cur = { ...applied, currentTurn: flip(cur.currentTurn) };
      list.push(cur);
    }
    return list;
  }, [replay]);

  if (error) {
    return (
      <div className="acct-page acct-narrow">
        <div className="acct-card">
          <div className="acct-error">{error}</div>
          <Link className="acct-btn secondary" to="/settings?tab=replays">
            Back to replays
          </Link>
        </div>
      </div>
    );
  }

  if (!replay) {
    return (
      <div className="acct-page">
        <p className="acct-muted">Loading replay…</p>
      </div>
    );
  }

  const { game, moves } = replay;
  const current = states[index] || replay.start;
  const players = game.players || {};

  return (
    <div className="game-page">
      <div className="game-layout">
        <div className="online-panel">
          <h2 style={{ margin: 0, color: "#fff" }}>{game.name}</h2>
          <div className="acct-muted">
            {players.white?.name || "—"} (White) vs {players.black?.name || "—"} (Black)
          </div>
          {game.status === "finished" && (
            <div className="acct-notice">{resultText(game, game.yourColor)}</div>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            <button className="acct-btn secondary auto" onClick={() => setIndex(0)} disabled={index === 0}>
              First
            </button>
            <button
              className="acct-btn secondary auto"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="acct-btn secondary auto"
              onClick={() => setIndex((i) => Math.min(moves.length, i + 1))}
              disabled={index >= moves.length}
            >
              <ChevronRight size={16} />
            </button>
            <button
              className="acct-btn secondary auto"
              onClick={() => setIndex(moves.length)}
              disabled={index >= moves.length}
            >
              Last
            </button>
          </div>
          <div className="acct-muted">
            Move {index} of {moves.length}
          </div>

          <div className="move-sheet" style={{ maxHeight: 320, overflowY: "auto" }}>
            {moves.map((m, i) => (
              <button
                key={i}
                className={`acct-btn secondary auto ${index === i + 1 ? "active" : ""}`}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 4,
                  opacity: index === i + 1 ? 1 : 0.7,
                }}
                onClick={() => setIndex(i + 1)}
              >
                {i + 1}. {m.color === "WHITE" ? "○" : "●"} {m.from}–{m.to}
              </button>
            ))}
          </div>

          <Link className="acct-btn secondary" to="/settings?tab=replays">
            Back to replays
          </Link>
        </div>

        <div className="game-area dark-mode">
          <div style={{ height: 20 }} />
          <Board
            ref={boardRef}
            boardSize={boardSize}
            vWidth={vWidth}
            gameState={current}
            gameBoard={gameBoard}
            isValidMove={never}
            applyMove={noop}
            ApplyMoveAI={noop}
          />
        </div>
      </div>
    </div>
  );
};

export default ReplayViewer;
