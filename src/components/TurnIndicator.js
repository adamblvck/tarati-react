import React from 'react';

import './TurnIndicator.css';

/**
 * Whose turn it is, stated in words under the board.
 *
 * This replaces a 5px black-and-white sliver pinned to the right edge with
 * `position: fixed` — which GamePage's react-spring `transform` on `.game-area`
 * silently turned into `position: absolute` anyway, so it did not even sit
 * where it claimed to. On a phone nobody could tell whose move it was, and a
 * board that looks inert reads as a board that is broken.
 */
const TurnIndicator = ({ currentTurn, yourMove = false }) => {
	const isWhite = currentTurn === 'WHITE';

	return (
		<div className="turn-strip" role="status" aria-live="polite">
			<span className={`turn-swatch ${isWhite ? 'is-white' : 'is-black'}`} aria-hidden="true" />
			<span className="turn-label">{isWhite ? 'White' : 'Black'} to move</span>
			{yourMove ? <span className="turn-note">your move</span> : null}
		</div>
	);
};

export default TurnIndicator;
