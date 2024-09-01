import react, { useState, useEffect, useCallback } from 'react';

const PADDING = 20; // Assuming PADDING is defined elsewhere

export const useBoardSize = (boardRef) => {
    const [boardSize, setBoardSize] = useState(500);

    const updateSize = useCallback(() => {
        if (boardRef.current) {

            if (boardRef.current.clientWidth > boardRef.current.clientHeight) {
                const size = Math.min(boardRef.current.clientWidth, boardRef.current.clientHeight);
                setBoardSize(size);    
            } else {
                const size = Math.max(boardRef.current.clientWidth, boardRef.current.clientHeight);
                setBoardSize(size);    
            }

            
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