import react, { useState, useEffect, useCallback } from 'react';

const PADDING = 20; // Assuming PADDING is defined elsewhere

export const useBoardSize = (boardRef) => {
    const [boardSize, setBoardSize] = useState(500);

    const updateSize = useCallback(() => {
        if (boardRef.current) {
            const size = Math.min(boardRef.current.clientWidth, boardRef.current.clientHeight);
            setBoardSize(size);
        }
    }, [boardRef]);

    useEffect(() => {
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, [updateSize]);

    const vWidth = (boardSize - 2 * PADDING) / 6;

    return { boardSize, vWidth };
};