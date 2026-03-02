import Data from './helpers/position';
import { gameBoard, applyMoveToBoard } from './GameBoard';

// Constants for evaluation
const WINNING_SCORE = 1000000;
const ROOT_PROBE_NODES = 50;
const HARD_MAX_NODES = 15000;
const EXPERT_MAX_NODES = 25000;

const EDGE_SET = new Set();
const ADJACENCY = {};
for (const vertex of gameBoard.vertices) {
  ADJACENCY[vertex] = [];
}
for (const [a, b] of gameBoard.edges) {
  EDGE_SET.add(`${a}|${b}`);
  EDGE_SET.add(`${b}|${a}`);
  ADJACENCY[a].push(b);
  ADJACENCY[b].push(a);
}

const POSITION_Y = {};
for (const vertex of gameBoard.vertices) {
  POSITION_Y[vertex] = Data.getPosition(vertex, { w: 500 / 2, h: 500 }, 250).y;
}

function defaultMaxNodes(depth) {
  if (depth >= 12) return EXPERT_MAX_NODES;
  if (depth >= 9) return HARD_MAX_NODES;
  return null;
}

function isBudgetExhausted(searchContext) {
  if (!searchContext) return false;
  if (searchContext.maxNodes !== null && searchContext.nodes >= searchContext.maxNodes) return true;
  if (searchContext.probeLimit !== null && searchContext.nodes >= searchContext.probeLimit) return true;
  if (searchContext.deadline !== null && performance.now() >= searchContext.deadline) return true;
  return false;
}

function weightedTopChoice(candidates, isMaximizingPlayer) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const direction = isMaximizingPlayer ? 1 : -1;
  const adjustedScores = candidates.map(([, score]) => direction * score);
  const maxScore = Math.max(...adjustedScores);
  const weights = adjustedScores.map((score) => Math.exp(score - maxScore));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let pick = Math.random() * totalWeight;
  for (let i = 0; i < candidates.length; i += 1) {
    pick -= weights[i];
    if (pick <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function minimax(gameState, depth, isMaximizingPlayer, alpha, beta, transpositionTable, searchContext = null) {
  if (searchContext) {
    if (isBudgetExhausted(searchContext)) {
      return { score: evaluateBoard(gameState), move: null, cutoff: true };
    }
    searchContext.nodes += 1;
  }

  const boardHash = hashBoard(gameState);
  const cachedResult = transpositionTable.get(boardHash);
  if (cachedResult && cachedResult.depth >= depth) {
    return { score: cachedResult.result.score, move: cachedResult.result.move, cutoff: false };
  }

  const gameOver = isGameOver(gameState);
  if (depth === 0 || gameOver) {
    const score = evaluateBoard(gameState);
    return {
      score: gameOver ? (score < 0 ? WINNING_SCORE : -WINNING_SCORE) : score,
      move: null,
      cutoff: false
    };
  }

  let bestMove = null;
  let bestScore = isMaximizingPlayer ? -Infinity : Infinity;
  let cutoff = false;
  const possibleMoves = getAllPossibleMoves(gameState);
  sortMoves(possibleMoves, gameState, isMaximizingPlayer);

  for (const move of possibleMoves) {
    if (isBudgetExhausted(searchContext)) {
      cutoff = true;
      break;
    }

    const newGameState = ApplyMoveAI(gameState, move.from, move.to);
    const result = minimax(
      newGameState,
      depth - 1,
      !isMaximizingPlayer,
      alpha,
      beta,
      transpositionTable,
      searchContext
    );
    const { score } = result;
    cutoff = cutoff || !!result.cutoff;

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

  if (!bestMove) {
    return { score: evaluateBoard(gameState), move: null, cutoff: true };
  }

  const result = { score: bestScore, move: bestMove, cutoff };
  if (!cutoff) {
    transpositionTable.set(boardHash, { depth, result: { score: bestScore, move: bestMove } });
  }
  return result;
}

function getNextBestMove(
  currentGameState,
  depth = 8,
  isMaximizingPlayer = true,
  options = {}
) {
  const {
    randomize = true,
    maxNodes = defaultMaxNodes(depth),
    maxMs = null,
    rootProbeNodes = ROOT_PROBE_NODES,
    stochasticTopK = 3
  } = options;

  const transpositionTable = new Map();
  const possibleMoves = getAllPossibleMoves(currentGameState);
  if (possibleMoves.length === 0) {
    return { score: 0, move: null };
  }
  sortMoves(possibleMoves, currentGameState, isMaximizingPlayer);

  const shouldUseBudgetedSearch = maxNodes !== null || maxMs !== null;
  if (!shouldUseBudgetedSearch) {
    let alpha = -Infinity;
    let beta = Infinity;
    const scoredMoves = [];

    for (const move of possibleMoves) {
      const newGameState = ApplyMoveAI(currentGameState, move.from, move.to);
      const result = minimax(newGameState, depth - 1, !isMaximizingPlayer, alpha, beta, transpositionTable);
      scoredMoves.push([move, result.score]);

      if (isMaximizingPlayer) alpha = Math.max(alpha, result.score);
      else beta = Math.min(beta, result.score);
    }

    const bestScore = isMaximizingPlayer
      ? Math.max(...scoredMoves.map(([, score]) => score))
      : Math.min(...scoredMoves.map(([, score]) => score));

    const bestMoves = scoredMoves.filter(([, score]) => score === bestScore).map(([move]) => move);
    const chosenMove = randomize
      ? bestMoves[Math.floor(Math.random() * bestMoves.length)]
      : bestMoves[0];
    return { score: bestScore, move: chosenMove };
  }

  const searchContext = {
    nodes: 0,
    maxNodes,
    probeLimit: null,
    deadline: maxMs === null ? null : performance.now() + Math.max(maxMs, 0)
  };

  const moveStats = new Map(
    possibleMoves.map((move) => {
      const nextState = ApplyMoveAI(currentGameState, move.from, move.to);
      return [move, { score: evaluateBoard(nextState), depth: 0, cutoff: false }];
    })
  );

  for (let currentDepth = 1; currentDepth <= depth; currentDepth += 1) {
    for (const move of possibleMoves) {
      if (isBudgetExhausted(searchContext)) break;

      const probeBudget = maxNodes === null
        ? rootProbeNodes
        : Math.min(rootProbeNodes, Math.max(0, maxNodes - searchContext.nodes));
      searchContext.probeLimit = searchContext.nodes + probeBudget;

      const newGameState = ApplyMoveAI(currentGameState, move.from, move.to);
      const result = minimax(
        newGameState,
        currentDepth - 1,
        !isMaximizingPlayer,
        -Infinity,
        Infinity,
        transpositionTable,
        searchContext
      );
      moveStats.set(move, {
        score: result.score,
        depth: currentDepth,
        cutoff: !!result.cutoff
      });
    }

    searchContext.probeLimit = null;
    if (isBudgetExhausted(searchContext)) break;
  }

  const deepestDepth = Math.max(...Array.from(moveStats.values()).map((entry) => entry.depth));
  const depthCandidates = Array.from(moveStats.entries())
    .filter(([, entry]) => entry.depth === deepestDepth)
    .map(([move, entry]) => [move, entry.score]);

  const ordered = depthCandidates.sort((a, b) =>
    isMaximizingPlayer ? b[1] - a[1] : a[1] - b[1]
  );
  const bestScore = ordered[0][1];

  let chosenMove = ordered[0][0];
  if (randomize) {
    if (ordered.length > 1 && stochasticTopK > 1) {
      const topCandidates = ordered.slice(0, stochasticTopK);
      const picked = weightedTopChoice(topCandidates, isMaximizingPlayer);
      chosenMove = picked ? picked[0] : ordered[0][0];
    } else {
      const bestMoves = ordered.filter(([, score]) => score === bestScore).map(([move]) => move);
      chosenMove = bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }
  }

  return { score: bestScore, move: chosenMove };
}

// Helper function to hash the board state
function hashBoard(gameState) {
  const sortedPieces = Object.entries(gameState.checkers)
    .map(([vertex, checker]) => [vertex, checker.color, checker.isUpgraded])
    .sort((a, b) => (a[0] > b[0] ? 1 : -1));
  return JSON.stringify([gameState.currentTurn, sortedPieces]);
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
  for (const checker of Object.values(gameState.checkers)) {
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

  for (const checker of Object.values(gameState.checkers)) {
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
      for (const to of ADJACENCY[from]) {
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
	if (from === to ) return false;

	// Implement move validation logic
	const isValidEdge = EDGE_SET.has(`${from}|${to}`);
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
		const fromY = POSITION_Y[from];
		const toY = POSITION_Y[to];
		if (checker.color === 'WHITE' && (fromY - toY > 10)) return true;
		else
			if (checker.color === 'BLACK' && (toY - fromY > 10)) return true;
		else
			return false;
	}

	return true;
};

const AI = {
	getNextBestMove,
	isGameOver,
	evaluateBoard,
	getAllPossibleMoves,
	ApplyMoveAI,
	isValidMove
};

export default AI;
