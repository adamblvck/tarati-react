// components/Board.js
import React, { useState, forwardRef } from 'react';
import { DndContext, useDraggable, useDroppable, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import './Board.css';
import Data from '../helpers/position';
import TurnIndicator from './TurnIndicator';

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
			<circle className="vertex-dot" r={vWidth/12} cx={position.x} cy={position.y} />

			{/* Colours come from CSS so the board follows the theme; the halo
			    behind the label has to flip with the background or the text
			    becomes unreadable in dark mode. */}
			<text className="vertex-label" fontSize={vWidth/6} dominantBaseline="middle" paintOrder="stroke" strokeLineJoin="round" strokeWidth={5} x={position.x+vWidth/6} y={position.y+vWidth/6}>{vertexId}</text>
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
                className={`piece ${color === 'WHITE' ? 'is-white' : 'is-black'}`}
                cx={position.x}
                cy={position.y}
                r={vWidth/6}
            />
			{isUpgraded ?
				<circle
					className={`piece-rok ${color === 'WHITE' ? 'is-white' : 'is-black'}`}
					cx={position.x}
					cy={position.y}
					r={vWidth/9}
				/> : undefined }
        </g>
    );
};

const Board = forwardRef( ({ gameState, gameBoard, isValidMove, applyMove, vWidth, boardSize, promotions = [], flipped = false }, ref) => {
   
	const touchSensor = useSensor(TouchSensor, {
        // Short press-and-hold before a drag starts, so scrolling the page
        // doesn't accidentally pick up a piece.
        //
        // `tolerance` is how far the finger may travel DURING `delay` without
        // cancelling. It was 0, which meant the slightest wobble — and fingers
        // always wobble — aborted the drag before it began, making the board
        // feel broken on a phone. 10px absorbs normal jitter while still
        // distinguishing a hold from a swipe.
        activationConstraint: {
            delay: 80,
            tolerance: 10,
        },
    });

    const mouseSensor = useSensor(MouseSensor);
    const sensors = useSensors(mouseSensor, touchSensor);

    // eslint-disable-next-line no-unused-vars
    const [draggedChecker, setDraggedChecker] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [highlightedVertices, setHighlightedVertices] = useState([]);

	const handleDragEnd = (event) => {
		const { active, over } = event;

		if (!(active && over)) return;

		// A drop onto the piece's own vertex is the §6.3 in-place promotion.
		// It is only ever legal when the player has no ordinary move, so a
		// stray tap can never cost anyone a turn they wanted to spend
		// elsewhere — and when it isn't legal this behaves exactly as before.
		if (active.id === over.id) {
			if (isValidMove(gameState, active.id, active.id)) {
				applyMove(active.id, active.id);
			}
			return;
		}

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
						const fromPos = Data.getPosition(from, {w:boardSize/aspect,h:boardSize}, vWidth, flipped);
						const toPos = Data.getPosition(to, {w:boardSize/aspect,h:boardSize}, vWidth, flipped);
						return (
							<line
								key={`edge-${index}`}
								x1={fromPos.x}
								y1={fromPos.y}
								x2={toPos.x}
								y2={toPos.y}
								className="board-edge"
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
							position={Data.getPosition(vertexId, {w:boardSize/aspect,h:boardSize}, vWidth, flipped)}
							canDrop={false} //draggedChecker && isValidMove(draggedChecker, vertexId)}
							vWidth={vWidth}
						/>
					))}

					{/* Highlight pieces that can be promoted in place (§6.3).
					    pointerEvents:none so this never intercepts a drag. */}
					{promotions.map((vertexId) => {
						const p = Data.getPosition(vertexId, {w:boardSize/aspect,h:boardSize}, vWidth, flipped);
						return (
							<circle
								key={`promote-ring-${vertexId}`}
								className="promote-ring"
								cx={p.x}
								cy={p.y}
								r={vWidth/4}
								style={{ pointerEvents: 'none' }}
							/>
						);
					})}

					{/* Draw Draggable Checkers */}
					{Object.entries(gameState.checkers).map(([id, checker]) => (
						<DraggableChecker
							key={id}
							id={id}
							color={checker.color}
							isUpgraded={checker.isUpgraded}
							position={Data.getPosition(id, {w:boardSize/aspect,h:boardSize}, vWidth, flipped)}
							vWidth={vWidth}
						/>
					))}
				</svg>
			</DndContext>
			{/* No ordinary move exists, so the only legal continuation is an
			    in-place promotion (§6.3). Dropping a piece on itself works too,
			    but dnd-kit's collision detection is unreliable for a resting
			    tap — this button is the path that always works, on touch too. */}
			{promotions.length > 0 && (
				<div className="promote-bar" role="status">
					<span className="promote-hint">No moves left — promote a dead piece to play on.</span>
					{promotions.map((vertexId) => (
						<button
							key={`promote-${vertexId}`}
							type="button"
							className="promote-btn"
							onClick={() => applyMove(vertexId, vertexId)}
						>
							Promote {vertexId}
						</button>
					))}
				</div>
			)}
			{/* viewWidth -> vWidth */}
			<TurnIndicator height={200} currentTurn={gameState.currentTurn} vWidth={boardSize/2}/>
        </div>
    );
});

export default Board;