import Data from './helpers/position';
import { gameBoard, applyMoveToBoard, ADJACENCY, EDGE_SET } from './GameBoard';

// Constants for evaluation
const WINNING_SCORE = 1000000;
const ROOT_PROBE_NODES = 50;
const HARD_MAX_NODES = 15000;
const EXPERT_MAX_NODES = 25000;

// Outermost home-base positions where non-upgraded cobs become dead (patent §6.1)
const DEAD_POSITIONS = {
  WHITE: ['D3', 'D4'],
  BLACK: ['D1', 'D2'],
};

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
  const normalMoves = [];
  for (const [from, checker] of Object.entries(gameState.checkers)) {
    if (checker.color === gameState.currentTurn) {
      for (const to of ADJACENCY[from]) {
        if (isValidMove(gameState, from, to)) {
          normalMoves.push({ from, to });
        }
      }
    }
  }
  if (normalMoves.length > 0) return normalMoves;

  // No normal moves — check for dead piece promotions (patent §6.3).
  // A player stuck with only dead cobs may promote one to a rok.
  const promotions = [];
  for (const [vertex, checker] of Object.entries(gameState.checkers)) {
    if (checker.color !== gameState.currentTurn) continue;
    if (checker.isUpgraded) continue;
    const deadPos = DEAD_POSITIONS[checker.color];
    if (!deadPos || !deadPos.includes(vertex)) continue;
    const hasExit = ADJACENCY[vertex].some(adj => !gameState.checkers[adj]);
    if (hasExit) {
      promotions.push({ from: vertex, to: vertex, isPromotion: true });
    }
  }
  return promotions;
};

const ApplyMoveAI = (boardState, from, to) => {
  const newState = applyMoveToBoard(boardState, from, to);
  return {
    ...newState,
    currentTurn: boardState.currentTurn === 'WHITE' ? 'BLACK' : 'WHITE'
  };
}

// -- Draw detection utilities (patent §7.2) --------------------------------

// Hash a position for repetition tracking (same as internal hashBoard)
const hashPosition = (gameState) => {
  const sortedPieces = Object.entries(gameState.checkers)
    .map(([vertex, checker]) => [vertex, checker.color, checker.isUpgraded])
    .sort((a, b) => (a[0] > b[0] ? 1 : -1));
  return JSON.stringify([gameState.currentTurn, sortedPieces]);
};

// Threefold repetition: returns true if the given position hash has appeared >= 3 times
const checkThreefoldRepetition = (positionHashes) => {
  const counts = {};
  for (const h of positionHashes) {
    counts[h] = (counts[h] || 0) + 1;
    if (counts[h] >= 3) return true;
  }
  return false;
};

// 50-move rule: returns true if 50+ consecutive move-pairs had no cob movement or promotion.
// cobMovedFlags is a boolean[] parallel to the move history, true when a cob was moved or promoted.
const checkFiftyMoveRule = (cobMovedFlags) => {
  if (cobMovedFlags.length < 100) return false;
  const last100 = cobMovedFlags.slice(-100);
  return last100.every(flag => !flag);
};

const isValidMove = (_gameState, from, to) => {
	if (from === to) return false;

	if (!EDGE_SET.has(`${from}|${to}`)) return false;

	const checker = _gameState.checkers[from];
	if (!checker) return false;

	if (_gameState.checkers[to]) return false;

	if (checker.color !== _gameState.currentTurn) return false;

	// Roks (upgraded pieces) can move in any direction (patent §3.3)
	if (checker.isUpgraded) return true;

	// Home-base exception: cobs starting on their own home base
	// can move in any direction (patent §3.2)
	const ownHome = checker.color === 'WHITE'
		? gameBoard.homeBases.white
		: gameBoard.homeBases.black;
	if (ownHome.includes(from)) return true;

	// Forward-only for regular cobs (patent §3.1)
	const fromY = POSITION_Y[from];
	const toY = POSITION_Y[to];
	if (checker.color === 'WHITE' && (fromY - toY > 10)) return true;
	if (checker.color === 'BLACK' && (toY - fromY > 10)) return true;

	return false;
};

const AI = {
	getNextBestMove,
	isGameOver,
	evaluateBoard,
	getAllPossibleMoves,
	ApplyMoveAI,
	isValidMove,
	hashPosition,
	checkThreefoldRepetition,
	checkFiftyMoveRule,
};

export default AI;
