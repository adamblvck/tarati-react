/**
 * The node dnd-kit measures.
 *
 * dnd-kit subtracts any movement of the node handed to `setNodeRef` back out of
 * the drag (`nodeRectDelta`, DndContext), on the assumption that a rect only
 * moves because the page reflowed under it. An SVG container's client rect is
 * the union of its children, so pointing that ref at anything holding the piece
 * makes the drag feed back into itself. Measured in the running app before this
 * was fixed: 80px of travel produced 57.9px of feedback, and the piece flickered
 * between two positions for as long as it was held.
 *
 * jsdom lays nothing out, so the oscillation itself cannot be reproduced here.
 * The invariant that prevents it can, and it is the whole fix: whatever dnd-kit
 * is handed must contain nothing that the drag moves.
 */

import React from 'react';
import { render } from '@testing-library/react';
import Board from '../Board';
import AI from '../../AI';
import { gameBoard } from '../../GameBoard';

// `mock`-prefixed so the jest.mock factory may close over it.
const mockDragNodes = new Map();

jest.mock('@dnd-kit/core', () => {
    const actual = jest.requireActual('@dnd-kit/core');
    return {
        ...actual,
        useDraggable: (args) => {
            const result = actual.useDraggable(args);
            return {
                ...result,
                setNodeRef: (node) => {
                    if (node) mockDragNodes.set(args.id, node);
                    result.setNodeRef(node);
                },
            };
        },
    };
});

// Same stubs as BoardMotion: jsdom has neither, and Board measures with both.
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

beforeEach(() => mockDragNodes.clear());

const W = { color: 'WHITE', isUpgraded: false };
const B = { color: 'BLACK', isUpgraded: false };

const renderBoard = () =>
    render(
        <Board
            gameState={{
                checkers: { C1: { ...W }, C2: { ...W }, C7: { ...B }, C8: { ...B } },
                currentTurn: 'WHITE',
            }}
            gameBoard={gameBoard}
            isValidMove={(state, from, to) => AI.isLegalMove(state, from, to)}
            applyMove={() => {}}
            vWidth={76.6667}
            boardSize={500}
        />
    );

describe('the node dnd-kit measures', () => {
    test('every cell hands dnd-kit its hit circle, not the group holding the piece', () => {
        renderBoard();
        expect(mockDragNodes.size).toBe(gameBoard.vertices.length);
        for (const [id, node] of mockDragNodes) {
            expect(`${id} is a ${node.tagName}`).toBe(`${id} is a circle`);
            expect(`${id}: ${node.classList.contains('cell-hit')}`).toBe(`${id}: true`);
        }
    });

    test('nothing the drag moves is inside the measured node', () => {
        renderBoard();
        for (const [id, node] of mockDragNodes) {
            // .cell-visual carries the drag transform. Inside the measured node it
            // drags the measured rect along with it, and dnd-kit compensates the
            // drag away. A circle has no children at all, which is the point.
            expect(`${id}: ${node.querySelectorAll('.cell-visual').length}`).toBe(`${id}: 0`);
            expect(`${id}: ${node.childElementCount}`).toBe(`${id}: 0`);
        }
    });

    test('the moving group and the measured node are siblings, never nested', () => {
        const { container } = renderBoard();
        const cells = [...container.querySelectorAll('.cell')];
        expect(cells).toHaveLength(gameBoard.vertices.length);
        for (const cell of cells) {
            const hit = cell.querySelector('.cell-hit');
            const visual = cell.querySelector('.cell-visual');
            expect(hit.contains(visual)).toBe(false);
            expect(visual.contains(hit)).toBe(false);
        }
    });
});
