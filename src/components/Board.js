// components/Board.js
import React, { useRef, useState, useEffect, forwardRef } from 'react';
import { useDroppable, useDraggable, DndContext, useDndMonitor } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Checker from './Checker';
import './Board.css';
import Data from '../helpers/position';

const HIGHLIGHT_RADIUS = 30; // Radius to highlight potential drop locations

// const getPosition = (vertexId, boardSize, vWidth) => {}

const Vertex = ({ vertexId, checker, position, canDrop }, ref) => {
    const { isOver, setNodeRef } = useDroppable({
        id: vertexId,
    });

	const style = {
		color: isOver ? 'green' : undefined,
	};

    return (
		<g
			ref={setNodeRef}
			className={`vertex ${vertexId} ${isOver ? 'is-over' : ''} ${canDrop ? 'can-drop' : ''}`}
			style={{
				...style,
				transform: `translate(${position.x}, ${position.y})`,
				scale: 1
			}}	
		>
			<circle r="5" fill={style.color ?? "#888"}  cx={position.x} cy={position.y} />
			<text strokeWidth={2} strokeColor={'#ffffff'} x={position.x+15} y={position.y+15}>{vertexId}</text>
		</g>
        
    );
};

const DraggableChecker = ({ id, color, isUpgraded, position }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: id,
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        zIndex: 1000,
        filter: 'drop-shadow(3px 3px 2px rgba(0, 0, 0, 0.7))',
        transition: 'filter 0.3s ease-in-out',
		touchAaction: 'manipulation',
		scale:1
    } : {
        zIndex: 1000,
        filter: 'drop-shadow(3px 3px 2px rgba(0, 0, 0, 0.7))',
        transition: 'filter 0.3s ease-in-out',
		touchAaction: 'manipulation',
		scale:1
	};

    return (
        <g
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
        >
            <circle
                cx={position.x}
                cy={position.y}
                r="15"
                fill={color}
                stroke="#222"
            />
			{isUpgraded ?
				<circle cx={position.x} cy={position.y} r="10" fill={color=='WHITE'?'BLACK':'WHITE'} 
			/> : undefined }
        </g>
    );
};

const Board = forwardRef( ({ gameState, gameBoard, isValidMove, applyMove, vWidth, boardSize }, ref) => {
   

    const [draggedChecker, setDraggedChecker] = useState(null);
    const [highlightedVertices, setHighlightedVertices] = useState([]);

	const handleDragEnd = (event) => {
		const { active, over } = event;

		if (!(active && over)) return;
		if (active?.id === over?.id) return;
		console.log(active, over)

		if (isValidMove(active?.id, over?.id)) {
			applyMove(active.id, over.id);
		}
	};

    return (
        <div ref={ref} className="board-container">
			<DndContext onDragEnd={handleDragEnd}>
				<svg
					viewBox={`0 0 ${boardSize} ${boardSize}`}
					width="100%"
					height="100%"
				>
					{/* Draw Edges */}
					{gameBoard.edges.map(([from, to], index) => {
						const fromPos = Data.getPosition(from, boardSize, vWidth);
						const toPos = Data.getPosition(to, boardSize, vWidth);
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
							position={Data.getPosition(vertexId, boardSize, vWidth)}
							canDrop={draggedChecker && isValidMove(draggedChecker, vertexId)}
						/>
					))}

					{/* Draw Draggable Checkers */}
					{Object.entries(gameState.checkers).map(([id, checker]) => (
						<DraggableChecker
							key={id}
							id={id}
							color={checker.color}
							isUpgraded={checker.isUpgraded}
							position={Data.getPosition(id, boardSize, vWidth)}
						/>
					))}
				</svg>
			</DndContext>
        </div>
    );
});

export default Board;