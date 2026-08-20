/**
 * Board motion timings.
 *
 * Shared because the three of them have to agree: `Board` runs the springs,
 * `GamePage` holds the engine back until they have finished, and both game
 * pages hold the result back until the move that caused it has been seen. Left
 * as separate literals in three files, one of them drifts and either the engine
 * starts thinking mid-slide or the modal lands on top of the winning move.
 *
 * The numbers match the native apps, so a move reads the same on the web, on
 * iPhone and on the watch.
 */

/** A piece travelling between points. */
export const SLIDE_SPRING = { tension: 260, friction: 26 };

/** A piece being turned over. Looser, so it settles rather than stopping dead. */
export const FLIP_SPRING = { tension: 210, friction: 16 };

/** A rok's mark appearing. */
export const CROWN_SPRING = { tension: 320, friction: 18 };

/**
 * How long a strike waits for the attacker to arrive.
 *
 * Slightly less than the slide, so the turn begins as the mover lands — cause
 * and effect, rather than two unrelated events.
 */
export const STRIKE_DELAY_MS = 230;

/**
 * How long the engine waits before it starts thinking.
 *
 * Not politeness — the only window the board has to move in. `getNextBestMove`
 * runs synchronously on the main thread for up to the tier's `maxMs` (two
 * seconds on Champion), so anything still animating when it starts is frozen
 * until it returns. At the old 100ms the player's own move stopped a third of
 * the way through its slide.
 */
export const AI_THINKING_PAUSE_MS = 780;

/**
 * How long the board is given to finish the final move before the result is
 * announced over the top of it.
 *
 * A win is very often a total conversion — the most worth watching move in the
 * game — and it used to be covered by a blurred overlay in the frame it landed.
 */
export const RESULT_REVEAL_MS = 900;
