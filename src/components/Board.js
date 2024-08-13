// components/Board.js
import React, { useRef, useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import Checker from './Checker';
import './Board.css';

const PADDING = 20; // Adjustable padding

const getPosition = (vertexId, svgSize, vWidth) => {
	const centerX = svgSize / 2;
	const centerY = svgSize / 2;

	if (vertexId === 'A1') {
		return { x: centerX, y: centerY };
	}

	const [type, ...rest] = vertexId;
	const position = parseInt(rest.join(''), 10);

	switch (type) {
		case 'B':
			const angleB = (position - 1) * (Math.PI / 3);
			return {
				x: centerX + vWidth * Math.cos(angleB + Math.PI / 2),
				y: centerY + vWidth * Math.sin(angleB + Math.PI / 2)
			};
		case 'C':
			const angleC = (position - 1) * (Math.PI / 6) - Math.PI  / 12 + Math.PI / 2;
			const radiusC = vWidth * (1 + Math.sqrt(11/13)) - Math.PI  / 12 + Math.PI / 2;
			return {
				x: centerX + radiusC * Math.cos(angleC),
				y: centerY + radiusC * Math.sin(angleC)
			};
		case 'D':
			const down = position > 2 ? -1 : 1;
			const left = position == 1 || position == 4  ? 1 : -1;

			return {
				x: centerY + vWidth/2*left,
				y: centerX + vWidth*3*down
			};
		default:
			return { x: 0, y: 0 };
	}
};

const Vertex = ({ vertexId, checker, position }) => {
	const { setNodeRef } = useDroppable({
		id: vertexId,
	});

	return (
		<g
			ref={setNodeRef}
			className={`vertex ${vertexId}`}
			transform={`translate(${position.x}, ${position.y})`}
		>
			<circle r="5" fill="#888" />
			<text dx={15} dy={15}>{vertexId}</text>
			{checker && (
				<Checker
					id={vertexId}
					color={checker.color}
					isUpgraded={checker.isUpgraded}
				/>
			)}
		</g>
	);
};

const Board = ({ gameState, gameBoard }) => {
	const svgRef = useRef(null);
	const [svgSize, setSvgSize] = useState(0);
	const [vWidth, setVWidth] = useState(0);

	useEffect(() => {
		const updateSize = () => {
			const container = svgRef.current.parentElement;
			const size = Math.min(container.clientWidth, container.clientHeight);
			setSvgSize(size);
			setVWidth((size - 2 * PADDING) / 6);
		};

		updateSize();
		window.addEventListener('resize', updateSize);
		return () => window.removeEventListener('resize', updateSize);
	}, []);

	return (
		<div className="board-container">
			<svg
				ref={svgRef}
				viewBox={`0 0 ${svgSize} ${svgSize}`}
				width="100%"
				height="100%"
			>
				{/* Draw Edges */}
				{gameBoard.edges.map(([from, to], index) => {
					const fromPos = getPosition(from, svgSize, vWidth);
					const toPos = getPosition(to, svgSize, vWidth);
					return (
						<line
							key={`edge-${index}`}
							x1={fromPos.x}
							y1={fromPos.y}
							x2={toPos.x}
							y2={toPos.y}
							stroke="#888"
							strokeWidth="2"
						/>
					);
				})}

				{/* Draw Vertices */}
				{gameBoard.vertices.map((vertexId) => (
					<Vertex
						key={vertexId}
						vertexId={vertexId}
						checker={gameState.checkers[vertexId]}
						position={getPosition(vertexId, svgSize, vWidth)}
					/>
				))}
			</svg>
		</div>
	);
};

export default Board;