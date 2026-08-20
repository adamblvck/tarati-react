/**
 * Board geometry.
 *
 * The patent's first claim about the board: "All lines are of equal length —
 * stopping points are equally spaced from all adjacent stopping points." The
 * layout used to miss that by 12.9%, so this pins it. `strategy/guide/figures.py`
 * mirrors the same formula for the print booklet and must stay in step.
 */

import { gameBoard } from '../../GameBoard';
import Data from '../position';

const V_WIDTH = (500 - 2 * 20) / 6;   // the canonical size, from MiniBoard
const DIMS = { w: 500 / 1.2, h: 500 };

const at = (vertexId, flip = false) => Data.getPosition(vertexId, DIMS, V_WIDTH, flip);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('board geometry', () => {
    test('all 42 pathways are exactly one vWidth long', () => {
        const wrong = [];
        for (const [a, b] of gameBoard.edges) {
            const length = distance(at(a), at(b));
            if (Math.abs(length - V_WIDTH) > 1e-6) {
                wrong.push(`${a}-${b} is ${(length / V_WIDTH).toFixed(4)} vWidth`);
            }
        }
        expect(wrong).toEqual([]);
    });

    test('non-adjacent points are never closer than adjacent ones', () => {
        const edgeSet = new Set();
        for (const [a, b] of gameBoard.edges) {
            edgeSet.add(`${a}|${b}`);
            edgeSet.add(`${b}|${a}`);
        }
        const tooClose = [];
        for (const a of gameBoard.vertices) {
            for (const b of gameBoard.vertices) {
                if (a === b || edgeSet.has(`${a}|${b}`)) continue;
                if (distance(at(a), at(b)) < V_WIDTH - 1e-6) tooClose.push(`${a}~${b}`);
            }
        }
        expect(tooClose).toEqual([]);
    });

    test('the layout matches the board own 180° rotation', () => {
        // A1 fixed, Bi -> B(i+3), Ci -> C(i+6), D1<->D3, D2<->D4.
        const rotation = { A1: 'A1', D1: 'D3', D2: 'D4', D3: 'D1', D4: 'D2' };
        for (let i = 1; i <= 6; i += 1) rotation[`B${i}`] = `B${((i - 1 + 3) % 6) + 1}`;
        for (let i = 1; i <= 12; i += 1) rotation[`C${i}`] = `C${((i - 1 + 6) % 12) + 1}`;

        for (const vertexId of gameBoard.vertices) {
            const here = at(vertexId);
            const opposite = at(rotation[vertexId]);
            expect(opposite.x).toBeCloseTo(DIMS.w - here.x, 6);
            expect(opposite.y).toBeCloseTo(DIMS.h - here.y, 6);
        }
    });

    test('White home sits at the bottom, and flipping swaps the ends', () => {
        expect(at('D1').y).toBeGreaterThan(DIMS.h / 2);
        expect(at('D3').y).toBeLessThan(DIMS.h / 2);

        expect(at('D1', true).y).toBeLessThan(DIMS.h / 2);
        expect(at('D3', true).y).toBeGreaterThan(DIMS.h / 2);
    });

    test('flipping is an involution', () => {
        for (const vertexId of gameBoard.vertices) {
            const once = at(vertexId, true);
            const twice = {
                x: 2 * (DIMS.w / 2) - once.x,
                y: 2 * (DIMS.h / 2) - once.y,
            };
            expect(twice.x).toBeCloseTo(at(vertexId).x, 6);
            expect(twice.y).toBeCloseTo(at(vertexId).y, 6);
        }
    });

    test('the layout scales with vWidth', () => {
        // The old radius added an absolute pixel constant, so the board's
        // proportions drifted with size. Every distance must now be linear.
        const small = Data.getPosition('C1', DIMS, 10);
        const large = Data.getPosition('C1', DIMS, 20);
        const centre = { x: DIMS.w / 2, y: DIMS.h / 2 };
        expect(distance(centre, large)).toBeCloseTo(2 * distance(centre, small), 6);
    });
});
