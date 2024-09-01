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

export const applyMoveToBoard = (prevState, from, to) => { 
	let newState = JSON.parse(JSON.stringify(prevState));
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

					// console.log("BEST MOVE -->", movedChecker)

					if (newState.checkers[adjacentVertex] && newState.checkers[adjacentVertex].color !== movedChecker?.color) {
							newState.checkers[adjacentVertex].color = movedChecker?.color;

							

							// Check for upgrades
							if (gameBoard.homeBases.white.includes(adjacentVertex) && newState.checkers[adjacentVertex].color === 'BLACK') {
									newState.checkers[adjacentVertex].isUpgraded = true;
							} else if (gameBoard.homeBases.black.includes(adjacentVertex) && newState.checkers[adjacentVertex].color === 'WHITE') {
									newState.checkers[adjacentVertex].isUpgraded = true;
							}

					}
			}
	});

	return newState;
}