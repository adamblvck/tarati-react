// Deterministic game lines, regenerated from the vendored engine rather than
// pasted in as magic constants — so if the rules ever change, these fail loudly
// at generation instead of drifting into meaningless assertions.
//
// Each line is a random-legal-move self-play run under a seeded xorshift. The
// seeds below were found by scanning; they are the *inputs*, not the answers.

import AI from "../../src/lib/engine/AI.js";
import { applyMoveToBoard } from "../../src/lib/engine/GameBoard.js";

export const initialState = () => ({
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
});

const flip = (c) => (c === "WHITE" ? "BLACK" : "WHITE");

export const step = (s, from, to) => ({
  ...applyMoveToBoard(s, from, to),
  currentTurn: flip(s.currentTurn),
});

// Must match api/src/lib/engine.ts canonicalKey exactly, or the threefold line
// would end on a different ply than the server thinks.
const canonicalKey = (s) =>
  Object.keys(s.checkers)
    .sort()
    .map((v) => `${v}:${s.checkers[v].color[0]}${s.checkers[v].isUpgraded ? "+" : ""}`)
    .join(",") +
  "|" +
  s.currentTurn;

function generate(seed, { stopAtPromotionOnly = false, maxPly = 400 } = {}) {
  let rs = seed >>> 0;
  const rnd = () => {
    rs ^= rs << 13; rs >>>= 0;
    rs ^= rs >>> 17;
    rs ^= rs << 5; rs >>>= 0;
    return rs / 4294967296;
  };

  let s = initialState();
  const moves = [];
  const keys = [canonicalKey(s)];
  const seen = new Map([[keys[0], 1]]);

  for (let ply = 0; ply < maxPly; ply++) {
    const legal = AI.getAllPossibleMoves(s);
    if (!legal.length) {
      return { moves, outcome: "no_legal_moves", winner: flip(s.currentTurn), final: s };
    }
    if (stopAtPromotionOnly && legal.every((m) => m.from === m.to)) {
      return {
        moves,
        outcome: "promotion_only",
        promotions: legal.map((m) => m.from),
        final: s,
      };
    }

    const m = legal[Math.floor(rnd() * legal.length)];
    const mover = s.currentTurn;
    s = step(s, m.from, m.to);
    moves.push({ from: m.from, to: m.to });

    const k = canonicalKey(s);
    keys.push(k);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n >= 3) return { moves, outcome: "threefold", winner: "DRAW", final: s };

    if (AI.isGameOver(s)) {
      const oppCount = Object.values(s.checkers).filter((c) => c.color === flip(mover)).length;
      return {
        moves,
        outcome: oppCount === 0 ? "total_conversion" : "no_legal_moves",
        winner: mover,
        final: s,
      };
    }
  }
  throw new Error(`line seed ${seed} did not terminate within ${maxPly} plies`);
}

export const LINES = {
  /** 70 plies -> BLACK wins, White wiped out entirely. */
  totalConversion: () => generate(8),
  /** 18 plies -> BLACK wins with White still holding pieces but unable to move. */
  noLegalMoves: () => generate(29),
  /** 76 plies -> draw by threefold repetition. */
  threefold: () => generate(304),
  /** 65 plies -> the side to move has ONLY an in-place §6.3 promotion (D1). */
  promotionOnly: () => generate(7, { stopAtPromotionOnly: true }),
};
