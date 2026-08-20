/**
 * Recover the move that turned one position into the next, by diffing them.
 *
 * The board never tells the renderer what was played. Locally that is only an
 * inconvenience; online it is the whole problem — the opponent's move arrives
 * on a poll as a fresh `boardState` with no indication of what changed, so
 * several pieces appear to change at once and nothing can be animated.
 *
 * It does not need to be told. `applyMoveToBoard` moves exactly one piece and
 * every rule after that mutates `color` or `isUpgraded` **in place**: a strike
 * turns a piece over where it stands (§4), promotion changes rank (§5), and the
 * sole-remaining-piece rule (§6.4) changes rank. So for any ordinary move,
 * exactly one vertex loses its occupant and exactly one gains one, and the pair
 * is unambiguous.
 *
 * Returns `null` for anything that is not a single ply — an undo, a jump to the
 * end of a replay, a poll that caught up several moves at once, or a board that
 * simply has not changed. Callers should snap rather than invent a path that was
 * never played.
 */
export const diffMove = (prev, next) => {
    if (!prev?.checkers || !next?.checkers) return null;

    const before = prev.checkers;
    const after = next.checkers;

    const vacated = Object.keys(before).filter((vertex) => !after[vertex]);
    const filled = Object.keys(after).filter((vertex) => !before[vertex]);

    // Pieces that changed hands. The mover is never among them: its origin is
    // empty afterwards and its destination was empty before, so neither vertex
    // appears on both sides of the comparison.
    const struck = [];
    for (const [vertex, was] of Object.entries(before)) {
        const now = after[vertex];
        if (now && now.color !== was.color) struck.push(vertex);
    }

    if (vacated.length === 1 && filled.length === 1) {
        return { from: vacated[0], to: filled[0], struck, promotion: false };
    }

    if (vacated.length === 0 && filled.length === 0) {
        // Patent §6.3 — a dead cob promoted where it stands, in lieu of a move.
        // Nothing travels, so there is nothing to slide, but it is still a ply
        // and the caller may want to mark it.
        const promoted = Object.keys(after).filter(
            (vertex) => before[vertex] && !before[vertex].isUpgraded && after[vertex].isUpgraded
        );
        if (promoted.length === 1 && struck.length === 0) {
            return { from: promoted[0], to: promoted[0], struck: [], promotion: true };
        }
    }

    return null;
};

export default diffMove;
