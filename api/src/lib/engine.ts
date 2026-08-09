// Typed server-side facade over the vendored pure Tarati engine.
// All authoritative move validation / application goes through here.

import AIDefault from "./engine/AI.js";
import { applyMoveToBoard } from "./engine/GameBoard.js";

export type Color = "WHITE" | "BLACK";
export interface Checker {
  color: Color;
  isUpgraded: boolean;
}
export type Checkers = Record<string, Checker>;
export interface GameState {
  checkers: Checkers;
  currentTurn: Color;
}
export interface Move {
  from: string;
  to: string;
}

// The vendored engine is untyped JS; describe the surface we rely on.
interface EngineApi {
  getAllPossibleMoves: (state: GameState) => Array<{ from: string; to: string; isPromotion?: boolean }>;
  isValidMove: (state: GameState, from: string, to: string) => boolean;
  isGameOver: (state: GameState) => boolean;
  checkThreefoldRepetition: (keys: unknown[]) => boolean;
  checkFiftyMoveRule: (flags: boolean[]) => boolean;
}

const AI = AIDefault as unknown as EngineApi;

export function initialGameState(): GameState {
  return {
    checkers: {
      C1: { color: "WHITE", isUpgraded: false },
      C2: { color: "WHITE", isUpgraded: false },
      D1: { color: "WHITE", isUpgraded: false },
      D2: { color: "WHITE", isUpgraded: false },
      C7: { color: "BLACK", isUpgraded: false },
      C8: { color: "BLACK", isUpgraded: false },
      D3: { color: "BLACK", isUpgraded: false },
      D4: { color: "BLACK", isUpgraded: false },
    },
    currentTurn: "WHITE",
  };
}

export function opponent(color: Color): Color {
  return color === "WHITE" ? "BLACK" : "WHITE";
}

export function getLegalMoves(state: GameState): Move[] {
  return AI.getAllPossibleMoves(state).map((m) => ({ from: m.from, to: m.to }));
}

export function isMoveLegal(state: GameState, from: string, to: string): boolean {
  // Dead-piece promotion (from === to) is legal but excluded by isValidMove's
  // edge check, so consult the full legal-move set which includes it.
  return getLegalMoves(state).some((m) => m.from === from && m.to === to);
}

// Applies the rules (strikes/promotions) AND advances the turn — mirrors the
// client's applyMove seam in GamePage.js.
export function applyMove(prev: GameState, from: string, to: string): GameState {
  const nextBoard = applyMoveToBoard(prev, from, to) as GameState;
  return {
    ...nextBoard,
    currentTurn: opponent(prev.currentTurn),
  };
}

export function isGameOver(state: GameState): boolean {
  return AI.isGameOver(state);
}

// True if the piece that moved from `from` was a (non-upgraded) cob — used for
// the 50-move rule flags, matching the client's wasCobMove logic.
export function wasCobMove(prev: GameState, from: string): boolean {
  const piece = prev.checkers[from];
  return Boolean(piece && !piece.isUpgraded);
}

export function checkThreefoldRepetition(positionKeys: string[]): boolean {
  return AI.checkThreefoldRepetition(positionKeys);
}

export function checkFiftyMoveRule(cobMovedFlags: boolean[]): boolean {
  return AI.checkFiftyMoveRule(cobMovedFlags);
}

// Deterministic, language-agnostic position key for repetition detection.
// (We do NOT ship the engine's Zobrist hash — JS 32-bit vs Python 64-bit differ.)
export function canonicalKey(state: GameState): string {
  const parts = Object.keys(state.checkers)
    .sort()
    .map((v) => {
      const c = state.checkers[v];
      return `${v}:${c.color[0]}${c.isUpgraded ? "+" : ""}`;
    });
  return `${parts.join(",")}|${state.currentTurn}`;
}
