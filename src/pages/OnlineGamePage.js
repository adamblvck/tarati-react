import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import AI from "../AI";
import { gameBoard, applyMoveToBoard } from "../GameBoard";
import { useBoardSize } from "../hooks/useBoardSize";
import Board from "../components/Board";
import { API_CONFIG } from "../config/apiConfig";
import {
  abortGame,
  getGameState,
  joinByCode,
  postMove,
  resignGame,
  resultText,
} from "../lib/gamesApi";
import "./GamePage.css";
import "./AccountPages.css";

const flip = (color) => (color === "WHITE" ? "BLACK" : "WHITE");

// "600s" reads like a stopwatch; people think in minutes.
const fmtTimeout = (seconds) => {
  if (!seconds) return "the time limit";
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return m === 1 ? "1 minute" : `${m} minutes`;
  }
  return `${seconds} seconds`;
};

const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

const OnlineGamePage = () => {
  const { gameId } = useParams();
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get("code");
  const navigate = useNavigate();

  const [game, setGame] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  // Ref mirror of `pending`: the poll interval closes over a stale `pending`,
  // but a ref is always current.
  const pendingRef = useRef(false);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);

  const boardRef = useRef(null);
  const { boardSize, vWidth } = useBoardSize(boardRef);

  // --- load + poll ---------------------------------------------------------

  const load = useCallback(async () => {
    // A poll that was already in flight when a move was submitted would
    // otherwise resolve afterwards and write the pre-move board back over the
    // optimistic update — the piece visibly snaps back.
    if (pendingRef.current) return;
    try {
      const res = await getGameState(gameId);
      // Responses can also arrive out of order. moveCount only ever grows, so
      // it's a free monotonic clock: never accept an older view of the game.
      setGame((prev) =>
        prev && res.game.moveCount < prev.moveCount ? prev : res.game
      );
      setError(null);
    } catch (err) {
      // Invite link: not a participant yet, but we have a code — join then load.
      if (err.status === 403 && inviteCode) {
        try {
          const joined = await joinByCode(inviteCode);
          setGame(joined.game);
          setError(null);
          return;
        } catch (joinErr) {
          setError("This invite can't be used (the game may be full or over).");
          return;
        }
      }
      setError(
        err.status === 404
          ? "Game not found."
          : err.status === 403
          ? "You don't have access to this game."
          : "Could not load the game."
      );
    }
  }, [gameId, inviteCode]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!game) return undefined;
    if (game.status !== "active" && game.status !== "waiting") return undefined;
    const t = setInterval(load, API_CONFIG.pollIntervalMs);
    return () => clearInterval(t);
    // Keyed on status, not the whole game: every poll replaces `game` with a
    // fresh object, which would tear down and rebuild the interval on each
    // response and make the real cadence drift with latency.
  }, [game?.status, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drive the countdown display.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  // --- derived -------------------------------------------------------------

  const myColor = game?.yourColor ?? null;
  const isMyTurn = game?.status === "active" && myColor === game.currentTurn;

  const clock = useMemo(() => {
    if (!game || game.status !== "active" || !game.turnDeadline || !game.serverTime) return null;
    return {
      remainingMs: Date.parse(game.turnDeadline) - Date.parse(game.serverTime),
      receiptLocal: Date.now(),
    };
  }, [game]);

  const remainingMs = clock ? Math.max(0, clock.remainingMs - (Date.now() - clock.receiptLocal)) : null;

  // --- move handling -------------------------------------------------------

  // isLegalMove, not isValidMove: the latter is the §3 predicate and rejects
  // the §6.3 in-place promotion, which the server accepts.
  const wrappedIsValidMove = useCallback(
    (state, from, to) => isMyTurn && !pending && AI.isLegalMove(state, from, to),
    [isMyTurn, pending]
  );

  // Non-empty only when the player has no ordinary move at all.
  const promotions = useMemo(
    () =>
      game?.status === "active" && isMyTurn && !pending
        ? AI.getPromotionMoves(game.boardState)
        : [],
    [game, isMyTurn, pending]
  );

  const handleMove = useCallback(
    async (from, to) => {
      if (!game || !isMyTurn || pending) return;
      const board = game.boardState;
      const plyToSend = game.moveCount;

      // Optimistic local apply for instant feedback.
      const applied = applyMoveToBoard(board, from, to);
      const optimistic = { ...applied, currentTurn: flip(board.currentTurn) };
      setGame((g) => ({ ...g, boardState: optimistic, currentTurn: optimistic.currentTurn }));
      pendingRef.current = true;
      setPending(true);
      try {
        const res = await postMove(gameId, { from, to, ply: plyToSend });
        setGame(res.game);
      } catch (err) {
        // Reconcile with the authoritative state on any rejection.
        if (err.data?.game) setGame(err.data.game);
        else await load();
        if (err.status === 422) setError("That move isn't legal.");
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [game, isMyTurn, pending, gameId, load]
  );

  const handleResign = async () => {
    if (!window.confirm("Resign this game?")) return;
    try {
      const res = await resignGame(gameId);
      setGame(res.game);
    } catch (err) {
      await load();
    }
  };

  const handleAbort = async () => {
    try {
      await abortGame(gameId);
      navigate("/multiplayer");
    } catch (err) {
      await load();
    }
  };

  const copyInvite = () => {
    const link = `${window.location.origin}/play/online/${gameId}?code=${game.joinCode}`;
    navigator.clipboard?.writeText(link).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {}
    );
  };

  // --- render --------------------------------------------------------------

  if (error && !game) {
    return (
      <div className="acct-page acct-narrow">
        <div className="acct-card">
          <div className="acct-error">{error}</div>
          <Link className="acct-btn secondary" to="/multiplayer">
            Back to multiplayer
          </Link>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="acct-page">
        <p className="acct-muted">Loading game…</p>
      </div>
    );
  }

  const players = game.players || { white: null, black: null };
  const nameFor = (c) => (c === "WHITE" ? players.white?.name : players.black?.name) || "—";
  const finished = game.status === "finished";
  const isDraw = game.winner === "DRAW";
  const result = resultText(game, myColor);

  return (
    <div className="game-page online-game">
      {finished && (
        <div className="game-over-modal-overlay" role="dialog" aria-modal="true">
          <div className={`game-over-modal ${isDraw ? "game-over-draw" : ""}`}>
            <h2>{isDraw ? "Draw" : "Game Over"}</h2>
            <p>{result}</p>
            <div className="game-over-actions">
              <Link className="acct-btn auto" to={`/replay/${gameId}`}>
                View replay
              </Link>
              <Link className="acct-btn secondary auto" to="/multiplayer">
                Back to lobby
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="game-layout">
        <div className="online-panel">
          <h2 style={{ margin: 0, color: "#fff" }}>{game.name}</h2>
          {error && <div className="acct-error">{error}</div>}

          {game.status === "waiting" && (
            <div className="invite-box">
              <div className="acct-muted">Waiting for an opponent to join…</div>
              <div className="invite-code">{game.joinCode}</div>
              <button className="acct-btn secondary" onClick={copyInvite} type="button">
                {copied ? "Link copied!" : "Copy invite link"}
              </button>
            </div>
          )}

          <div className="online-players">
            {["WHITE", "BLACK"].map((c) => (
              <div
                key={c}
                className={`online-player ${game.status === "active" && game.currentTurn === c ? "active-turn" : ""}`}
              >
                <span className={`dot ${c.toLowerCase()}`} />
                <span>
                  {nameFor(c)} {myColor === c ? "(you)" : ""}
                </span>
                {game.status === "active" && game.currentTurn === c && remainingMs !== null && (
                  <span className={`online-clock ${remainingMs < 15000 ? "low" : ""}`}>
                    {fmtClock(remainingMs)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {game.status === "active" && (
            <div className="acct-muted">
              {isMyTurn ? "Your move." : "Waiting for opponent…"} A player who doesn't move within{" "}
              {fmtTimeout(game.turnTimeoutSeconds)} forfeits.
            </div>
          )}

          {game.status === "active" && (
            <button className="acct-btn danger" onClick={handleResign} type="button">
              Resign
            </button>
          )}
          {game.status === "waiting" && (
            <button className="acct-btn secondary" onClick={handleAbort} type="button">
              Cancel game
            </button>
          )}
          {finished && (
            <Link className="acct-btn secondary" to="/multiplayer">
              Back to multiplayer
            </Link>
          )}
        </div>

        <div className="game-area dark-mode">
          <div style={{ height: 20 }} />
          <Board
            ref={boardRef}
            boardSize={boardSize}
            vWidth={vWidth}
            gameState={game.boardState}
            gameBoard={gameBoard}
            isValidMove={wrappedIsValidMove}
            applyMove={handleMove}
            promotions={promotions}
            flipped={myColor === "BLACK"}
            ApplyMoveAI={AI.ApplyMoveAI}
          />
        </div>
      </div>
    </div>
  );
};

export default OnlineGamePage;
