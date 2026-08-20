import { useEffect, useState } from 'react';

/**
 * Whether the reader has asked for less motion.
 *
 * `Board.css` already opts its CSS transitions out under
 * `prefers-reduced-motion`, but react-spring drives inline styles from JS and
 * never sees that block — a spring keeps springing. This is the JS half, and it
 * is the first of its kind in the app.
 *
 * Follows the setting live rather than reading it once, because macOS and iOS
 * both let it be toggled without reloading the page.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

export const useReducedMotion = () => {
    const [reduced, setReduced] = useState(
        () => typeof window !== 'undefined'
            && typeof window.matchMedia === 'function'
            && window.matchMedia(QUERY).matches
    );

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const media = window.matchMedia(QUERY);
        const update = (event) => setReduced(event.matches);
        setReduced(media.matches);
        // Safari only grew `addEventListener` on MediaQueryList in 14.
        if (media.addEventListener) {
            media.addEventListener('change', update);
            return () => media.removeEventListener('change', update);
        }
        media.addListener(update);
        return () => media.removeListener(update);
    }, []);

    return reduced;
};

export default useReducedMotion;
