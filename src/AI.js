import Data from './helpers/position';

import { gameBoard, applyMoveToBoard } from './GameBoard';

function getNextBestMove(currentGameState, depth = 8, isMaximizingPlayer = true) {
	const currentPlayer = isMaximizingPlayer ? 'BLACK' : 'WHITE';
  
	// console.log("currentGameState depth", currentPlayer, depth, isGameOver(currentGameState));

	// Base case: if we've reached the maximum depth or the game is over
	if (depth == 0 || isGameOver(currentGameState)) {
		const score = evaluateBoard(currentGameState);
		return { score: isGameOver(currentGameState) ? (score < 0 ? WINNING_SCORE : -WINNING_SCORE) : score, move: null };
	}
  
	let bestMove = null;
	let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
  
	// Get all possible moves for the current player
	const possibleMoves = getAllPossibleMoves(currentGameState, currentPlayer);

	for (const move of possibleMoves) {
		// const _t = {
		// 	...currentGameState,
		// 	currentTurn: currentPlayer
		// }

		const newGameState = ApplyMoveAI(currentGameState, move.from, move.to);
	
		// Recursively call getNextBestMove for the opponent
		const { score } = getNextBestMove(newGameState, depth - 1, !isMaximizingPlayer);
  
		// Create a new game state by applying the move

	  // Update best score and move
	  if (isMaximizingPlayer) {
		if (score > bestScore) {
		  bestScore = score;
		  bestMove = move;
		}
	  } else {
		if (score < bestScore) {
		  bestScore = score;
		  bestMove = move;
		}
	  }
	}
  
	return { score: bestScore, move: bestMove };
}

const isGameOver = (gameState) => {
	// The game is over if all pieces are of the same color
	const colors = new Set(Object.values(gameState.checkers).map(checker => checker.color));
	return colors.size === 1;
};
  
const WINNING_SCORE = 1000000;
const UPGRADE_SCORE = 50;
const CONTROL_CENTER_SCORE = 30;
const MOBILITY_SCORE = 5;

const evaluateBoard = (gameState) => {
	let score = 0;
	let whitePieces = 0;
	let blackPieces = 0;
	let whiteUpgrades = 0;
	let blackUpgrades = 0;

	for (const [position, checker] of Object.entries(gameState.checkers)) {
		const pieceValue = checker.isUpgraded ? 1.5 : 1;
		
		if (checker.color === 'WHITE') {
			whitePieces += pieceValue;
			if (checker.isUpgraded) whiteUpgrades++;
		} else {
			blackPieces += pieceValue;
			if (checker.isUpgraded) blackUpgrades++;
		}
	}

	score += (whitePieces - blackPieces) * 97;
	score += (whiteUpgrades - blackUpgrades) * 117;

	return score;
};

const countMoves = (gameState, position) => {
	return gameBoard.edges.filter(edge => 
	edge.includes(position) && !gameState.checkers[edge.find(v => v !== position)]
	).length;
};
  
const getAllPossibleMoves = (gameState, player) => {
	const possibleMoves = [];
	for (const [from, checker] of Object.entries(gameState.checkers)) {
		if (checker.color === player) {
			for (const to of gameBoard.vertices) {
				if (isValidMove(gameState, from, to)) {
					possibleMoves.push({ from, to });
				}
			}
		}
	}
	return possibleMoves;
};

  const ApplyMoveAI = (boardState, from, to) => {
		
	const newState = applyMoveToBoard(boardState, from, to);

	const nextState = {
		...newState,
		currentTurn: boardState.currentTurn === 'WHITE' ? 'BLACK' : 'WHITE'
	};
	
	return nextState;
}

const isValidMove = (_gameState, from, to) => {

	// same square is not a move
	if (from == to ) return false;

	// Implement move validation logic
	const isValidEdge = gameBoard.edges.some(edge => 
		(edge[0] === from && edge[1] === to) || (edge[1] === from && edge[0] === to)
	);
	// check if move is single step
	if (!isValidEdge) return false;

	// Check if the from vertex has a checker
	const checker = _gameState.checkers[from];
	if (!checker) return false;

	// Check if the destination is empty (can't stack)
	if (_gameState.checkers[to]) return false;

	// if not current turn - not allowed
	if (checker.color !== _gameState.currentTurn) return false;

	// Check if the move is forward (for non-upgraded checkers)
	if (!checker.isUpgraded) {
		const upwardForWhite = checker.color === 'WHITE' ? 1 : -1;
		const fromY = Data.getPosition(from, 500, 250 ).y;
		const toY = Data.getPosition(to, 500, 250 ).y;
		if (checker.color === 'WHITE' && (fromY - toY > 10)) return true;
		else
			if (checker.color === 'BLACK' && (toY - fromY > 10)) return true;
		else
			return false;
	}

	return true;
};

export default {
	getNextBestMove,
	isGameOver,
	evaluateBoard,
	countMoves,
	getAllPossibleMoves,
	ApplyMoveAI,
	isValidMove
}
