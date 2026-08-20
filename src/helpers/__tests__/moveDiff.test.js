/**
 * Move derivation.
 *
 * This is the only new logic on the multiplayer path — online, the opponent's
 * move arrives as a whole new board with no record of what was played, and the
 * animation depends entirely on recovering it. So it is proved against the
 * engine itself rather than against a handful of hand-written cases: play a few
 * hundred random games and check that diffing consecutive positions recovers
 * exactly the move that produced them, every ply.
 */

import AI from '../../AI';
import { applyMoveToBoard } from '../../GameBoard';
import { diffMove } from '../moveDiff';

const W = { color: 'WHITE', isUpgraded: false };
const B = { color: 'BLACK', isUpgraded: false };

const initial = () => ({
    checkers: {
        C1: { ...W }, C2: { ...W }, D1: { ...W }, D2: { ...W },
        C7: { ...B }, C8: { ...B }, D3: { ...B }, D4: { ...B },
    },
    currentTurn: 'WHITE',
});

const flip = (turn) => (turn === 'WHITE' ? 'BLACK' : 'WHITE');

describe('diffMove', () => {
    test('recovers every move of 300 random games', () => {
        let seed = 20260817;
        const rnd = () => {
            seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
            return (seed >>> 0) / 4294967296;
        };

        const unexplained = [];
        let plies = 0;
        let promotions = 0;
        let strikes = 0;

        for (let game = 0; game < 300; game += 1) {
            let state = initial();
            for (let ply = 0; ply < 120; ply += 1) {
                const moves = AI.getAllPossibleMoves(state);
                if (moves.length === 0) break;
                const move = moves[Math.floor(rnd() * moves.length)];

                const applied = applyMoveToBoard(state, move.from, move.to);
                const next = { ...applied, currentTurn: flip(state.currentTurn) };

                const derived = diffMove(state, next);
                plies += 1;
                if (!derived || derived.from !== move.from || derived.to !== move.to) {
                    unexplained.push({
                        game, ply,
                        played: `${move.from}-${move.to}`,
                        derived: derived ? `${derived.from}-${derived.to}` : 'null',
                    });
                } else {
                    if (derived.promotion) promotions += 1;
                    if (derived.struck.length) strikes += 1;
                }
                state = next;
            }
        }

        expect(unexplained.slice(0, 5)).toEqual([]);
        expect(unexplained).toHaveLength(0);
        // Guard against the loop quietly exercising nothing.
        expect(plies).toBeGreaterThan(1000);
        expect(strikes).toBeGreaterThan(0);
        expect(promotions).toBeGreaterThan(0);
    });

    test('reports exactly the pieces that changed hands', () => {
        // C1 is not adjacent to B2, so arriving at B1 takes it (§4.1).
        const before = {
            checkers: { C1: { color: 'WHITE', isUpgraded: true }, B2: { ...B } },
            currentTurn: 'WHITE',
        };
        const applied = applyMoveToBoard(before, 'C1', 'B1');
        const after = { ...applied, currentTurn: 'BLACK' };

        const derived = diffMove(before, after);
        expect(derived).toMatchObject({ from: 'C1', to: 'B1', promotion: false });
        expect(derived.struck).toEqual(['B2']);
    });

    test('recognises the in-place promotion as a ply with nothing to slide', () => {
        // White's cob on D3 is dead; with no ordinary move it promotes in place.
        const before = { checkers: { D3: { ...W }, C1: { ...B } }, currentTurn: 'WHITE' };
        const applied = applyMoveToBoard(before, 'D3', 'D3');
        const after = { ...applied, currentTurn: 'BLACK' };

        expect(diffMove(before, after)).toEqual({
            from: 'D3', to: 'D3', struck: [], promotion: true,
        });
    });

    test('refuses to guess when more than one ply has passed', () => {
        // Two moves at once — what a stalled poll or a jump to the end of a
        // replay looks like. Better to snap than to invent a path.
        let state = initial();
        const first = applyMoveToBoard(state, 'C2', 'B1');
        const mid = { ...first, currentTurn: 'BLACK' };
        const second = applyMoveToBoard(mid, 'C8', 'C9');
        const after = { ...second, currentTurn: 'WHITE' };

        expect(diffMove(state, after)).toBeNull();
    });

    test('returns null when nothing changed', () => {
        // Online polling hands the board a fresh object every 2.5s whether or
        // not anything happened.
        const state = initial();
        expect(diffMove(state, JSON.parse(JSON.stringify(state)))).toBeNull();
    });

    test('tolerates missing states', () => {
        expect(diffMove(null, initial())).toBeNull();
        expect(diffMove(initial(), null)).toBeNull();
        expect(diffMove(undefined, undefined)).toBeNull();
    });
});
