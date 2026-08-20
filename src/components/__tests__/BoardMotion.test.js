/**
 * Board motion.
 *
 * The animation itself is CSS — a transition on the slide, keyframes on the
 * turn — so what has to be right is the *state the board hands the browser*:
 * an arriving piece must be offset back to where it came from on the frame it
 * appears and released immediately after, and a struck piece must be marked as
 * turning, faces the right way up, with the delay that lets the mover land.
 *
 * All of that is assertable without a rendering browser, which matters more
 * than it sounds: the first attempt at verifying this drove a real page that
 * turned out to be a hidden tab, painting no frames at all.
 */

import React, { useLayoutEffect } from 'react';
import { act, render } from '@testing-library/react';
import Board from '../Board';
import AI from '../../AI';
import { gameBoard, applyMoveToBoard } from '../../GameBoard';
import { STRIKE_DELAY_MS } from '../../config/motionConfig';

// jsdom implements neither, and Board measures with both. `getScreenCTM` is how
// the board converts dnd-kit's client pixels into viewBox units; a scale of 1 is
// the right answer for a test that never lays anything out.
beforeAll(() => {
    global.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    if (!SVGSVGElement.prototype.getScreenCTM) {
        SVGSVGElement.prototype.getScreenCTM = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    }
});

const V_WIDTH = 76.6667;
const W = { color: 'WHITE', isUpgraded: false };
const B = { color: 'BLACK', isUpgraded: false };

const play = (state, from, to, turn = 'BLACK') => ({
    ...applyMoveToBoard(state, from, to),
    currentTurn: turn,
});

/** Inline styles of the slide groups currently carrying an entry offset. */
const offsets = (container) =>
    [...container.querySelectorAll('.piece-slide')]
        .map((g) => g.getAttribute('style') || '')
        .filter((style) => /transform: translate\(/.test(style));

/**
 * Renders the board and lets a caller snapshot the DOM from a layout effect.
 *
 * The entry offset exists only between the commit and the passive effect that
 * releases it, and `act` flushes both before returning — so it cannot be read
 * afterwards. A layout effect runs in between, which is the one moment the
 * browser would also see it.
 */
const Harness = ({ state, onCommit }) => {
    useLayoutEffect(() => { onCommit(); });
    return (
        <Board
            gameState={state}
            gameBoard={gameBoard}
            isValidMove={(s, f, t) => AI.isLegalMove(s, f, t)}
            applyMove={() => {}}
            vWidth={V_WIDTH}
            boardSize={500}
        />
    );
};

const renderBoard = (state) => {
    const result = render(<Harness state={state} onCommit={() => {}} />);
    /** Re-render, returning whatever was on screen mid-commit. */
    const move = (next) => {
        let captured;
        act(() => {
            result.rerender(
                <Harness
                    state={next}
                    onCommit={() => {
                        if (captured === undefined) captured = offsets(result.container)[0] ?? null;
                    }}
                />
            );
        });
        return captured ?? null;
    };
    return { ...result, move };
};

describe('board motion', () => {
    test('an arriving piece is offset back to the point it came from, then released', () => {
        const before = {
            checkers: { C1: { ...W }, C2: { ...W }, C7: { ...B }, C8: { ...B } },
            currentTurn: 'WHITE',
        };
        const { container, move } = renderBoard(before);
        expect(offsets(container)).toHaveLength(0);

        const atCommit = move(play(before, 'C1', 'B1'));

        // Displaced on the frame it appears — what the transition runs from.
        expect(atCommit).toMatch(/transform: translate\(-?[\d.]+px, -?[\d.]+px\)/);
        expect(atCommit).toMatch(/transition: none/);
        // …and released once effects have run, so the browser transitions home.
        expect(offsets(container)).toHaveLength(0);
    });

    test('the offset is exactly the pathway the piece travelled', () => {
        const before = { checkers: { C1: { ...W }, C7: { ...B } }, currentTurn: 'WHITE' };
        const { move } = renderBoard(before);

        const atCommit = move(play(before, 'C1', 'B1'));
        const [, dx, dy] = atCommit.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/);
        // Every pathway is one vWidth long, so the displacement must be too.
        expect(Math.hypot(+dx, +dy)).toBeCloseTo(V_WIDTH, 2);
    });

    test('a struck piece turns over, with the delay that lets the mover land', () => {
        // C1 is not adjacent to B2, so arriving at B1 takes it (§4.1).
        const before = {
            checkers: { C1: { color: 'WHITE', isUpgraded: true }, B2: { ...B }, C7: { ...B } },
            currentTurn: 'WHITE',
        };
        const { container, move } = renderBoard(before);
        expect(container.querySelectorAll('.piece-turn.is-turning')).toHaveLength(0);

        move(play(before, 'C1', 'B1'));

        const turning = [...container.querySelectorAll('.piece-turn.is-turning')];
        expect(turning).toHaveLength(1);
        expect(turning[0].getAttribute('style')).toContain(`animation-delay: ${STRIKE_DELAY_MS}ms`);
        // White side up now; the black face is the one going away.
        expect(turning[0].querySelector('.piece.is-white')).toHaveClass('is-face-up');
        expect(turning[0].querySelector('.piece.is-black')).toHaveClass('is-face-down');
    });

    test('a quiet move turns nothing over', () => {
        const before = { checkers: { C1: { ...W }, C7: { ...B } }, currentTurn: 'WHITE' };
        const { container, move } = renderBoard(before);
        move(play(before, 'C1', 'C12'));
        expect(container.querySelectorAll('.piece-turn.is-turning')).toHaveLength(0);
    });

    test('a jump of several plies snaps rather than inventing a path', () => {
        // What an undo, a replay scrubbed to the end, or a stalled poll looks
        // like: no single move to show, so nothing should travel.
        const before = {
            checkers: { C1: { ...W }, C2: { ...W }, C7: { ...B }, C8: { ...B } },
            currentTurn: 'WHITE',
        };
        const { move } = renderBoard(before);
        const first = play(before, 'C1', 'B1');
        const second = play(first, 'C8', 'C9', 'WHITE');
        expect(move(second)).toBeNull();
    });

    test('an unchanged board is not treated as a move', () => {
        // Online polling hands the board a fresh object every 2.5s whether or
        // not anything happened.
        const state = { checkers: { C1: { ...W }, C7: { ...B } }, currentTurn: 'WHITE' };
        const { move } = renderBoard(state);
        expect(move(JSON.parse(JSON.stringify(state)))).toBeNull();
    });

    test('nothing is ever left stranded between points', () => {
        // The failure that started all this: a piece parked a fraction of a
        // pathway from its point, forever. Play a run of moves and check the
        // board is clean after each.
        let state = {
            checkers: {
                C1: { ...W }, C2: { ...W }, D1: { ...W }, D2: { ...W },
                C7: { ...B }, C8: { ...B }, D3: { ...B }, D4: { ...B },
            },
            currentTurn: 'WHITE',
        };
        const { container, move } = renderBoard(state);

        let seed = 7;
        const rnd = () => {
            seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
            return (seed >>> 0) / 4294967296;
        };

        let plies = 0;
        for (let i = 0; i < 30; i += 1) {
            const moves = AI.getAllPossibleMoves(state);
            if (!moves.length) break;
            const m = moves[Math.floor(rnd() * moves.length)];
            state = play(state, m.from, m.to, state.currentTurn === 'WHITE' ? 'BLACK' : 'WHITE');
            move(state);
            expect(offsets(container)).toHaveLength(0);
            plies += 1;
        }
        expect(plies).toBeGreaterThan(20);
    });
});
