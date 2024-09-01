import React, { useEffect, useRef } from 'react';
import useTurnIndicator from '../hooks/useTurnIndicator';

import './TurnIndicator.css';

const TurnIndicator = ({ currentTurn, vWidth }) => {
	const { isAnimating, animationProgress } = useTurnIndicator(currentTurn);
	const indicatorRef = useRef(null);

	const containerStyle = {
		width: '5px',
		height: '100px',
		overflow: 'hidden',
		border: '1px solid #000',
		marginLeft: vWidth ?? 0,
		marginTop: 84.7
	};

	const sliderStyle = {
		width: '5px',
		height: '100px',
		position: 'absolute',
		transition: 'transform 0.5s ease-in-out',
		transform: `translateY(${currentTurn === 'BLACK' ? '0' : '-100px'})`,
	};

  const blackSquareStyle = {
    width: '5px',
    height: '100px',
    background: 'black',
  };

  const whiteSquareStyle = {
    width: '5px',
    height: '100px',
    background: 'white',
  };

  useEffect(() => {
    if (isAnimating && indicatorRef.current) {
      const slider = indicatorRef.current.querySelector('.slider');
      slider.style.transition = 'none';
      slider.style.transform = `translateY(${currentTurn === 'BLACK' ? '-100px' : '0'})`;
      
      setTimeout(() => {
        slider.style.transition = 'transform 0.5s ease-in-out';
        slider.style.transform = `translateY(${currentTurn === 'BLACK' ? '0' : '-100px'})`;
      }, 50);
    }
  }, [currentTurn, isAnimating]);

  return (
    <div className='turn-indicator-container' ref={indicatorRef} style={containerStyle}>
      <div className="slider" style={sliderStyle}>
        <div style={blackSquareStyle}></div>
        <div style={whiteSquareStyle}></div>
      </div>
    </div>
  );
};

export default TurnIndicator;