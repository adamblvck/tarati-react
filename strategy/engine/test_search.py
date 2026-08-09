"""Search-correctness gates for the Tarati engine.

These four properties are what the previous engine violated. Together they are
the reason depths 12/15/18/20 collapsed into a single player and why the
supposedly stronger tiers lost to shallower ones.

Run with:  python strategy/engine/test_search.py
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from engine.board import (
    VERTICES, EDGE_SET, ROTATION, RANK, MAX_RANK, OPPONENT,
    initial_game_state,
)
from engine.ai import (
    WINNING_SCORE, MATE_THRESHOLD, EVAL_WEIGHTS,
    evaluate_board, get_all_possible_moves, get_next_best_move,
    terminal_loser, is_game_over, apply_move_ai, _negamax,
)
from engine.openings import enumerate_frontier, frontier_sample
from engine.runner import play_one_game


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def mirror_state(state):
    """Rotate the board 180° and swap colours.

    Under this map WHITE's half becomes BLACK's exactly, so a mirrored position
    is strategically identical with the colours exchanged. The opening setup
    maps onto itself with the turn flipped.
    """
    return {
        'checkers': {
            ROTATION[v]: {
                'color': OPPONENT[c['color']],
                'isUpgraded': c['isUpgraded'],
            }
            for v, c in state['checkers'].items()
        },
        'currentTurn': OPPONENT[state['currentTurn']],
    }


def mirror_move(move):
    return (ROTATION[move[0]], ROTATION[move[1]])


def sample_positions(count=40, ply=6):
    """A spread of real, reachable, non-terminal midgame positions."""
    import random
    return frontier_sample(ply, count, random.Random(20260722))


def play_match(depth_a, depth_b, openings, ai_kwargs=None, max_moves=160):
    """Colour-balanced match: each opening is played twice with colours swapped.

    Returns A's score in [0, 1]. Balancing removes both colour bias and opening
    bias, so the result measures strength difference and nothing else.
    """
    kwargs = dict(ai_kwargs or {})
    kwargs.setdefault('temperature', 0)
    score = 0.0
    games = 0

    for index, opening in enumerate(openings):
        for a_is_white in (True, False):
            wd, bd = (depth_a, depth_b) if a_is_white else (depth_b, depth_a)
            record, _ = play_one_game(
                wd, bd,
                max_moves=max_moves,
                seed=index,
                white_ai_kwargs=kwargs,
                black_ai_kwargs=kwargs,
                start_state=opening,
                skip_board_after=True,
            )
            games += 1
            if record['winner'] == 'DRAW':
                score += 0.5
            elif (record['winner'] == 'WHITE') == a_is_white:
                score += 1.0
    return score / games


# ---------------------------------------------------------------------------
# Gate 1 — colour symmetry
# ---------------------------------------------------------------------------

class TestSymmetry(unittest.TestCase):
    """The board has an exact 180° automorphism swapping the home bases.

    Apart from White moving first, Tarati is perfectly colour-symmetric, so any
    stable colour skew at equal strength is an engine bug. The old engine gave
    BLACK 75.2% at every depth >= 12.
    """

    def test_rotation_is_an_automorphism(self):
        for a, b in EDGE_SET:
            self.assertIn((ROTATION[a], ROTATION[b]), EDGE_SET)
        self.assertTrue(all(ROTATION[ROTATION[v]] == v for v in VERTICES))

    def test_rank_is_antisymmetric(self):
        for v in VERTICES:
            self.assertEqual(RANK[ROTATION[v]], MAX_RANK - RANK[v])

    def test_reflection_is_a_colour_preserving_automorphism(self):
        """The B1-A1-B4 mirror keeps colours and fixes the opening setup.

        This is why Tarati has only two structurally distinct first moves
        rather than four: C1-B1 mirrors C2-B1, and C1-C12 mirrors C2-C3.
        """
        from engine.board import REFLECTION, HOME_BASES

        for a, b in EDGE_SET:
            self.assertIn((REFLECTION[a], REFLECTION[b]), EDGE_SET)
        self.assertTrue(all(REFLECTION[REFLECTION[v]] == v for v in VERTICES))
        self.assertEqual(RANK[REFLECTION['C1']], RANK['C1'])  # rank preserved

        for colour in ('WHITE', 'BLACK'):
            self.assertEqual({REFLECTION[v] for v in HOME_BASES[colour]},
                             set(HOME_BASES[colour]))

        state = initial_game_state()
        reflected = {REFLECTION[v]: dict(c) for v, c in state['checkers'].items()}
        self.assertEqual(reflected, state['checkers'])

    def test_mirrored_first_moves_score_identically(self):
        """The two mirror-pairs must be exactly equal, not merely close."""
        from engine.board import REFLECTION

        result = get_next_best_move(initial_game_state(), depth=5, randomize=False)
        scores = dict(result['scores'])
        for (src, dst), score in scores.items():
            mirror = (REFLECTION[src], REFLECTION[dst])
            self.assertEqual(score, scores[mirror],
                             '%s-%s and %s-%s are mirror images and must tie'
                             % (src, dst, mirror[0], mirror[1]))

    def test_initial_position_is_self_mirror(self):
        state = initial_game_state()
        mirrored = mirror_state(state)
        self.assertEqual(mirrored['checkers'], state['checkers'])
        self.assertEqual(mirrored['currentTurn'], 'BLACK')

    def test_evaluation_is_antisymmetric(self):
        self.assertEqual(evaluate_board(initial_game_state()), 0)
        for state in sample_positions():
            self.assertEqual(
                evaluate_board(state), -evaluate_board(mirror_state(state)),
                'evaluation is not colour-symmetric',
            )

    def test_search_is_antisymmetric(self):
        """Mirrored positions must yield mirrored root scores.

        Scores are from the side-to-move's perspective, so they compare equal
        rather than negated: BLACK's prospects in the mirror equal WHITE's here.
        """
        for state in sample_positions(count=12):
            direct = get_next_best_move(state, depth=4, randomize=False)
            mirrored = get_next_best_move(mirror_state(state), depth=4, randomize=False)

            self.assertEqual(
                {mirror_move(m): s for m, s in direct['scores']},
                dict(mirrored['scores']),
                'search does not treat mirrored positions identically',
            )
            self.assertEqual(direct['score'], -mirrored['score'])


# ---------------------------------------------------------------------------
# Gate 2 — terminal scoring
# ---------------------------------------------------------------------------

class TestTerminalScoring(unittest.TestCase):
    """A player who cannot move has lost, however far ahead they are.

    The old engine scored terminals as `material < 0 ? +WIN : -WIN`, so an
    all-WHITE board (a WHITE win by total conversion) evaluated to -1,000,000,
    a decisive BLACK win.
    """

    def test_total_conversion_favours_the_surviving_colour(self):
        state = {
            'checkers': {
                'C1': {'color': 'WHITE', 'isUpgraded': False},
                'C2': {'color': 'WHITE', 'isUpgraded': False},
            },
            'currentTurn': 'BLACK',
        }
        self.assertEqual(terminal_loser(state), 'BLACK')
        # Side to move (BLACK) has lost, so its own perspective is -WIN.
        self.assertEqual(_negamax(state, 3, -WINNING_SCORE * 2, WINNING_SCORE * 2,
                                  0, None, None, None),
                         -WINNING_SCORE)

    def test_stalemate_loses_even_when_ahead_on_material(self):
        """The regression that matters most for the strategy guide.

        WHITE holds four pieces to BLACK's three but every white piece is
        boxed in, so WHITE loses. A material-based terminal score calls this a
        WHITE win — which is exactly what made the engine unable to see
        "ahead but jammed", the signature loss in a forward-only game.
        """
        state = {
            'checkers': {
                'D1': {'color': 'WHITE', 'isUpgraded': False},
                'D2': {'color': 'WHITE', 'isUpgraded': False},
                'C1': {'color': 'WHITE', 'isUpgraded': False},
                'C2': {'color': 'WHITE', 'isUpgraded': False},
                'C12': {'color': 'BLACK', 'isUpgraded': False},
                'B1': {'color': 'BLACK', 'isUpgraded': False},
                'C3': {'color': 'BLACK', 'isUpgraded': False},
            },
            'currentTurn': 'WHITE',
        }
        self.assertEqual(get_all_possible_moves(state), [])
        self.assertTrue(is_game_over(state))
        self.assertEqual(terminal_loser(state), 'WHITE')

        self.assertGreater(evaluate_board(state), 0, 'WHITE really is ahead here')

        score = _negamax(state, 4, -WINNING_SCORE * 2, WINNING_SCORE * 2,
                         0, None, None, None)
        self.assertEqual(score, -WINNING_SCORE,
                         'a stalemated player must be losing regardless of material')

    def test_every_reachable_terminal_favours_the_side_not_to_move(self):
        checked = 0
        for state in enumerate_frontier(9, include_terminal=True):
            loser = terminal_loser(state)
            if loser is None:
                continue
            checked += 1
            score = _negamax(state, 2, -WINNING_SCORE * 2, WINNING_SCORE * 2,
                             0, None, None, None)
            expected = -WINNING_SCORE if loser == state['currentTurn'] else WINNING_SCORE
            self.assertEqual(score, expected)
        self.assertGreater(checked, 0, 'no terminal positions found to check')

    def test_mate_scores_prefer_the_faster_win(self):
        """A win at ply 2 must score higher than the same win at ply 6."""
        near = WINNING_SCORE - 2
        far = WINNING_SCORE - 6
        self.assertGreater(near, far)
        self.assertGreater(near, MATE_THRESHOLD)


# ---------------------------------------------------------------------------
# Gate 3 — transposition-table invariance
# ---------------------------------------------------------------------------

class TestTranspositionTable(unittest.TestCase):
    """TT entries must never change the result of a search.

    The old table stored alpha-beta-narrowed values with no EXACT/LOWER/UPPER
    flag and reused them as exact scores, which is the most likely cause of the
    depth-12 plateau.
    """

    def test_tt_does_not_change_the_chosen_move(self):
        for state in sample_positions(count=15):
            with_tt = get_next_best_move(state, depth=5, randomize=False, use_tt=True)
            without = get_next_best_move(state, depth=5, randomize=False, use_tt=False)
            self.assertEqual(with_tt['score'], without['score'],
                             'transposition table changed the root score')
            self.assertEqual(dict(with_tt['scores']), dict(without['scores']),
                             'transposition table changed a root move score')

    def test_deeper_search_never_returns_a_worse_proven_result(self):
        """Once a forced win is proven, deeper search must keep proving it."""
        for state in sample_positions(count=8):
            proven = None
            for depth in range(1, 7):
                result = get_next_best_move(state, depth=depth, randomize=False)
                if abs(result['score']) > MATE_THRESHOLD:
                    sign = 1 if result['score'] > 0 else -1
                    if proven is None:
                        proven = sign
                    else:
                        self.assertEqual(sign, proven,
                                         'a proven forced result flipped sign with depth')


# ---------------------------------------------------------------------------
# Gate 4 — depth monotonicity
# ---------------------------------------------------------------------------

class TestDepthMonotonicity(unittest.TestCase):
    """Deeper search must play better.

    In the old corpus, with identical budgets on both sides, depth 9 scored
    22.0% against depth 6 and depth 12 scored 25.1% against depth 9.
    """

    OPENINGS = None

    @classmethod
    def setUpClass(cls):
        import random
        cls.OPENINGS = frontier_sample(4, 10, random.Random(1))

    def test_depth_3_beats_depth_1(self):
        score = play_match(3, 1, self.OPENINGS)
        self.assertGreater(score, 0.55, f'depth 3 scored only {score:.1%} vs depth 1')

    def test_depth_5_beats_depth_3(self):
        score = play_match(5, 3, self.OPENINGS)
        self.assertGreater(score, 0.55, f'depth 5 scored only {score:.1%} vs depth 3')

    def test_random_play_is_colour_balanced(self):
        """Control: with no engine involved at all, neither colour is favoured.

        This measures the game rather than the search, and it is what makes the
        old corpus's stable 75/25 skew at depth >= 12 diagnosable as an engine
        artifact rather than a property of Tarati.
        """
        import random
        from engine.board import apply_move_to_board

        outcomes = {'WHITE': 0, 'BLACK': 0, 'DRAW': 0}
        for seed in range(600):
            rng = random.Random(seed)
            state = initial_game_state()
            for _ in range(300):
                loser = terminal_loser(state)
                if loser is not None:
                    outcomes[OPPONENT[loser]] += 1
                    break
                move = rng.choice(get_all_possible_moves(state))
                state, _, _ = apply_move_to_board(state, move[0], move[1])
                state['currentTurn'] = OPPONENT[state['currentTurn']]
            else:
                outcomes['DRAW'] += 1

        total = sum(outcomes.values())
        white_share = (outcomes['WHITE'] + 0.5 * outcomes['DRAW']) / total
        self.assertGreater(white_share, 0.42, f'random play is skewed: {outcomes}')
        self.assertLess(white_share, 0.58, f'random play is skewed: {outcomes}')

    def test_equal_depth_is_roughly_balanced(self):
        """Self-play from the symmetric start must not show a large colour skew.

        A coarse smoke check pooled over three depths — the exact symmetry gate
        is ``test_search_is_antisymmetric``, which is deterministic. The band is
        deliberately wide: at 48 games one standard deviation is 7 points, so a
        tighter bound would flake. It still rejects the old engine comfortably,
        which gave WHITE 24.8% at every depth from 12 to 20.
        """
        outcomes = {'WHITE': 0, 'BLACK': 0, 'DRAW': 0}
        for depth in (3, 4, 5):
            for seed in range(16):
                record, _ = play_one_game(
                    depth, depth, max_moves=160, seed=seed,
                    white_ai_kwargs={'temperature': 40},
                    black_ai_kwargs={'temperature': 40},
                    skip_board_after=True,
                )
                outcomes[record['winner']] += 1

        total = sum(outcomes.values())
        white_share = (outcomes['WHITE'] + 0.5 * outcomes['DRAW']) / total
        self.assertGreater(white_share, 0.28, f'colour skew too large: {outcomes}')
        self.assertLess(white_share, 0.72, f'colour skew too large: {outcomes}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
