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
 *
 * The patent's first claim about the board is that "all lines are of equal
 * length — stopping points are equally spaced from all adjacent stopping
 * points". This layout satisfies it; the previous one did not, by 12.9%. Two
 * things were wrong:
 *
 *   1. The circumference radius read
 *      `vWidth * (1 + sqrt(11/13)) - PI/12 + PI/2`. That trailing
 *      `- PI/12 + PI/2` is a copy-paste of the *angle* expression two lines up,
 *      added to a *radius* — an absolute number of pixels, so the board's
 *      proportions drifted with `vWidth` as well as being slightly wrong at any
 *      size. The circumradius of a regular dodecagon of side `vWidth` is
 *      `vWidth / (2 sin 15°)`.
 *   2. The domestic points sat at exactly `3 * vWidth` from the centre, which
 *      left the four D–C pathways 13% longer than every other line. One pathway
 *      beyond C1's height puts them right.
 *
 * `helpers/__tests__/position.test.js` asserts all 42 pathways are now equal.
 * `strategy/guide/figures.py` mirrors this formula for the print booklet and
 * carries the same correction.
 */

/** Circumradius of a regular dodecagon whose side is 1. */
const CIRCUMFERENCE_RADIUS = 1 / (2 * Math.sin(Math.PI / 12));

/**
 * How far the domestic points sit from the centre, in units of vWidth: one
 * pathway beyond the height of C1, so D–C is the same length as everything else.
 */
const DOMESTIC_OFFSET = CIRCUMFERENCE_RADIUS * Math.sin((5 * Math.PI) / 12) + 1;

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
        case 'B': {
            const angleB = (position - 1) * (Math.PI / 3);
            return orient({
                x: centerX + vWidth * Math.cos(angleB + Math.PI / 2),
                y: centerY + vWidth * Math.sin(angleB + Math.PI / 2)
            });
        }
        case 'C': {
            const angleC = (position - 1) * (Math.PI / 6) - Math.PI / 12 + Math.PI / 2;
            const radiusC = vWidth * CIRCUMFERENCE_RADIUS;
            return orient({
                x: centerX + radiusC * Math.cos(angleC),
                y: centerY + radiusC * Math.sin(angleC)
            });
        }
        case 'D': {
            const down = position > 2 ? -1 : 1;
            const left = position === 1 || position === 4 ? 1 : -1;

            return orient({
                x: centerX + (vWidth / 2) * left,
                y: centerY + vWidth * DOMESTIC_OFFSET * down
            });
        }
        default:
            return { x: centerX, y: centerY };
    }
};

const Data = { getPosition, CIRCUMFERENCE_RADIUS, DOMESTIC_OFFSET };
export default Data;
