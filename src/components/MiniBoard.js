// components/MiniBoard.js
// A compact, static SVG rendering of the Tarati board for illustrations.
// Accepts a checkers map and optional highlights/arrows for rule explanations.

import React from 'react';
import { gameBoard } from '../GameBoard';
import Data from '../helpers/position';
import './MiniBoard.css';

// Use the exact same sizing formula as the main game board:
// vWidth = (boardSize - 2*PADDING) / 6, aspect = 1.2
const BOARD_SIZE = 500;
const PADDING = 20;
const ASPECT = 1.2;
const V_WIDTH = (BOARD_SIZE - 2 * PADDING) / 6;
const VB_W = BOARD_SIZE / ASPECT;
const VB_H = BOARD_SIZE;

const MiniBoard = ({
  checkers = {},
  highlightVertices = [],
  highlightEdges = [],
  arrows = [],
  arrowsAlt = [],
  size = 260,
  label,
}) => {
  const getPos = (id) => Data.getPosition(id, { w: VB_W, h: VB_H }, V_WIDTH);

  // Maintain aspect ratio: width = size * (VB_W / VB_H)
  const displayW = size * (VB_W / VB_H);
  const displayH = size;
  const checkerRadius = V_WIDTH / 6;

  return (
    <div className="mini-board-wrapper" style={{ width: displayW }}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={displayW}
        height={displayH}
        className="mini-board-svg"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#c0392b" />
          </marker>
          <marker
            id="arrowhead-alt"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#2c3e50" />
          </marker>
        </defs>

        {/* Edges */}
        {gameBoard.edges.map(([from, to], i) => {
          const fp = getPos(from);
          const tp = getPos(to);
          const isHighlighted = highlightEdges.some(
            ([a, b]) =>
              (a === from && b === to) || (a === to && b === from)
          );
          return (
            <line
              key={`e-${i}`}
              x1={fp.x} y1={fp.y}
              x2={tp.x} y2={tp.y}
              stroke={isHighlighted ? '#e74c3c' : '#aaa'}
              strokeWidth={isHighlighted ? 2.5 : 1.5}
              opacity={isHighlighted ? 1 : 0.7}
            />
          );
        })}

        {/* Vertex dots */}
        {gameBoard.vertices.map((vid) => {
          const p = getPos(vid);
          const isHL = highlightVertices.includes(vid);
          return (
            <circle
              key={`v-${vid}`}
              cx={p.x} cy={p.y}
              r={isHL ? 6 : 4}
              fill={isHL ? '#e74c3c' : '#999'}
              opacity={isHL ? 1 : 0.8}
            />
          );
        })}

        {/* Checkers */}
        {Object.entries(checkers).map(([id, checker]) => {
          const p = getPos(id);
          return (
            <g key={`c-${id}`}>
              <circle
                cx={p.x} cy={p.y} r={checkerRadius}
                fill={checker.color === 'WHITE' ? '#fff' : '#222'}
                stroke="#333"
                strokeWidth={1.5}
              />
              {checker.isUpgraded && (
                <circle
                  cx={p.x} cy={p.y} r={checkerRadius * 0.55}
                  fill={checker.color === 'WHITE' ? '#222' : '#fff'}
                />
              )}
            </g>
          );
        })}

        {/* Arrows for move illustration (primary - red) */}
        {arrows.map(([fromId, toId], i) => {
          const fp = getPos(fromId);
          const tp = getPos(toId);
          return (
            <line
              key={`arrow-${i}`}
              x1={fp.x} y1={fp.y}
              x2={tp.x} y2={tp.y}
              stroke="#c0392b"
              strokeWidth={2.5}
              markerEnd="url(#arrowhead)"
              opacity={0.85}
            />
          );
        })}

        {/* Arrows alternate (dark blue - for second player) */}
        {arrowsAlt.map(([fromId, toId], i) => {
          const fp = getPos(fromId);
          const tp = getPos(toId);
          return (
            <line
              key={`arrow-alt-${i}`}
              x1={fp.x} y1={fp.y}
              x2={tp.x} y2={tp.y}
              stroke="#2c3e50"
              strokeWidth={2.5}
              markerEnd="url(#arrowhead-alt)"
              opacity={0.85}
            />
          );
        })}
      </svg>
      {label && <div className="mini-board-label">{label}</div>}
    </div>
  );
};

export default MiniBoard;
