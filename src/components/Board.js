// components/Board.js
import React, { useRef, useState, useEffect, forwardRef } from 'react';
import { DndContext, useDraggable, useDroppable, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import Checker from './Checker';
import './Board.css';
import Data from '../helpers/position';
import TurnIndicator from './TurnIndicator';
const HIGHLIGHT_RADIUS = 30; // Radius to highlight potential drop locations

// const getPosition = (vertexId, boardSize, vWidth) => {}

const Vertex = ({ vertexId, checker, position, canDrop, vWidth}, ref) => {
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
			<circle r={vWidth/12} fill={style.color ?? "#888"}  cx={position.x} cy={position.y} />
			
			<text fontSize={vWidth/6} dominantBaseline="middle" paintOrder="stroke" strokeLineJoin="round" strokeWidth={5} stroke={'#ffffff'} x={position.x+vWidth/6} y={position.y+vWidth/6}>{vertexId}</text>
		</g>
        
    );
};

const DraggableChecker = ({ id, color, isUpgraded, position, vWidth }) => {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: id,
    });
	const style = {
        transform: transform ? CSS.Translate.toString(transform) : 'none',
        zIndex: transform ? 1000 : 1,
        filter: transform ? 'drop-shadow(3px 3px 2px rgba(0, 0, 0, 0.7))' : 'none',
        transition: 'filter 0.3s ease-in-out',
        touchAction: 'manipulation', // Prevents the browser from handling touch events
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
                r={vWidth/6}
                fill={color}
                stroke="#222"
            />
			{isUpgraded ?
				<circle cx={position.x} cy={position.y} r={vWidth/9} fill={color=='WHITE'?'BLACK':'WHITE'} 
			/> : undefined }
        </g>
    );
};

const Board = forwardRef( ({ gameState, gameBoard, isValidMove, applyMove, vWidth, boardSize }, ref) => {
   
	const touchSensor = useSensor(TouchSensor, {
        // Require the touch to move by 5px before activating
        activationConstraint: {
            delay: 50, // 250ms delay
            tolerance: 0, // 5px tolerance
        },
    });

    const mouseSensor = useSensor(MouseSensor);
    const sensors = useSensors(mouseSensor, touchSensor);

    const [draggedChecker, setDraggedChecker] = useState(null);
    const [highlightedVertices, setHighlightedVertices] = useState([]);

	const handleDragEnd = (event) => {
		const { active, over } = event;

		if (!(active && over)) return;
		if (active?.id === over?.id) return;
		console.log(active, over)

		if (isValidMove(gameState, active?.id, over?.id)) {
			applyMove(active.id, over.id);
		}
	};

	const aspect=1.2;

    return (
        <div ref={ref} className="board-container">
			<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
				<svg
					viewBox={`0 0 ${boardSize/aspect} ${boardSize}`}
					width="100%"
					height="auto"
					className='board-svg'
				>
					{/* Draw Edges */}
					{gameBoard.edges.map(([from, to], index) => {
						const fromPos = Data.getPosition(from, {w:boardSize/aspect,h:boardSize}, vWidth);
						const toPos = Data.getPosition(to, {w:boardSize/aspect,h:boardSize}, vWidth);
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
							position={Data.getPosition(vertexId, {w:boardSize/aspect,h:boardSize}, vWidth)}
							canDrop={false} //draggedChecker && isValidMove(draggedChecker, vertexId)}
							vWidth={vWidth}
						/>
					))}

					{/* Draw Draggable Checkers */}
					{Object.entries(gameState.checkers).map(([id, checker]) => (
						<DraggableChecker
							key={id}
							id={id}
							color={checker.color}
							isUpgraded={checker.isUpgraded}
							position={Data.getPosition(id, {w:boardSize/aspect,h:boardSize}, vWidth)}
							vWidth={vWidth}
						/>
					))}
				</svg>
			</DndContext>
			{/* viewWidth -> vWidth */}
			<TurnIndicator height={200} currentTurn={gameState.currentTurn} vWidth={boardSize/2}/>
        </div>
    );
});

export default Board;