// Define the game board structure
export const gameBoard = {
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

// Pre-computed adjacency list (shared by GameBoard and AI)
export const ADJACENCY = {};
for (const vertex of gameBoard.vertices) {
	ADJACENCY[vertex] = [];
}
for (const [a, b] of gameBoard.edges) {
	ADJACENCY[a].push(b);
	ADJACENCY[b].push(a);
}

// Edge set for O(1) move validity check
export const EDGE_SET = new Set();
for (const [a, b] of gameBoard.edges) {
	EDGE_SET.add(`${a}|${b}`);
	EDGE_SET.add(`${b}|${a}`);
}

export const applyMoveToBoard = (prevState, from, to) => { 
	let newState = JSON.parse(JSON.stringify(prevState));

	// Dead piece promotion: from === to means in-place upgrade (patent §6.3)
	if (from === to) {
		if (newState.checkers[from]) {
			newState.checkers[from].isUpgraded = true;
		}
		return newState;
	}

	const movedChecker = newState.checkers[from];
	delete newState.checkers[from];
	newState.checkers[to] = movedChecker;

	// Pre-adjacency rule (patent §4.1): positions adjacent to the mover's
	// origin cannot be struck — the attacker must approach from distance.
	const fromNeighbors = new Set(ADJACENCY[from]);

	// Mover upgrade: landing on the opponent's home base (patent §5.1)
	if (gameBoard.homeBases.white.includes(to) && movedChecker.color === 'BLACK') {
		movedChecker.isUpgraded = true;
	} else if (gameBoard.homeBases.black.includes(to) && movedChecker.color === 'WHITE') {
		movedChecker.isUpgraded = true;
	}

	// Strike: flip adjacent opponent pieces (patent §4)
	for (const adjacentVertex of ADJACENCY[to]) {
		// Pre-adjacency rule: skip pieces that were already adjacent before the move
		if (fromNeighbors.has(adjacentVertex)) continue;

		const target = newState.checkers[adjacentVertex];
		if (target && target.color !== movedChecker.color) {
			const originalColor = target.color;
			target.color = movedChecker.color;

			// Captured-on-own-home exception (patent §5.2): a piece captured
			// while sitting on its own home base is NOT immediately promoted.
			const originalHome = gameBoard.homeBases[originalColor.toLowerCase()];
			if (!originalHome.includes(adjacentVertex)) {
				if (gameBoard.homeBases.white.includes(adjacentVertex) && target.color === 'BLACK') {
					target.isUpgraded = true;
				} else if (gameBoard.homeBases.black.includes(adjacentVertex) && target.color === 'WHITE') {
					target.isUpgraded = true;
				}
			}
		}
	}

	// Sole remaining piece must be promoted (patent §6.4)
	const colorCounts = { WHITE: { total: 0, cobVertex: null }, BLACK: { total: 0, cobVertex: null } };
	for (const [vertex, checker] of Object.entries(newState.checkers)) {
		colorCounts[checker.color].total++;
		if (!checker.isUpgraded) {
			colorCounts[checker.color].cobVertex = vertex;
		}
	}
	for (const color of ['WHITE', 'BLACK']) {
		const cc = colorCounts[color];
		if (cc.total === 1 && cc.cobVertex !== null) {
			newState.checkers[cc.cobVertex].isUpgraded = true;
		}
	}

	return newState;
}