// App.js
import React, { useState, useEffect } from 'react';
import { DndContext, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import Board from './components/Board';
import Sidebar from './components/Sidebar';
import './App.css';

const isTouchDevice = 'ontouchstart' in window;

// Define the game board structure
const gameBoard = {
	vertices: [
		'A1',
		'B1', 'B2', 'B3', 'B4', 'B5', 'B6',
		'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12',
		'D1', 'D2', 'D3', 'D4'
	],
	edges: [
		['D1', 'C1'], ['C1', 'C2'], ['C2', 'D2'],
		['C1', 'C12'], ['C2', 'C3'],
		['C12', 'B6'], ['C3', 'B1'],
		['C11', 'B6'], ['B1', 'B2'],
		['C10', 'B4'], ['B2', 'B3'],
		['C9', 'B4'], ['B3', 'B2'],
		['C8', 'D4'], ['B3', 'C7'],
		['D4', 'C7'], ['C7', 'C6'],
		['C6', 'B2'], ['C6', 'C5'],
		['C5', 'B2'], ['C5', 'C4'],
		['C4', 'B1'], ['C4', 'D3'],
		['D3', 'C8']
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

const App = () => {
	const [gameState, setGameState] = useState(initializeGameState());
	const [isDarkMode, setIsDarkMode] = useState(true);

    console.log(gameState, isDarkMode)

    const mouseSensor = useSensor(MouseSensor);
	const touchSensor = useSensor(TouchSensor);
	const sensors = useSensors(mouseSensor, touchSensor);

	useEffect(() => {
        console.log("KURWA")
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

	const isValidMove = (from, to) => {
		// Implement move validation logic
		const isValidEdge = gameBoard.edges.some(edge => 
			(edge[0] === from && edge[1] === to) || (edge[1] === from && edge[0] === to)
		);

		if (!isValidEdge) return false;

		const checker = gameState.checkers[from];
		if (!checker) return false;

		// Check if the move is forward (for non-upgraded checkers)
		if (!checker.isUpgraded) {
			const forwardDirection = checker.color === 'WHITE' ? 1 : -1;
			const fromIndex = gameBoard.vertices.indexOf(from);
			const toIndex = gameBoard.vertices.indexOf(to);
			if (toIndex * forwardDirection <= fromIndex * forwardDirection) return false;
		}

		// Check if the destination is empty
		if (gameState.checkers[to]) return false;

		return true;
	};

	const applyMove = (from, to) => {
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

			return newState;
		});
	};

    const handleDragEnd = (event) => {
		const { active, over } = event;
		
		if (over && isValidMove(active.id, over.id)) {
			applyMove(active.id, over.id);
		}
	};

	return (
		<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
			<div className={`App ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
				<Board
					gameState={gameState}
					gameBoard={gameBoard}
				/>
				<Sidebar
					startNewGame={() => setGameState(initializeGameState())}
					toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
				/>
			</div>
		</DndContext>
	);
};

export default App;