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
const delay = () => new Promise(resolve => setTimeout(resolve, 100));

const difficultyToDepth = {
	'Easy': 3,
	'Medium': 6,
	'Hard': 9,
	'Champion': 12
  };

const App = () => {

	const [gameState, setGameState] = useState(initializeGameState());
	const [isDarkMode, setIsDarkMode] = useState(true);
	const [moveHistory, setMoveHistory] = useState([]);
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
	const [isAI, setIsAI] = useState(true); // AI on by default
	const [stopAI, setStopAI] = useState(false); // AI on by default

	const [difficulty, setDifficulty] = useState('Medium');

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

		console.log("Applying the miracle", gameState);
		
		// Perform AI MOVE
		if (isAI && !stopAI && gameState.currentTurn == 'BLACK') {
			const performAIMove = async () => {
				await delay();
				const BESTMOVE = AI.getNextBestMove(gameState, difficultyToDepth[difficulty], true);
				const { move } = BESTMOVE;
				console.log('BESTMOVE BLACK', BESTMOVE);
				if ( move ) {
					applyMove( move.from, move.to );
				}
			}
			performAIMove();
		}
		else if (isAI && !stopAI && gameState.currentTurn == 'WHITE') {
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
	}, [gameState]);

	// UX function to apply move (from -> to) on current board
	const applyMove = (from, to) => {
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

				<div className="form"
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
			</div>
		</div>
	);
};

export default App;