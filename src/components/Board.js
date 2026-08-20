// components/Board.js
//
// The board is one <Cell> per vertex, and each cell is both draggable (if it
// holds a piece the current player may move) and droppable. Two structural
// details are load-bearing and easy to undo by accident:
//
//   1. BOTH dnd-kit refs sit on `.cell-hit`, the bare circle centred on the
//      vertex — never on the cell <g>, and never on anything that contains the
//      piece. dnd-kit measures the node it is handed and subtracts any movement
//      of that rect back out of the drag, on the assumption that a rect only
//      moves when the page reflows under it. An SVG container's client rect is
//      the union of its children, so a ref on the <g> travelled with the piece
//      and the compensation fought the drag: 80px of travel fed back 57.9px, and
//      the piece flickered between two positions. A circle cannot move.
//      (The transform still belongs on an inner <g> for a second reason: an SVG
//      CSS transform is in user units, so a transformed measured node reports
//      rects wrong by the viewBox scale.)
//   2. That circle carries no label. The label used to inflate every drop rect
//      and shift its centre ~9px right and ~5px down, which is most of why
//      dropping on a phone felt like guesswork.
import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { DndContext, useDraggable, useDroppable, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useCombinedRefs } from '@dnd-kit/utilities';
import './Board.css';
import Data from '../helpers/position';
import { diffMove } from '../helpers/moveDiff';
import useReducedMotion from '../hooks/useReducedMotion';
import { STRIKE_DELAY_MS } from '../config/motionConfig';
import TurnIndicator from './TurnIndicator';
import { homeBaseZones, applyMoveToBoard } from '../GameBoard';

// Android only — iOS Safari has no Vibration API and this is a silent no-op
// there, which is why it needs no platform check.
const buzz = (pattern) => {
	try {
		navigator.vibrate?.(pattern);
	} catch {
		/* some browsers throw when the page is not visible */
	}
};

const PICK_UP = 8;
const ENTER_TARGET = 6;
const COMMIT = 14;
const REJECT = [10, 40, 10];

// A synthesized click can arrive after a real drag on Android. dnd-kit blocks
// most of them for 50ms; this covers the stragglers.
const TAP_AFTER_DRAG_MS = 250;

/**
 * A piece, drawn as the two-sided disc the rules describe.
 *
 * The patent is literal about a capture: the piece "remains on its stopping
 * point but is turned over to show the opposite colour". So this is a coin —
 * it turns through edge-on, swapping faces where there is nothing to see, and
 * lifts as it goes.
 *
 * Both motions are CSS, not springs. Two reasons, both learned the hard way:
 *
 *   1. A react-spring slide driven from this component froze part-way and never
 *      resumed — the piece sat stuck a fraction of a pathway from its point.
 *      A CSS transition cannot get into that state.
 *   2. A **pure translate needs no transform origin**, which is what makes the
 *      slide safe to express in CSS at all. Scaling does need one, and this
 *      codebase sets `transform-box` nowhere, so the turn declares
 *      `transform-box: fill-box` for itself in Board.css rather than resolving
 *      against the viewBox and flinging the disc off the board.
 */
const Piece = ({ pos, checker, pieceR, rokR, enterFrom, flipDelay, reduced }) => {
	const isWhite = checker.color === 'WHITE';
	const isRok = !!checker.isUpgraded;

	// The slide. The piece is drawn at its destination, offset back to where it
	// came from for its first painted frame, then released — so the browser has
	// a start and an end to transition between.
	//
	// Released from an effect, deliberately not from `requestAnimationFrame`.
	// React runs passive effects after the paint, so the browser has already
	// seen the offset by the time this fires, and effects run whether or not the
	// tab is visible. rAF does not: it stops dead in a hidden tab, which would
	// leave a piece parked a full pathway from its point until the player came
	// back — and a move arriving in a background tab is exactly what happens
	// while you are waiting for an opponent.
	const [offset, setOffset] = useState(() => (enterFrom && !reduced ? enterFrom : null));
	useEffect(() => {
		if (offset) setOffset(null);
	}, [offset]);

	// The turn. Keyed so the keyframes restart on each capture — a CSS animation
	// only re-runs if the element is new or the animation name changes.
	const [turn, setTurn] = useState({ key: 0, from: isWhite });
	useEffect(() => {
		setTurn((current) => (current.from === isWhite ? current : { key: current.key + 1, from: isWhite }));
	}, [isWhite]);
	const turning = turn.from !== isWhite || turn.key > 0;

	const slideStyle = offset
		? { transform: `translate(${offset.dx}px, ${offset.dy}px)`, transition: 'none' }
		: undefined;

	// The lift scales with the piece, so it reads the same on a phone and a
	// desktop, and the delay is what makes a strike follow its cause.
	const turnStyle = {
		'--piece-lift': `${pieceR * 1.15}px`,
		animationDelay: reduced ? '0ms' : `${flipDelay}ms`,
	};

	const face = (colour, up) => (
		<circle
			className={`piece ${colour} ${up ? 'is-face-up' : 'is-face-down'}`}
			cx={pos.x}
			cy={pos.y}
			r={pieceR}
		/>
	);
	const rokFace = (colour, up) => (
		<circle
			className={`piece-rok ${colour} ${up ? 'is-face-up' : 'is-face-down'}`}
			cx={pos.x}
			cy={pos.y}
			r={rokR}
		/>
	);

	return (
		<g className="piece-slide" style={slideStyle}>
			<g
				key={turn.key}
				className={`piece-turn ${turning ? 'is-turning' : ''}`}
				style={turnStyle}
			>
				{/* Both faces are drawn, and which one shows is decided by how far
				    the disc has turned. Separate classed circles rather than a
				    tweened `fill`, so the theme variables still apply — and a fill
				    tween would pass through grey and read as a fade, not a turn. */}
				{face('is-white', isWhite)}
				{face('is-black', !isWhite)}
				{isRok ? (
					<>
						{rokFace('is-white', isWhite)}
						{rokFace('is-black', !isWhite)}
					</>
				) : null}
			</g>
		</g>
	);
};

const Cell = ({
	id, pos, checker, hitR, pieceR, rokR, movable, isOrigin, scale, onTap,
	enterFrom, flipDelay, reduced,
}) => {
	const { setNodeRef: setDrop } = useDroppable({ id });
	const { setNodeRef: setDrag, listeners, attributes, transform } = useDraggable({
		id,
		disabled: !movable,
		// Without this every vertex becomes a tab stop, including in the replay
		// viewer where nothing is movable at all.
		attributes: { tabIndex: movable ? 0 : -1, roleDescription: 'Tarati piece' },
	});

	// One node, two roles — and it has to be a node that never moves. See the
	// note at the top of this file: dnd-kit subtracts any movement of the node it
	// measures back out of the drag, so measuring anything that contains the
	// piece makes the drag fight itself.
	const setHit = useCombinedRefs(setDrop, setDrag);

	// dnd-kit hands back a delta in client pixels. Inside a viewBox, `px` means
	// user units, so it has to be divided by the scale or the piece travels at
	// only ~59% of finger speed on a phone.
	const dragging = !!transform;
	const visualStyle = dragging
		? {
			transform: `translate3d(${transform.x / scale}px, ${transform.y / scale}px, 0)`,
			willChange: 'transform',
			filter: 'drop-shadow(3px 3px 2px rgba(0, 0, 0, 0.7))',
		}
		: undefined;

	return (
		<g
			className={`cell ${movable ? 'is-movable' : ''} ${dragging ? 'is-dragging' : ''} ${isOrigin ? 'is-origin' : ''}`}
			onClick={() => onTap(id)}
			{...listeners}
			{...attributes}
		>
			{/* The drag transform stays a CSS transform on this group; the
			    slide and the turn are an SVG transform attribute on the group
			    inside it. They are different mechanisms on different nodes, so
			    they compose instead of overwriting each other — and only one of
			    them is ever running at a time anyway. */}
			<g className="cell-visual" style={visualStyle}>
				{checker ? (
					<Piece
						pos={pos}
						checker={checker}
						pieceR={pieceR}
						rokR={rokR}
						enterFrom={enterFrom}
						flipDelay={flipDelay}
						reduced={reduced}
					/>
				) : null}
			</g>

			{/* The touch target, and BOTH dnd-kit refs. Invisible, symmetric, and much
			    larger than the piece — `touch-action: none` only on cells that can
			    actually move, so a swipe starting on an empty point still scrolls
			    the page. The browser latches touch-action at touchstart, so this
			    cannot be switched on once a drag begins. */}
			<circle
				ref={setHit}
				className="cell-hit"
				cx={pos.x}
				cy={pos.y}
				r={hitR}
				fill="none"
				style={{ pointerEvents: 'all', touchAction: movable ? 'none' : 'manipulation' }}
			/>
		</g>
	);
};

const Board = forwardRef(({ gameState, gameBoard, isValidMove, applyMove, vWidth, boardSize, promotions = [], flipped = false }, ref) => {
	// `distance`, not `delay`. The old `{ delay: 80, tolerance: 10 }` cancelled
	// any drag that travelled more than 10px inside 80ms — 125px/s, slower than
	// any deliberate drag — so confident grabs were thrown away. dnd-kit also
	// skips preventDefault for the whole delay window, which is what let the
	// browser claim the gesture and scroll the page. `distance` additionally
	// guarantees a stationary tap never starts a drag, which is what makes
	// tap-to-move and dragging able to coexist.
	const touchSensor = useSensor(TouchSensor, { activationConstraint: { distance: 8 } });
	const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 4 } });
	const sensors = useSensors(mouseSensor, touchSensor);

	const svgRef = useRef(null);
	const overIdRef = useRef(null);
	const dragEndedAt = useRef(0);

	const [scale, setScale] = useState(1);
	const [selected, setSelected] = useState(null);
	const [activeId, setActiveId] = useState(null);
	const [overId, setOverId] = useState(null);

	const aspect = 1.2;
	const layoutW = boardSize / aspect;
	const dims = useMemo(() => ({ w: layoutW, h: boardSize }), [layoutW, boardSize]);

	const positions = useMemo(() => {
		const map = new Map();
		for (const v of gameBoard.vertices) map.set(v, Data.getPosition(v, dims, vWidth, flipped));
		return map;
	}, [gameBoard, dims, vWidth, flipped]);

	// The layout leaves ~26% of its width empty. Cropping to what is actually
	// drawn scales the whole board up on a phone (where the SVG is width-bound)
	// and changes nothing on desktop (where it is height-bound and the height is
	// untouched). Derived from the real positions so it cannot drift.
	const viewBox = useMemo(() => {
		let minX = Infinity;
		let maxX = -Infinity;
		for (const p of positions.values()) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
		}
		const ringPad = vWidth / 2.6;              // widest ring drawn around a vertex
		const labelPad = vWidth * 0.48 + 6;        // label offset + up to 3 glyphs + halo
		const x0 = Math.max(0, minX - ringPad);
		const x1 = Math.min(layoutW, maxX + labelPad);
		return { x0, width: x1 - x0, str: `${x0} 0 ${x1 - x0} ${boardSize}` };
	}, [positions, vWidth, boardSize, layoutW]);

	// Every legal move for the side to move, keyed by origin. Derived from the
	// `isValidMove` prop rather than importing the engine, so it inherits each
	// page's own guards: GamePage's aiOwnsTurn, OnlineGamePage's isMyTurn, and
	// ReplayViewer's constant false (which makes the replay board inert).
	const moveMap = useMemo(() => {
		const map = new Map();
		for (const from of Object.keys(gameState.checkers)) {
			const tos = new Set();
			for (const to of gameBoard.vertices) {
				if (to !== from && isValidMove(gameState, from, to)) tos.add(to);
			}
			// §6.3 in-place promotion: legal only when nothing else is.
			if (isValidMove(gameState, from, from)) tos.add(from);
			if (tos.size) map.set(from, tos);
		}
		return map;
	}, [gameState, gameBoard, isValidMove]);

	const origin = activeId ?? selected;
	const destinations = useMemo(() => (origin ? moveMap.get(origin) ?? null : null), [origin, moveMap]);

	// SVG has no z-index; paint order is document order. Rendering the cells in
	// their fixed order sent the dragged piece *underneath* the piece it was
	// being aimed at — which, on a strike, is exactly where you are looking.
	// Keys stay per-vertex, so React moves the existing node rather than
	// remounting it: the dnd-kit ref and any running animation both survive, and
	// the reorder happens once, at drag start.
	const cellOrder = useMemo(
		() => (activeId ? [...gameBoard.vertices.filter((v) => v !== activeId), activeId] : gameBoard.vertices),
		[gameBoard.vertices, activeId]
	);

	// What just happened on the board.
	//
	// Nobody tells the board what was played — not the local page, and least of
	// all the server, which returns a whole new position on a poll. It does not
	// need telling: exactly one point loses its occupant and one gains it, so
	// the move falls out of a diff. `diffMove` returns null for anything that is
	// not a single ply — an undo, a jump to the end of a replay, a poll that
	// caught up several moves — and then the board simply snaps, which is the
	// honest thing to do when there is no one path to show.
	const reduced = useReducedMotion();

	// Worked out during render rather than in an effect. An effect runs after
	// the paint, so the piece would be drawn at its destination for one frame
	// and only then jump back to its origin to start travelling. Deriving it
	// here means the arriving piece's first painted frame is already offset.
	//
	// Safe under StrictMode's double render: the second pass sees `checkers`
	// unchanged and takes the stored value rather than recomputing.
	const tracker = useRef({ checkers: gameState.checkers, motion: null, token: 0 });
	if (tracker.current.checkers !== gameState.checkers) {
		const move = diffMove({ checkers: tracker.current.checkers }, gameState);
		// §6.3 promotes in place: a ply, but nothing travels.
		const travelling = move && !move.promotion;
		const token = travelling ? tracker.current.token + 1 : tracker.current.token;
		tracker.current = {
			checkers: gameState.checkers,
			motion: travelling ? { token, ...move } : null,
			token,
		};
	}
	const motion = tracker.current.motion;

	// Drop a selection the moment its piece stops being movable — but NOT on
	// every gameState identity change, or online polling (a fresh object every
	// 1.5s) would clear the selection out from under the player.
	useEffect(() => {
		if (selected && !moveMap.has(selected)) setSelected(null);
	}, [moveMap, selected]);

	const readScale = useCallback(() => {
		const svg = svgRef.current;
		if (!svg) return 1;
		// getScreenCTM folds in the viewBox scale, page zoom and any ancestor
		// transform (GamePage keeps a react-spring scale() on .game-area), and
		// reports in the same space as getBoundingClientRect — which is the space
		// dnd-kit's rects live in. A viewBox/clientWidth ratio would be wrong on
		// desktop, where preserveAspectRatio letterboxes on height instead.
		const m = svg.getScreenCTM();
		if (m && m.a) return m.a;
		const r = svg.getBoundingClientRect();
		return r.width && viewBox.width ? r.width / viewBox.width : 1;
	}, [viewBox.width]);

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) return undefined;
		const update = () => setScale(readScale());
		update();
		if (typeof ResizeObserver === 'undefined') return undefined;
		const ro = new ResizeObserver(update);
		ro.observe(svg);
		return () => ro.disconnect();
	}, [readScale, boardSize, vWidth]);

	const commit = useCallback((from, to) => {
		if (!isValidMove(gameState, from, to)) {
			buzz(REJECT);
			return;
		}
		buzz(COMMIT);
		setSelected(null);
		applyMove(from, to);
	}, [gameState, isValidMove, applyMove]);

	// Nearest LEGAL vertex to the fingertip, within a snap radius. Restricting
	// candidates to the origin's destinations makes targets magnetic and makes
	// it impossible to hover an illegal one; past the cutoff the drop cancels
	// cleanly rather than teleporting the piece somewhere unintended.
	const collisionDetection = useCallback((args) => {
		const { droppableContainers, droppableRects, pointerCoordinates, collisionRect } = args;
		const from = args.active?.id ?? selected;
		const allowed = from ? moveMap.get(from) : null;
		if (!allowed || allowed.size === 0) return [];

		const point = pointerCoordinates
			?? (collisionRect
				? { x: collisionRect.left + collisionRect.width / 2, y: collisionRect.top + collisionRect.height / 2 }
				: null);
		if (!point) return [];

		let best = null;
		let bestDistance = Infinity;
		for (const container of droppableContainers) {
			if (!allowed.has(container.id)) continue;
			const rect = droppableRects.get(container.id);
			if (!rect) continue;
			const distance = Math.hypot(
				rect.left + rect.width / 2 - point.x,
				rect.top + rect.height / 2 - point.y
			);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = container;
			}
		}
		const cutoff = 0.75 * vWidth * scale;
		return best && bestDistance <= cutoff
			? [{ id: best.id, data: { droppableContainer: best, value: bestDistance } }]
			: [];
	}, [selected, moveMap, vWidth, scale]);

	const handleDragStart = ({ active }) => {
		setScale(readScale());
		setActiveId(active.id);
		setSelected(active.id);
		overIdRef.current = null;
		setOverId(null);
		buzz(PICK_UP);
	};

	const handleDragOver = ({ over }) => {
		const id = over?.id ?? null;
		// The one drop-zone signal that still works while a finger covers the target.
		if (id && id !== overIdRef.current) buzz(ENTER_TARGET);
		overIdRef.current = id;
		setOverId(id);
	};

	const clearDrag = () => {
		setActiveId(null);
		setOverId(null);
		overIdRef.current = null;
		dragEndedAt.current = Date.now();
	};

	const handleDragEnd = ({ active, over }) => {
		clearDrag();
		// A drag that lands nowhere keeps the selection, so a fumbled gesture
		// degrades into the tap-to-move flow instead of doing nothing.
		if (!over) return;
		commit(active.id, over.id);
	};

	const handleTap = useCallback((id) => {
		if (Date.now() - dragEndedAt.current < TAP_AFTER_DRAG_MS) return;
		if (selected) {
			// Checked before the deselect branch so the §6.3 self-target, where
			// the only legal destination is the selected piece itself, commits.
			if (moveMap.get(selected)?.has(id)) {
				commit(selected, id);
				return;
			}
			if (id === selected) {
				setSelected(null);
				return;
			}
		}
		if (moveMap.has(id)) {
			setSelected(id);
			buzz(PICK_UP);
			return;
		}
		setSelected(null);
	}, [selected, moveMap, commit]);

	// The hit circles tile the board but leave gaps between them; without this a
	// tap into a gap does nothing, which reads as an unresponsive board.
	const handleBackgroundTap = useCallback((event) => {
		if (Date.now() - dragEndedAt.current < TAP_AFTER_DRAG_MS) return;
		const svg = svgRef.current;
		const ctm = svg?.getScreenCTM();
		if (!ctm) {
			setSelected(null);
			return;
		}
		const point = svg.createSVGPoint();
		point.x = event.clientX;
		point.y = event.clientY;
		const { x, y } = point.matrixTransform(ctm.inverse());

		let best = null;
		let bestDistance = Infinity;
		for (const [vertexId, p] of positions) {
			const distance = Math.hypot(p.x - x, p.y - y);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = vertexId;
			}
		}
		if (best && bestDistance <= 0.62 * vWidth) handleTap(best);
		else setSelected(null);
	}, [positions, vWidth, handleTap]);

	// Which pieces this move would convert. Tarati's striking rule is not
	// guessable from the board, so showing it is most of what a stranger needs.
	const strikePreview = useMemo(() => {
		if (!origin || !overId || !destinations?.has(overId)) return [];
		const after = applyMoveToBoard(gameState, origin, overId);
		const converted = [];
		for (const [vertexId, before] of Object.entries(gameState.checkers)) {
			const now = after.checkers[vertexId];
			if (now && now.color !== before.color) converted.push(vertexId);
		}
		return converted;
	}, [origin, overId, destinations, gameState]);

	const aiming = !!origin;

	return (
		<div ref={ref} className="board-container">
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				// dnd-kit scrolls the nearest scrollable ancestor — including the
				// document — when a drag nears the viewport edge. D1-D4 sit at the
				// extreme top and bottom, so reaching them triggered it every time.
				autoScroll={false}
				onDragStart={handleDragStart}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
				onDragCancel={clearDrag}
			>
				{/* No height attribute: `height="auto"` is not a valid SVG length
				    (the browser logged an error on every render) and resolved to
				    100%, stretching the element to the container and leaving a
				    screenful of dead space below the board on a phone. Intrinsic
				    sizing comes from `height: auto` in Board.css instead. */}
				<svg
					ref={svgRef}
					viewBox={viewBox.str}
					width="100%"
					className={`board-svg ${aiming ? 'is-aiming' : ''}`}
				>
					{/* Catches taps that land between hit circles. First in document
					    order, so every interactive element is hit-tested before it. */}
					<rect
						className="board-bg"
						x={viewBox.x0}
						y={0}
						width={viewBox.width}
						height={boardSize}
						fill="none"
						style={{ pointerEvents: 'all' }}
						onClick={handleBackgroundTap}
					/>

					{/* Home bases. A cob promotes the moment it lands on any of these
					    four points, and two of them per base sit on the circumference
					    looking exactly like ordinary ring points — this zone is what
					    makes that rule visible instead of surprising. */}
					{homeBaseZones.map(({ color, points }) => (
						<polygon
							key={`home-${color}`}
							className={`home-zone ${color === 'WHITE' ? 'is-white' : 'is-black'}`}
							points={points.map((v) => { const p = positions.get(v); return `${p.x},${p.y}`; }).join(' ')}
							style={{ pointerEvents: 'none' }}
						/>
					))}

					{gameBoard.edges.map(([from, to], index) => {
						const a = positions.get(from);
						const b = positions.get(to);
						return (
							<line
								key={`edge-${index}`}
								x1={a.x}
								y1={a.y}
								x2={b.x}
								y2={b.y}
								className="board-edge"
								strokeWidth="2"
								style={{ pointerEvents: 'none' }}
							/>
						);
					})}

					{gameBoard.vertices.map((vertexId) => {
						const p = positions.get(vertexId);
						return (
							<g key={`v-${vertexId}`} className="vertex-mark" style={{ pointerEvents: 'none' }}>
								<circle className="vertex-dot" cx={p.x} cy={p.y} r={vWidth / 12} />
								{/* The halo behind the label has to flip with the background
								    or the text becomes unreadable in dark mode. */}
								<text
									className="vertex-label"
									fontSize={vWidth / 6}
									dominantBaseline="middle"
									paintOrder="stroke"
									strokeLinejoin="round"
									strokeWidth={5}
									x={p.x + vWidth / 6}
									y={p.y + vWidth / 6}
								>
									{vertexId}
								</text>
							</g>
						);
					})}

					{/* ── Hint layer. Everything here is decoration and must never
					    intercept a pointer, or it would shadow the cells above it. ── */}
					<g className="hint-layer" style={{ pointerEvents: 'none' }}>
						{/* "These are yours to move" — the answer to a stranger's first
						    question, shown only while nothing is picked up. */}
						{!aiming && [...moveMap.keys()].map((vertexId) => {
							const p = positions.get(vertexId);
							return <circle key={`movable-${vertexId}`} className="hint-movable" cx={p.x} cy={p.y} r={vWidth / 4.8} />;
						})}

						{origin && positions.get(origin) ? (
							<circle
								className="hint-origin"
								cx={positions.get(origin).x}
								cy={positions.get(origin).y}
								r={vWidth / 3.4}
							/>
						) : null}

						{/* Long, and nowhere near the fingertip — the only "you are in a
						    drop zone" signal a covering finger cannot hide. */}
						{origin && overId && destinations?.has(overId) && overId !== origin ? (
							<line
								className="hint-connector"
								x1={positions.get(origin).x}
								y1={positions.get(origin).y}
								x2={positions.get(overId).x}
								y2={positions.get(overId).y}
							/>
						) : null}

						{destinations ? [...destinations].map((vertexId) => {
							const p = positions.get(vertexId);
							return (
								<circle
									key={`dest-${vertexId}`}
									className={`hint-dest ${overId === vertexId ? 'is-over' : ''} ${vertexId === origin ? 'is-self' : ''}`}
									cx={p.x}
									cy={p.y}
									r={vWidth / 2.6}
								/>
							);
						}) : null}

						{strikePreview.map((vertexId) => {
							const p = positions.get(vertexId);
							return <circle key={`strike-${vertexId}`} className="hint-strike" cx={p.x} cy={p.y} r={vWidth / 4.4} />;
						})}

						{/* §6.3: no ordinary move exists, so a dead piece may be promoted
						    in place. */}
						{promotions.map((vertexId) => {
							const p = positions.get(vertexId);
							return <circle key={`promote-ring-${vertexId}`} className="promote-ring" cx={p.x} cy={p.y} r={vWidth / 4} />;
						})}
					</g>

					{cellOrder.map((vertexId) => {
						const here = positions.get(vertexId);
						// The piece that just arrived starts at the point it left
						// and springs the offset away. Everything else sits still.
						// (`origin` above is the selected piece — different thing.)
						const cameFrom = motion && motion.to === vertexId
							? positions.get(motion.from)
							: null;
						return (
							<Cell
								key={vertexId}
								id={vertexId}
								pos={here}
								checker={gameState.checkers[vertexId]}
								hitR={vWidth / 2.4}
								pieceR={vWidth / 6}
								rokR={vWidth / 13}
								movable={moveMap.has(vertexId)}
								isOrigin={vertexId === origin}
								scale={scale}
								onTap={handleTap}
								enterFrom={cameFrom ? { dx: cameFrom.x - here.x, dy: cameFrom.y - here.y } : null}
								flipDelay={motion?.struck.includes(vertexId) ? STRIKE_DELAY_MS : 0}
								reduced={reduced}
							/>
						);
					})}
				</svg>
			</DndContext>

			{/* Dropping a piece on itself and tapping it twice both work, but this
			    button is the path that always works, on every input device. */}
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

			<TurnIndicator currentTurn={gameState.currentTurn} yourMove={moveMap.size > 0} />
		</div>
	);
});

export default Board;
