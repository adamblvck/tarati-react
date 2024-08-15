import React, { useRef, useState, useEffect } from 'react';
import { DndContext, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';


// import getPosition from './helpers/position.js';
// import getPosition from './helpers/position';

import {useBoardSize} from './hooks/useBoardSize';

import Board from './components/Board';
import Sidebar from './components/Sidebar';
import './App.css';

import Data from './helpers/position';

const PADDING = 20; // Adjustable padding
const isTouchDevice = 'ontouchstart' in window;

// Define the game board structure
const gameBoard = {
	vertices: [
		'A1', // Absolute Middle
		'B1', 'B2', 'B3', 'B4', 'B5', 'B6', // Boundary
		'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', // Circumference
		'D1', 'D2', 'D3', 'D4' // Domestic
	],
	edges: [
        // Home base White
        ['D1', 'D2'],['D1', 'C1'],['D2', 'C2'],
        
        // Home base black
        ['D3', 'D4'],['D3', 'C7'],['D4', 'C8'],

        // C - Circumference
        ['C1', 'C2'],['C2', 'C3'],['C3', 'C4'],
        ['C4', 'C5'],['C5', 'C6'],['C6', 'C7'],
        ['C7', 'C8'],['C8', 'C9'],['C9', 'C10'],
        ['C10', 'C11'],['C11', 'C12'],['C12', 'C1'],

        // B - Boundary
        ['B1', 'B2'],['B2', 'B3'],['B3', 'B4'],
        ['B4', 'B5'],['B5', 'B6'],['B6', 'B1'],

        // C to B
        ['C1', 'B1'],['C2', 'B1'],
        ['C3', 'B2'],['C4', 'B2'],
        ['C5', 'B3'],['C6', 'B3'],
        ['C7', 'B4'],['C8', 'B4'],
        ['C9', 'B5'],['C10', 'B5'],
        ['C11', 'B6'],['C12', 'B6'],

        // B to A (absolute Middle)
        ['B1', 'A1'],['B2', 'A1'],['B3', 'A1'],
        ['B4', 'A1'],['B5', 'A1'],['B6', 'A1'],

	],
	homeBases: {
		white: ['C1', 'C2', 'D1', 'D2'],
		black: ['C7', 'C8', 'D3', 'D4']
	}
};

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
const delay = () => new Promise(resolve => setTimeout(resolve, 1000));

const App = () => {

	const [gameState, setGameState] = useState(initializeGameState());
	const [isDarkMode, setIsDarkMode] = useState(true);
	const [moveHistory, setMoveHistory] = useState([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
	const [isAI, setIsAI] = useState(true); // AI on by default
	const [stopAI, setStopAI] = useState(false); // AI on by default

	const clearHistory = () => {
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

	useEffect(() => {
		// Perform AI MOVE
		if (isAI && !stopAI && gameState.currentTurn === 'BLACK') {
			const performAIMove = async () => {
				await delay();
				const BESTMOVE = getNextBestMove(gameState, 100);
				const { move } = BESTMOVE;
				console.log('BESTMOVE', BESTMOVE);
				if ( move ) {
					applyMove( move.from, move.to );
				}
			}
			performAIMove();
		}
	}, [gameState]);

	const isValidMove = (from, to) => {

		// same square is not a move
		if (from == to ) return false;

		// Implement move validation logic
		const isValidEdge = gameBoard.edges.some(edge => 
			(edge[0] === from && edge[1] === to) || (edge[1] === from && edge[0] === to)
		);
		// check if move is single step
		if (!isValidEdge) return false;

		// Check if the from vertex has a checker
		const checker = gameState.checkers[from];
		if (!checker) return false;

		// Check if the destination is empty (can't stack)
		if (gameState.checkers[to]) return false;

		// if not current turn - not allowed
		if (checker.color !== gameState.currentTurn) return false;

		// Check if the move is forward (for non-upgraded checkers)
		if (!checker.isUpgraded) {
			const upwardForWhite = checker.color === 'WHITE' ? 1 : -1;
			const fromY = Data.getPosition(from, boardSize, vWidth ).y;
			const toY = Data.getPosition(to, boardSize, vWidth ).y;
            if (checker.color === 'WHITE' && (fromY - toY > 10)) return true;
            else
                if (checker.color === 'BLACK' && (toY - fromY > 10)) return true;
            else
                return false;
		}

		return true;
	};

	const applyMove = (from, to) => {
		setStopAI(false);
        setGameState(prevState => {
            const newState = JSON.parse(JSON.stringify(prevState));
            const movedChecker = newState.checkers[from];
            delete newState.checkers[from];
            newState.checkers[to] = movedChecker;

            // Check for upgrades
			if (gameBoard.homeBases.white.includes(to) && movedChecker.color === 'BLACK') {
				movedChecker.isUpgraded = true;
			} else if (gameBoard.homeBases.black.includes(to) && movedChecker.color === 'WHITE') {
				movedChecker.isUpgraded = true;
			}

			// Turn over adjacent checkers
			gameBoard.edges.forEach(edge => {
				if (edge.includes(to)) {
					const adjacentVertex = edge.find(v => v !== to);
					if (newState.checkers[adjacentVertex] && newState.checkers[adjacentVertex].color !== movedChecker.color) {
						newState.checkers[adjacentVertex].color = movedChecker.color;
					}
				}
			});

            const nextState = {
                ...newState,
                currentTurn: prevState.currentTurn === 'WHITE' ? 'BLACK' : 'WHITE'
            };

            // Update move history
            const newMoveHistory = moveHistory.slice(0, currentMoveIndex + 1);
            newMoveHistory.push({ from, to, state: nextState });
            setMoveHistory(newMoveHistory);
            setCurrentMoveIndex(currentMoveIndex + 1);
			
			if (isGameOver(nextState)) {
				alert(`Game Over! ${prevState.currentTurn} wins!`);
			}

            return nextState;
        });
    };

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
                <h3>Move History</h3>
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

	const isGameOver = (gameState) => {
		// The game is over if all pieces are of the same color
		const colors = new Set(Object.values(gameState.checkers).map(checker => checker.color));
		return colors.size === 1;
	  };
	  
	  const evaluateBoard = (gameState) => {
		// Count the difference between white and black pieces
		let score = 0;
		for (const checker of Object.values(gameState.checkers)) {
		  score += checker.color === 'WHITE' ? 1 : -1;
		  if (checker.isUpgraded) {
			score += checker.color === 'WHITE' ? 2.5 : -2.5;
		  }
		}
		return score;
	  };
	  
	  const getAllPossibleMoves = (gameState, player) => {
		const possibleMoves = [];
		for (const [from, checker] of Object.entries(gameState.checkers)) {
		  if (checker.color === player) {
			for (const to of gameBoard.vertices) {
			  if (isValidMove(from, to)) {
				possibleMoves.push({ from, to });
			  }
			}
		  }
		}
		return possibleMoves;
	  };
	  
	  const applyMoveToNewState = (gameState, from, to) => {
		const newState = JSON.parse(JSON.stringify(gameState));
		const movedChecker = newState.checkers[from];
		delete newState.checkers[from];
		newState.checkers[to] = movedChecker;
	  
		// Check for upgrades
		if (gameBoard.homeBases.white.includes(to) && movedChecker.color === 'BLACK') {
		  movedChecker.isUpgraded = true;
		} else if (gameBoard.homeBases.black.includes(to) && movedChecker.color === 'WHITE') {
		  movedChecker.isUpgraded = true;
		}
	  
		// Turn over adjacent checkers
		gameBoard.edges.forEach(edge => {
		  if (edge.includes(to)) {
			const adjacentVertex = edge.find(v => v !== to);
			if (newState.checkers[adjacentVertex] && newState.checkers[adjacentVertex].color !== movedChecker.color) {
			  newState.checkers[adjacentVertex].color = movedChecker.color;
			}
		  }
		});
	  
		return newState;
	  };

    const getNextBestMove = (currentGameState, depth = 8, isMaximizingPlayer = true, alpha = -Infinity, beta = Infinity) => {
		const currentPlayer = isMaximizingPlayer ? 'BLACK' : 'WHITE';
	  
		// Base case: if we've reached the maximum depth or the game is over
		if (depth === 0 || isGameOver(currentGameState)) {
		  return { score: evaluateBoard(currentGameState), move: null };
		}
	  
		let bestMove = null;
		let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
	  
		// Get all possible moves for the current player
		const possibleMoves = getAllPossibleMoves(currentGameState, currentPlayer);
	  
		for (const move of possibleMoves) {
		  // Create a new game state by applying the move
		  const newGameState = applyMoveToNewState(currentGameState, move.from, move.to);
	  
		  // Recursively call getNextBestMove for the opponent
		  const { score } = getNextBestMove(newGameState, depth - 1, !isMaximizingPlayer, alpha, beta);
	  
		  // Update best score and move
		  if (isMaximizingPlayer) {
			if (score > bestScore) {
			  bestScore = score;
			  bestMove = move;
			}
			alpha = Math.max(alpha, bestScore);
		  } else {
			if (score < bestScore) {
			  bestScore = score;
			  bestMove = move;
			}
			beta = Math.min(beta, bestScore);
		  }
	  
		  // Alpha-beta pruning
		  if (beta <= alpha) {
			break;
		  }
		}
	  
		return { score: bestScore, move: bestMove };
	};

	return (
		<div>
			<div className="credits">
				By Adam Blvck (<a href="https://adamblvck.com">adamblvck.com</a>)
			</div>
			<div className={`App ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
				<div className={'App-header'} style={{margin: '20px', fontSize:15}}>
					Tarati - A Board Game by George Spencer Brown
				</div>
				<Board
					ref={boardRef}
					boardSize={boardSize}
					vWidth={vWidth}
					gameState={gameState}
					gameBoard={gameBoard}
                    isValidMove={isValidMove}
                    applyMove={applyMove}
				/>
				
				<Sidebar
					// startNewGame={() => setGameState(initializeGameState())}
					// toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
				>
					<button onClick={clearHistory}>
						New Game
					</button>

					<button onClick={() => setIsAI(!isAI)}>
						{isAI ? 'Disable AI' : 'Enable AI'}
					</button>

					{/* <button>
						{evaluateBoard(gameState)}
					</button> */}

					<div
						style={{
							backgroundColor: gameState.currentTurn=='BLACK'? 'black' : 'white',
							color: gameState.currentTurn=='BLACK'? 'white' : 'black',
							padding: '10px',
							margin: '5px',
							border: '1px solid black',
							borderRadius: '15px'
						}}
					>
						Current Turn <br/> { gameState.currentTurn}
					</div>

					<div style={{display:'flex', flexDirection:'row'}}>
                        <button onClick={undoMove} disabled={currentMoveIndex <= 0}>Back</button>
                        <button onClick={redoMove} disabled={currentMoveIndex >= moveHistory.length - 1}>Forward</button>
                        { currentMoveIndex !== moveHistory.length - 1 ? <button onClick={moveToCurrentState} disabled={currentMoveIndex === moveHistory.length - 1}>Move to Current</button> : undefined }
                    </div>
                    {renderMoveHistory()}
					
				</Sidebar>
			</div>
		</div>
	);
};

export default App;