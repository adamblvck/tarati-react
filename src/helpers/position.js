const getPosition = (vertexId, {w:width, h:height}, vWidth) => {
    const centerX = width / 2;
    const centerY = height / 2;

    if (vertexId === 'A1') {
        return { x: centerX, y: centerY };
    }

    const [type, ...rest] = vertexId;
    const position = parseInt(rest.join(''), 10);

    switch (type) {
        case 'B':
            const angleB = (position - 1) * (Math.PI / 3);
            return {
                x: centerX + vWidth * Math.cos(angleB + Math.PI / 2),
                y: centerY + vWidth * Math.sin(angleB + Math.PI / 2)
            };
        case 'C':
            const angleC = (position - 1) * (Math.PI / 6) - Math.PI  / 12 + Math.PI / 2;
            const radiusC = vWidth * (1 + Math.sqrt(11/13)) - Math.PI  / 12 + Math.PI / 2;
            return {
                x: centerX + radiusC * Math.cos(angleC),
                y: centerY + radiusC * Math.sin(angleC)
            };
        case 'D':
            const down = position > 2 ? -1 : 1;
            const left = position == 1 || position == 4  ? 1 : -1;

            return {
                x: centerX + vWidth/2/left,
                y: centerY + vWidth*3*down
            };
        default:
            return { x: centerX, y: centerY };
    }
};

export default { getPosition };