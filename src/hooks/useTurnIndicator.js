import React, { useState, useEffect } from 'react';

const useTurnIndicator = (currentTurn) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);

	useEffect(()=>{
		setIsAnimating(true);
		setAnimationProgress(0);
	},[currentTurn])

	useEffect(() => {
		let animationFrame;
		if (isAnimating) {
		const animate = () => {
			setAnimationProgress((prev) => {
			if (prev < 100) {
				animationFrame = requestAnimationFrame(animate);
				return prev + 2; // Adjust for faster/slower animation
			}
			setIsAnimating(false);
			return 100;
			});
		};
		animationFrame = requestAnimationFrame(animate);
		}
		return () => cancelAnimationFrame(animationFrame);
	}, [isAnimating]);

  return { isAnimating, animationProgress };
};

export default useTurnIndicator;