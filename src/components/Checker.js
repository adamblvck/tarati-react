// components/Checker.js
import React from 'react';
import { useDraggable } from '@dnd-kit/core';

const Checker = ({ id, color, isUpgraded }) => {
	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: id,
	});

	const style = transform ? {
		transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
	} : undefined;

	return (
		<g
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
		>
			<circle r="8" fill={color.toLowerCase()} />
			{isUpgraded && (
				<circle r="4" fill="gold" />
			)}
		</g>
	);
};

export default Checker;