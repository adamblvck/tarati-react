import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useSpring, animated } from 'react-spring';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';

import AI from '../AI';
import { gameBoard, applyMoveToBoard } from '../GameBoard';
import { useBoardSize } from '../hooks/useBoardSize';

import Board from '../components/Board';
import Sidebar from '../components/Sidebar';
import { AI_DIFFICULTY_PROFILES, DEFAULT_AI_DIFFICULTY } from '../config/aiConfig';
import './GamePage.css';

const initializeGameState = () => {
	return {
		checkers: {
			'C1': { color: 'WHITE', isUpgraded: false },
			'C2': { color: 'WHITE', isUpgraded: false },
			'D1': { color: 'WHITE', isUpgraded: false },
			'D2': { color: 'WHITE', isUpgraded: false },
			'C7': { color: 'BLACK', isUpgraded: false },
			'C8': { color: 'BLACK', isUpgraded: false },
			'D3': { color: 'BLACK', isUpgraded: false },
			'D4': { color: 'BLACK', isUpgraded: false }
		},
		currentTurn: 'WHITE'
	};
};

// async function for delay 1 second
const delay = () => new Promise(resolve => setTimeout(resolve, 100));

const cloneProfiles = () => JSON.parse(JSON.stringify(AI_DIFFICULTY_PROFILES));

const toNullableNumber = (value) => {
	if (value === '' || value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
};

const GamePage = () => {

	const [gameState, setGameState] = useState(initializeGameState());
	const [isDarkMode] = useState(true);
	const [moveHistory, setMoveHistory] = useState([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
	const [isAI, setIsAI] = useState(true); // AI on by default
	const [stopAI, setStopAI] = useState(false); // AI on by default
	const [gameOverState, setGameOverState] = useState(null);
	const [showBoardRestart, setShowBoardRestart] = useState(false);

	// Draw detection state (patent §7.2)
	const [positionHashes, setPositionHashes] = useState(() => [AI.hashPosition(initializeGameState())]);
	const [cobMovedFlags, setCobMovedFlags] = useState([]);

	// Player picks WHITE or BLACK; AI plays the opposite color
	const [playerColor, setPlayerColor] = useState('WHITE');
	const aiColor = playerColor === 'WHITE' ? 'BLACK' : 'WHITE';

	// Whether the engine, rather than a human at this board, owns the side to
	// move. With the AI disabled — or parked by an undo, which sets stopAI —
	// both colours are played from here, so neither the move guard nor the
	// promote bar may key off playerColor alone.
	const aiOwnsTurn = isAI && !stopAI && gameState.currentTurn === aiColor;

	// §6.3: when the side to move has no ordinary move, their only legal
	// continuation is promoting a dead piece in place. Surface it or the game
	// softlocks with no way to continue.
	const promotions = useMemo(
		() => (aiOwnsTurn ? [] : AI.getPromotionMoves(gameState)),
		[gameState, aiOwnsTurn]
	);

	// isLegalMove is the full rulebook but says nothing about *who* is asking,
	// so on its own it happily lets you drag the AI's pieces while it thinks.
	const canMove = useCallback(
		(state, from, to) => !aiOwnsTurn && AI.isLegalMove(state, from, to),
		[aiOwnsTurn]
	);

	// Right sidebar (Move History) collapsed by default
	const [isHistoryOpen, setIsHistoryOpen] = useState(false);

	// AI settings panel collapsed by default
	const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);

	const [difficulty, setDifficulty] = useState(DEFAULT_AI_DIFFICULTY);
	const [aiProfiles, setAiProfiles] = useState(cloneProfiles());

	const currentProfile = aiProfiles[difficulty] || AI_DIFFICULTY_PROFILES[DEFAULT_AI_DIFFICULTY];

	const setProfileValue = (key, value) => {
		setAiProfiles((prevProfiles) => ({
			...prevProfiles,
			[difficulty]: {
				...prevProfiles[difficulty],
				[key]: value
			}
		}));
	};

	const resetCurrentDifficultyProfile = () => {
		setAiProfiles((prevProfiles) => ({
			...prevProfiles,
			[difficulty]: { ...AI_DIFFICULTY_PROFILES[difficulty] }
		}));
	};

	const clearHistory = () => {
		setGameOverState(null);
		setShowBoardRestart(false);
		setMoveHistory([]);
		setCurrentMoveIndex(-1);
		const freshState = initializeGameState();
		setGameState(freshState);
		setPositionHashes([AI.hashPosition(freshState)]);
		setCobMovedFlags([]);
	}

    const boardRef = useRef(null);
	const moveSheetBodyRef = useRef(null);
	const { boardSize, vWidth } = useBoardSize(boardRef);

	// ── Board entrance animation ──
	const [boardMounted, setBoardMounted] = useState(false);
	useEffect(() => { setBoardMounted(true); }, []);
	const boardEntrance = useSpring({
		opacity: boardMounted ? 1 : 0,
		transform: boardMounted ? 'scale(1)' : 'scale(0.95)',
		delay: 150,
		config: { tension: 100, friction: 16 },
	});

	useEffect(() => {
		const savedState = localStorage.getItem('gameState');
		if (savedState) {
			setGameState(JSON.parse(savedState));
		}
	}, []);

	useEffect(() => {
		localStorage.setItem('gameState', JSON.stringify(gameState));
	}, [gameState]);

	// UX function to apply move (from -> to) on current board
	const applyMove = useCallback((from, to) => {
		setStopAI(false);
        setGameState(prevState => { 
            const newBoardState = applyMoveToBoard(prevState, from, to);

            const nextState = {
                ...newBoardState,
                currentTurn: prevState.currentTurn === 'WHITE' ? 'BLACK' : 'WHITE'
            };


            // Update move history
            const newMoveHistory = moveHistory.slice(0, currentMoveIndex + 1);
            newMoveHistory.push({ from, to, state: nextState });
            setMoveHistory(newMoveHistory);
            setCurrentMoveIndex(currentMoveIndex + 1);

			// Draw tracking: record position hash and whether a cob moved
			const newHash = AI.hashPosition(nextState);
			const movedPiece = prevState.checkers[from];
			const wasCobMove = movedPiece && !movedPiece.isUpgraded;
			const newHashes = [...positionHashes, newHash];
			const newCobFlags = [...cobMovedFlags, wasCobMove];
			setPositionHashes(newHashes);
			setCobMovedFlags(newCobFlags);

			// Check for win
			if (AI.isGameOver(nextState)) {
				setGameOverState({
					winner: prevState.currentTurn,
					message: `${prevState.currentTurn} wins!`,
					isDraw: false,
				});
				setShowBoardRestart(false);
			}
			// Check for draw by threefold repetition or 50-move rule
			else if (AI.checkThreefoldRepetition(newHashes)) {
				setGameOverState({
					winner: null,
					message: 'Draw by threefold repetition — the same position has occurred three times.',
					isDraw: true,
				});
				setShowBoardRestart(false);
			} else if (AI.checkFiftyMoveRule(newCobFlags)) {
				setGameOverState({
					winner: null,
					message: 'Draw by the 50-move rule — 50 consecutive moves by each player without moving or promoting a cob.',
					isDraw: true,
				});
				setShowBoardRestart(false);
			}

            return nextState;
        });
    }, [moveHistory, currentMoveIndex, positionHashes, cobMovedFlags]);

	useEffect(() => {

		
		// Perform AI MOVE when it's the AI's turn (opposite of playerColor)
		if (isAI && !stopAI && gameState.currentTurn === aiColor) {
			const performAIMove = async () => {
				await delay();
				// isMaximizing is accepted for backwards compatibility and ignored
				// by the engine: min/max follows gameState.currentTurn.
				const isMaximizing = aiColor === 'BLACK';
				const BESTMOVE = AI.getNextBestMove(
					gameState,
					Number(currentProfile.depth),
					isMaximizing,
					{
						maxMs: toNullableNumber(currentProfile.maxMs),
						maxNodes: toNullableNumber(currentProfile.maxNodes),
						stochasticTopK: Number(currentProfile.stochasticTopK),
						temperature: Number(currentProfile.temperature),
						blunderRate: Number(currentProfile.blunderRate ?? 0)
					}
				);
				const { move } = BESTMOVE;
				if ( move ) {
					applyMove( move.from, move.to );
				}
			}
			performAIMove();
		}
	}, [gameState, isAI, stopAI, aiColor, currentProfile, applyMove]);

    const undoMove = () => {
        if (currentMoveIndex > 0) {
            setCurrentMoveIndex(currentMoveIndex - 1);
            setGameState(moveHistory[currentMoveIndex - 1].state);
        }
		setStopAI(true);
    };

    const redoMove = () => {
        if (currentMoveIndex < moveHistory.length - 1) {
            setCurrentMoveIndex(currentMoveIndex + 1);
            setGameState(moveHistory[currentMoveIndex + 1].state);
        }
    };

    const moveToCurrentState = () => {
        setCurrentMoveIndex(moveHistory.length - 1);
        setGameState(moveHistory[moveHistory.length - 1].state);
    };

	// Auto-scroll the move sheet to the latest entry
	useEffect(() => {
		if (moveSheetBodyRef.current) {
			moveSheetBodyRef.current.scrollTop = moveSheetBodyRef.current.scrollHeight;
		}
	}, [moveHistory.length]);

    const renderMoveHistory = () => {
		const initial = initializeGameState();

		// Detect if a strike occurred on this move (opponent piece color changed)
		const isCapture = (idx) => {
			const prevCheckers = idx === 0 ? initial.checkers : moveHistory[idx - 1].state.checkers;
			const currCheckers = moveHistory[idx].state.checkers;
			const moverColor = idx % 2 === 0 ? 'WHITE' : 'BLACK';
			const prevOppCount = Object.values(prevCheckers).filter(c => c.color !== moverColor).length;
			const currOppCount = Object.values(currCheckers).filter(c => c.color !== moverColor).length;
			return currOppCount < prevOppCount;
		};

		// Detect if the moved piece got upgraded on this move
		const isUpgrade = (idx) => {
			const move = moveHistory[idx];
			const checker = move.state.checkers[move.to];
			if (!checker || !checker.isUpgraded) return false;
			const prevState = idx === 0 ? initial : moveHistory[idx - 1].state;
			const prevChecker = prevState.checkers[move.from];
			return prevChecker && !prevChecker.isUpgraded;
		};

		// Format: "C1–B1" normal, "C1×B5" capture, append "↑" on upgrade
		const formatCell = (idx) => {
			const m = moveHistory[idx];
			const sep = isCapture(idx) ? '×' : '–';
			const suffix = isUpgrade(idx) ? '↑' : '';
			return `${m.from}${sep}${m.to}${suffix}`;
		};

		// Pair moves into rows: White (even index) | Black (odd index)
		const rows = [];
		for (let i = 0; i < moveHistory.length; i += 2) {
			rows.push({
				num: Math.floor(i / 2) + 1,
				wIdx: i,
				bIdx: i + 1 < moveHistory.length ? i + 1 : null,
			});
		}

        return (
			<div className="move-sheet">
				<div className="move-sheet-header">
					<span className="ms-num">#</span>
					<span className="ms-col">White</span>
					<span className="ms-col">Black</span>
				</div>
				<div className="move-sheet-body" ref={moveSheetBodyRef}>
					{rows.length === 0 && (
						<div className="ms-empty">No moves yet</div>
					)}
					{rows.map(row => (
						<div
							key={row.num}
							className={`ms-row ${row.num % 2 === 0 ? 'ms-alt' : ''}`}
						>
							<span className="ms-num">{row.num}.</span>
							<span className={`ms-col ms-move ${row.wIdx === currentMoveIndex ? 'ms-active' : ''} ${isCapture(row.wIdx) ? 'ms-capture' : ''}`}>
								{formatCell(row.wIdx)}
							</span>
							{row.bIdx !== null ? (
								<span className={`ms-col ms-move ${row.bIdx === currentMoveIndex ? 'ms-active' : ''} ${isCapture(row.bIdx) ? 'ms-capture' : ''}`}>
									{formatCell(row.bIdx)}
								</span>
							) : (
								<span className="ms-col" />
							)}
						</div>
					))}
				</div>
			</div>
        );
    };

	const handleContinueAfterGameOver = () => {
		setGameOverState(null);
		setShowBoardRestart(true);
	};

	const handleRetryGame = () => {
		clearHistory();
	};

	return (
		<div className="game-page">
			{gameOverState ? (
				<div className="game-over-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
					<div className={`game-over-modal ${gameOverState.isDraw ? 'game-over-draw' : ''}`}>
						<h2 id="game-over-title">{gameOverState.isDraw ? 'Draw' : 'Game Over'}</h2>
						<p>{gameOverState.message}</p>
						<div className="game-over-actions">
							<button onClick={handleContinueAfterGameOver}>Continue</button>
							<button onClick={handleRetryGame}>Retry</button>
						</div>
					</div>
				</div>
			) : null}
			<div className="game-layout">
				{/* ── Left Sidebar: game controls ── */}
				<Sidebar>
					<button className="form" onClick={clearHistory}>
						New Game
					</button>

					{/* Player color choice */}
					<div className="form player-color-picker" style={{ marginTop: '12px' }}>
						<label>Play as</label>
						<div className="color-toggle">
							<button
								className={`color-btn ${playerColor === 'WHITE' ? 'active' : ''}`}
								onClick={() => setPlayerColor('WHITE')}
							>
								<span className="color-dot white-dot" /> White
							</button>
							<button
								className={`color-btn ${playerColor === 'BLACK' ? 'active' : ''}`}
								onClick={() => setPlayerColor('BLACK')}
							>
								<span className="color-dot black-dot" /> Black
							</button>
						</div>
					</div>

					<button className="form" onClick={() => setIsAI(!isAI)}>
						{isAI ? 'Disable AI' : 'Enable AI'}
					</button>

					<div className="form" style={{ marginTop: '20px' }}>
						<label htmlFor="difficulty">AI Difficulty</label>
						<select
							id="difficulty"
							value={difficulty}
							onChange={(e) => setDifficulty(e.target.value)}
						>
							<option value="Easy">Easy</option>
							<option value="Medium">Medium</option>
							<option value="Hard">Hard</option>
							<option value="Champion">Champion</option>
						</select>
					</div>

					<div className="form ai-settings-panel">
						<button
							className="ai-settings-toggle"
							onClick={() => setIsAiSettingsOpen(!isAiSettingsOpen)}
							type="button"
						>
							<span className="ai-settings-title">AI Settings ({difficulty})</span>
							<ChevronDown
								size={16}
								className={`ai-settings-chevron ${isAiSettingsOpen ? 'open' : ''}`}
							/>
						</button>

						{isAiSettingsOpen && (
							<>
								<label htmlFor="ai-depth">Depth</label>
								<input
									id="ai-depth"
									type="number"
									min="1"
									value={currentProfile.depth}
									onChange={(e) => setProfileValue('depth', Number(e.target.value))}
								/>

								<label htmlFor="ai-max-ms">Max ms per move (empty = unlimited)</label>
								<input
									id="ai-max-ms"
									type="number"
									min="0"
									value={currentProfile.maxMs ?? ''}
									onChange={(e) => setProfileValue('maxMs', e.target.value === '' ? null : Number(e.target.value))}
								/>

								<label htmlFor="ai-max-nodes">Max nodes (empty = auto/unlimited)</label>
								<input
									id="ai-max-nodes"
									type="number"
									min="1"
									value={currentProfile.maxNodes ?? ''}
									onChange={(e) => setProfileValue('maxNodes', e.target.value === '' ? null : Number(e.target.value))}
								/>

								<label htmlFor="ai-temperature">Temperature (centipieces, 0 = always best)</label>
								<input
									id="ai-temperature"
									type="number"
									min="0"
									value={currentProfile.temperature}
									onChange={(e) => setProfileValue('temperature', Number(e.target.value))}
								/>

								<label htmlFor="ai-top-k">Stochastic top-k</label>
								<input
									id="ai-top-k"
									type="number"
									min="1"
									value={currentProfile.stochasticTopK}
									onChange={(e) => setProfileValue('stochasticTopK', Number(e.target.value))}
								/>

								<button className="ai-reset-btn" onClick={resetCurrentDifficultyProfile}>
									Reset {difficulty} to default
								</button>
							</>
						)}
					</div>

					<div className="form"
						style={{
							backgroundColor: gameState.currentTurn === 'BLACK' ? 'black' : 'white',
							color: gameState.currentTurn === 'BLACK' ? 'white' : 'black',
							padding: '10px',
							margin: '5px',
							border: '1px solid black',
							borderRadius: '15px'
						}}
					>
						Current Turn <br/> { gameState.currentTurn}
					</div>
				</Sidebar>

				{/* ── Board area ── */}
				<animated.div style={boardEntrance} className={`game-area ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
					<div style={{height: 20}} />
					<Board
						ref={boardRef}
						boardSize={boardSize}
						vWidth={vWidth}
						gameState={gameState}
						gameBoard={gameBoard}
						isValidMove={canMove}
						applyMove={applyMove}
						promotions={promotions}
						flipped={playerColor === 'BLACK'}
						ApplyMoveAI={AI.ApplyMoveAI}
					/>
					{showBoardRestart ? (
						<div className="board-restart-banner">
							<button className="board-restart-btn" onClick={clearHistory}>
								Restart Game
							</button>
						</div>
					) : null}
				</animated.div>

				{/* ── Right Sidebar: Move History (collapsed by default) ── */}
				<div className={`history-sidebar-wrapper ${isHistoryOpen ? 'open' : ''}`}>
					<button
						className="history-toggle-btn"
						onClick={() => setIsHistoryOpen(!isHistoryOpen)}
						aria-label="Toggle Move History"
					>
						{isHistoryOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
					</button>
					<div className="history-sidebar">
						<div className="history-sidebar-content">
							<h3 style={{ margin: '0 0 10px' }}>Move History</h3>

							<div style={{display:'flex', flexDirection:'row', gap: 4}}>
								<button onClick={undoMove} disabled={currentMoveIndex <= 0}>Back</button>
								<button onClick={redoMove} disabled={currentMoveIndex >= moveHistory.length - 1}>Forward</button>
								{ currentMoveIndex !== moveHistory.length - 1 ? <button onClick={moveToCurrentState} disabled={currentMoveIndex === moveHistory.length - 1}>Current</button> : undefined }
							</div>
							{renderMoveHistory()}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GamePage;
