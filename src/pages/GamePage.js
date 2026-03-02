import React, { useRef, useState, useEffect, useCallback } from 'react';

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
		setMoveHistory([]); // reset history
		setCurrentMoveIndex(-1); // reset position of history in game
		setGameState(initializeGameState()); // reset board
	}

    const boardRef = useRef(null);
	const { boardSize, vWidth } = useBoardSize(boardRef);

	useEffect(() => {
		const savedState = localStorage.getItem('gameState');
        console.log("savedState", savedState)
		if (savedState) {
			setGameState(JSON.parse(savedState));
		}
	}, []);

	useEffect(() => {
        console.log("trying to store gameState", gameState);
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

			console.log(prevState.currentTurn, "to", nextState.currentTurn, "Moving", from, to);

            // Update move history
            const newMoveHistory = moveHistory.slice(0, currentMoveIndex + 1);
            newMoveHistory.push({ from, to, state: nextState });
            setMoveHistory(newMoveHistory);
            setCurrentMoveIndex(currentMoveIndex + 1);
			
			if (AI.isGameOver(nextState)) {
				setGameOverState({
					winner: prevState.currentTurn,
					message: `${prevState.currentTurn} wins!`
				});
				setShowBoardRestart(false);
			}

            return nextState;
        });
    }, [moveHistory, currentMoveIndex]);

	useEffect(() => {

		console.log("Applying the miracle", gameState);
		
		// Perform AI MOVE
		if (isAI && !stopAI && gameState.currentTurn === 'BLACK') {
			const performAIMove = async () => {
				await delay();
				const BESTMOVE = AI.getNextBestMove(
					gameState,
					Number(currentProfile.depth),
					true,
					{
						maxMs: toNullableNumber(currentProfile.maxMs),
						maxNodes: toNullableNumber(currentProfile.maxNodes),
						rootProbeNodes: Number(currentProfile.rootProbeNodes),
						stochasticTopK: Number(currentProfile.stochasticTopK)
					}
				);
				const { move } = BESTMOVE;
				console.log('BESTMOVE BLACK', BESTMOVE);
				if ( move ) {
					applyMove( move.from, move.to );
				}
			}
			performAIMove();
		}
		else if (isAI && !stopAI && gameState.currentTurn === 'WHITE') {
			// const performAIMove = async () => {
			// 	const BESTMOVE = AI.getNextBestMove(gameState, 3, false);
			// 	const { move } = BESTMOVE;
			// 	console.log('BESTMOVE WHITE', BESTMOVE);
			// 	if ( move ) {
			// 		applyMove( move.from, move.to );
			// 	}
			// 	await delay();
			// }
			// performAIMove();
		}
	}, [gameState, isAI, stopAI, currentProfile, applyMove]);

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

    const renderMoveHistory = () => {
        return (
            <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '20px' }}>
                <ul className='move-history-list' style={{ listStyleType: 'none', padding: 0 }}>
                    {moveHistory.slice().reverse().map((move, index) => (
                        <li className='move-history-item' key={index} style={{ marginBottom: '5px' }}>
                            <span style={{
                                display: 'inline-block',
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: index === currentMoveIndex ? '#4CAF50' : '#ccc',
                                marginRight: '10px'
                            }}></span>
                            {index + 1} · {move.from} → {move.to}
                        </li>
                    ))}
                </ul>
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
					<div className="game-over-modal">
						<h2 id="game-over-title">Game Over</h2>
						<p>{gameOverState.message}</p>
						<div className="game-over-actions">
							<button onClick={handleContinueAfterGameOver}>Continue</button>
							<button onClick={handleRetryGame}>Retry</button>
						</div>
					</div>
				</div>
			) : null}
			<div className="game-layout">
				<Sidebar>
					<button className="form" onClick={clearHistory} style={{marginTop:65}}>
						New Game
					</button>

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
						<div className="ai-settings-title">AI Settings ({difficulty})</div>

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

						<label htmlFor="ai-root-probe">Root probe nodes</label>
						<input
							id="ai-root-probe"
							type="number"
							min="1"
							value={currentProfile.rootProbeNodes}
							onChange={(e) => setProfileValue('rootProbeNodes', Number(e.target.value))}
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

					<h3>Move History</h3>

					<div style={{display:'flex', flexDirection:'row'}}>
						<button onClick={undoMove} disabled={currentMoveIndex <= 0}>Back</button>
						<button onClick={redoMove} disabled={currentMoveIndex >= moveHistory.length - 1}>Forward</button>
						{ currentMoveIndex !== moveHistory.length - 1 ? <button onClick={moveToCurrentState} disabled={currentMoveIndex === moveHistory.length - 1}>Move to Current</button> : undefined }
					</div>
					{renderMoveHistory()}
					
				</Sidebar>

				<div className={`game-area ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
					<div style={{height: 20}}>
						
					</div>
					<Board
						ref={boardRef}
						boardSize={boardSize}
						vWidth={vWidth}
						gameState={gameState}
						gameBoard={gameBoard}
                        isValidMove={AI.isValidMove}
                        applyMove={applyMove}
						ApplyMoveAI={AI.ApplyMoveAI}
					/>
					{showBoardRestart ? (
						<div className="board-restart-banner">
							<button className="board-restart-btn" onClick={clearHistory}>
								Restart Game
							</button>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
};

export default GamePage;
