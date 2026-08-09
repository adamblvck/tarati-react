/**
 * AI difficulty ladder — derived from measured Elo, not from search depth.
 *
 * Each profile below is one of the tiers calibrated in
 * `strategy/05_calibrate_ladder.py` (results in `strategy/data/ladder.json`):
 * a 1,680-game colour-balanced round robin over eight candidate configurations,
 * rated with a Bradley-Terry fit and bootstrap confidence intervals.
 *
 *   tier          Elo    95% CI          used as
 *   L1              0    [  -73,   71]   Easy
 *   L3            454    [  414,  500]   Medium
 *   L5            742    [  712,  782]   Hard
 *   L8          1,094    [1052, 1140]    Champion
 *
 * The adjacent gaps are 454, 288 and 352 Elo, with disjoint intervals, so the
 * four settings are genuinely different opponents.
 *
 * This replaces a ladder of 3/6/9/12 that was never measured and was wrong:
 * with the old engine, depths 12 through 20 chose the identical move in 60 of
 * 60 sampled positions, and depth 9 scored 22% against depth 6. "Champion" was
 * not stronger than "Medium".
 *
 * Two notes on the knobs:
 *
 * `temperature` is the softmax width for move choice, in centipieces (100 ==
 * one piece), and it — not `stochasticTopK` — is the diversity knob. The old
 * config softmaxed raw scores whose unit was ~100 per piece, so exp(-100) made
 * it a uniform tie-breaker that did nothing. `stochasticTopK` only bounds how
 * many root moves are sampling candidates.
 *
 * `maxMs` is a responsiveness backstop and is deliberately set well above what
 * `maxNodes` needs, so that the node budget is what binds. If `maxMs` bound
 * first the tier would stop reproducing its calibrated strength on a slow
 * device. Champion's 250k nodes measures around 450ms in the browser.
 *
 * Every profile carries a real `maxMs`. Passing `null` for both `maxMs` and
 * `maxNodes` used to send the search down a separate unbudgeted code path with
 * its own alpha-beta leak, which is part of why Easy and Medium behaved nothing
 * like their nominal depth.
 */

export const AI_DIFFICULTY_PROFILES = {
  Easy: {
    depth: 2,
    maxMs: 100,
    maxNodes: 400,
    stochasticTopK: 4,
    temperature: 160,
    blunderRate: 0.2,
    elo: 0
  },
  Medium: {
    depth: 4,
    maxMs: 250,
    maxNodes: 2500,
    stochasticTopK: 4,
    temperature: 70,
    blunderRate: 0.03,
    elo: 454
  },
  Hard: {
    depth: 6,
    maxMs: 600,
    maxNodes: 15000,
    stochasticTopK: 3,
    temperature: 20,
    blunderRate: 0,
    elo: 742
  },
  Champion: {
    depth: 12,
    maxMs: 2000,
    maxNodes: 250000,
    stochasticTopK: 1,
    temperature: 0,
    blunderRate: 0,
    elo: 1094
  }
};

export const DEFAULT_AI_DIFFICULTY = 'Medium';

export const getAiProfile = (difficulty) => {
  const profile = AI_DIFFICULTY_PROFILES[difficulty] || AI_DIFFICULTY_PROFILES[DEFAULT_AI_DIFFICULTY];
  return { ...profile };
};
