import Data from './helpers/position';
import { gameBoard, applyMoveToBoard } from './GameBoard';

// Constants for evaluation
const WINNING_SCORE = 1000000;
const UPGRADE_SCORE = 50;
const CONTROL_CENTER_SCORE = 30;
const MOBILITY_SCORE = 5;

// Transposition table for caching evaluated positions
const transpositionTable = new Map();

function getNextBestMove(currentGameState, depth = 8, isMaximizingPlayer = true, alpha = -Infinity, beta = Infinity) {
  const currentPlayer = isMaximizingPlayer ? 'BLACK' : 'WHITE';
  
  // Check transposition table
  const boardHash = hashBoard(currentGameState);
  if (transpositionTable.has(boardHash)) {
    const cachedResult = transpositionTable.get(boardHash);
    if (cachedResult.depth >= depth) {
      return cachedResult.result;
    }
  }

  // Base case: if we've reached the maximum depth or the game is over
  if (depth === 0 || isGameOver(currentGameState)) {
    const score = evaluateBoard(currentGameState);
    return { score: isGameOver(currentGameState) ? (score < 0 ? WINNING_SCORE : -WINNING_SCORE) : score, move: null };
  }
  
  let bestMove = null;
  let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
  
  // Get all possible moves for the current player
  const possibleMoves = getAllPossibleMoves(currentGameState);

  // Sort moves to improve alpha-beta pruning
  sortMoves(possibleMoves, currentGameState, isMaximizingPlayer);

  for (const move of possibleMoves) {
    // Create a new game state by applying the move
    const newGameState = ApplyMoveAI(currentGameState, move.from, move.to);
  
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

  // Store result in transposition table
  transpositionTable.set(boardHash, { depth, result: { score: bestScore, move: bestMove } });
  
  return { score: bestScore, move: bestMove };
}

// Helper function to hash the board state
function hashBoard(gameState) {
  return JSON.stringify(gameState.checkers);
}

// Helper function to sort moves for better alpha-beta pruning
function sortMoves(moves, gameState, isMaximizingPlayer) {
  moves.sort((a, b) => {
    const scoreA = quickEvaluate(ApplyMoveAI(gameState, a.from, a.to));
    const scoreB = quickEvaluate(ApplyMoveAI(gameState, b.from, b.to));
    return isMaximizingPlayer ? scoreB - scoreA : scoreA - scoreB;
  });
}

// Quick evaluation function for move sorting
function quickEvaluate(gameState) {
  let score = 0;
  for (const [position, checker] of Object.entries(gameState.checkers)) {
    score += checker.color === 'BLACK' ? 1 : -1;
    if (checker.isUpgraded) {
      score += checker.color === 'BLACK' ? 0.5 : -0.5;
    }
  }
  return score;
}

const isGameOver = (gameState) => {
  // If no more possible moves are possible
  const possibleMoves = getAllPossibleMoves(gameState);
  if (possibleMoves.length === 0) {
    return true;
  }

  // The game is over if all pieces are of the same color
  const colors = new Set(Object.values(gameState.checkers).map(checker => checker.color));
  return colors.size === 1;
};

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

const getAllPossibleMoves = (gameState) => {
  const possibleMoves = [];
  for (const [from, checker] of Object.entries(gameState.checkers)) {
    if (checker.color === gameState.currentTurn) {
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
  return {
    ...newState,
    currentTurn: boardState.currentTurn === 'WHITE' ? 'BLACK' : 'WHITE'
  };
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
		const fromY = Data.getPosition(from, {w:500/2,h:500}, 250 ).y;
		const toY = Data.getPosition(to, {w:500/2,h:500}, 250 ).y;
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
	getAllPossibleMoves,
	ApplyMoveAI,
	isValidMove
}
