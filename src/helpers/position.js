/**
 * Screen position of a vertex.
 *
 * `flip` rotates the layout 180° about the board's centre, so the player's own
 * home base sits at the bottom and their pieces advance upward — the view a
 * Black player expects. That rotation is the board's own automorphism (the same
 * one the engine's evaluation is built to be antisymmetric under), so a flipped
 * board is geometrically identical, just seen from the other side.
 *
 * Rotating the *coordinates* rather than applying an SVG transform matters:
 * a transform would turn the vertex labels upside down too.
 */
const getPosition = (vertexId, { w: width, h: height }, vWidth, flip = false) => {
    const centerX = width / 2;
    const centerY = height / 2;

    const orient = ({ x, y }) =>
        flip ? { x: 2 * centerX - x, y: 2 * centerY - y } : { x, y };

    if (vertexId === 'A1') {
        return { x: centerX, y: centerY };
    }

    const [type, ...rest] = vertexId;
    const position = parseInt(rest.join(''), 10);

    switch (type) {
        case 'B':
            const angleB = (position - 1) * (Math.PI / 3);
            return orient({
                x: centerX + vWidth * Math.cos(angleB + Math.PI / 2),
                y: centerY + vWidth * Math.sin(angleB + Math.PI / 2)
            });
        case 'C':
            const angleC = (position - 1) * (Math.PI / 6) - Math.PI  / 12 + Math.PI / 2;
            const radiusC = vWidth * (1 + Math.sqrt(11/13)) - Math.PI  / 12 + Math.PI / 2;
            return orient({
                x: centerX + radiusC * Math.cos(angleC),
                y: centerY + radiusC * Math.sin(angleC)
            });
        case 'D':
            const down = position > 2 ? -1 : 1;
            const left = position === 1 || position === 4  ? 1 : -1;

            return orient({
                x: centerX + vWidth/2/left,
                y: centerY + vWidth*3*down
            });
        default:
            return { x: centerX, y: centerY };
    }
};

const Data = { getPosition };
export default Data;
