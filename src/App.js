import React, { useRef, useState, useEffect } from 'react';
import { DndContext, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';

import AI from './AI';
import { gameBoard, applyMoveToBoard } from './GameBoard';
import { useBoardSize } from './hooks/useBoardSize';

import Board from './components/Board';
import Sidebar from './components/Sidebar';
import './App.css';
import Data from './helpers/position';

import TurnIndicator from './components/TurnIndicator';

const PADDING = 20; // Adjustable padding
const isTouchDevice = 'ontouchstart' in window;

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
				const BESTMOVE = AI.getNextBestMove(gameState, 6, true);
				const { move } = BESTMOVE;
				console.log('BESTMOVE', BESTMOVE);
				if ( move ) {
					applyMove( move.from, move.to );
				}
			}
			performAIMove();
		}
		else if (isAI && !stopAI && gameState.currentTurn === 'WHITE') {
			// const performAIMove = async () => {
			// 	await delay();
			// 	const BESTMOVE = AI.getNextBestMove(gameState, 6, false);
			// 	const { move } = BESTMOVE;
			// 	console.log('BESTMOVE', BESTMOVE);
			// 	if ( move ) {
			// 		applyMove( move.from, move.to );
			// 	}
			// }
			// performAIMove();
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

	// UX function to apply move (from -> to) on current board
	const applyMove = (from, to) => {
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
			
			if (AI.isGameOver(nextState)) {
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
				// turn over destination checker
			  	newState.checkers[adjacentVertex].color = movedChecker.color;

				// Check for upgrades
				if (gameBoard.homeBases.white.includes(adjacentVertex) && movedChecker.color === 'BLACK') {
					newState.checkers[adjacentVertex].isUpgraded = true;
				} else if (gameBoard.homeBases.black.includes(adjacentVertex) && movedChecker.color === 'WHITE') {
					newState.checkers[adjacentVertex].isUpgraded = true;
				}
			}
		  }
		});
	  
		return newState;
	  };

	

	return (
		<div
		style={{
			display: 'flex',
			flexDirection: 'row',
			justifyContent: 'center',
			alignItems: 'center',
			width:'100%',
		}}>
			<div className="credits">
				By Adam Blvck (<a href="https://adamblvck.com">adamblvck.com</a>)
			</div>
			<Sidebar
				// startNewGame={() => setGameState(initializeGameState())}
				// toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
			>
				<button onClick={clearHistory} style={{marginTop:65}}>
					New Game
				</button>

				<button onClick={() => setIsAI(!isAI)}>
					{isAI ? 'Disable AI' : 'Enable AI'}
				</button>

				{/* <button>
					{AI.AI.evaluateBoard(gameState)}
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

				<h3>Move History</h3>

				<div style={{display:'flex', flexDirection:'row'}}>
					<button onClick={undoMove} disabled={currentMoveIndex <= 0}>Back</button>
					<button onClick={redoMove} disabled={currentMoveIndex >= moveHistory.length - 1}>Forward</button>
					{ currentMoveIndex !== moveHistory.length - 1 ? <button onClick={moveToCurrentState} disabled={currentMoveIndex === moveHistory.length - 1}>Move to Current</button> : undefined }
				</div>
				{renderMoveHistory()}
				
			</Sidebar>

			<div className={`App ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
				<div className={'App-header'} style={{}}>
					Tarati - A Board Game by George Spencer Brown
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

				{/* viewWidth -> vWidth */}
				<TurnIndicator currentTurn={gameState.currentTurn} vWidth={boardSize/2 + boardSize/4}/>
			</div>
		</div>
	);
};

export default App;