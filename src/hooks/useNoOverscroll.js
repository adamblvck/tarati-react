import { useEffect } from 'react';

/**
 * Suppress overscroll chaining (Android pull-to-refresh, iOS rubber-band) for
 * as long as the calling component is mounted.
 *
 * This is scoped to a mount rather than set globally in CSS because it should
 * only apply where a stray vertical swipe is destructive. On the online game
 * page the board sits at scroll-top zero on a phone, which puts pull-to-refresh
 * exactly one gesture away from reloading a live game.
 */
const useNoOverscroll = () => {
	useEffect(() => {
		const { style } = document.body;
		const previous = style.overscrollBehaviorY;
		style.overscrollBehaviorY = 'contain';
		return () => { style.overscrollBehaviorY = previous; };
	}, []);
};

export default useNoOverscroll;
