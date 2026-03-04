"""Official Tarati ruleset tests — verifies all 6 patent rule fixes.

Run with:  python -m pytest strategy/engine/test_rules.py -v
      or:  python strategy/engine/test_rules.py
"""

import unittest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from engine.board import (
    VERTICES, EDGES, EDGE_SET, ADJACENCY, HOME_BASES,
    apply_move_to_board, initial_game_state,
)
from engine.ai import (
    is_valid_move, get_all_possible_moves, apply_move_ai,
    is_game_over, get_next_best_move,
    hash_position, check_threefold_repetition, check_fifty_move_rule,
)


def make_state(checkers_spec, turn='WHITE'):
    """Build a game state from a shorthand dict.

    checkers_spec maps vertex → (color,) or (color, upgraded).
    """
    checkers = {}
    for vertex, spec in checkers_spec.items():
        color = spec[0]
        upgraded = spec[1] if len(spec) > 1 else False
        checkers[vertex] = {'color': color, 'isUpgraded': upgraded}
    return {'checkers': checkers, 'currentTurn': turn}


W  = ('WHITE',)
Wu = ('WHITE', True)
B  = ('BLACK',)
Bu = ('BLACK', True)


# ---------------------------------------------------------------------------
# 0. Sanity — board topology
# ---------------------------------------------------------------------------

class TestTopology(unittest.TestCase):

    def test_vertex_count(self):
        self.assertEqual(len(VERTICES), 23)

    def test_edge_count(self):
        self.assertEqual(len(EDGES), 42)

    def test_adjacency_symmetric(self):
        for a, b in EDGES:
            self.assertIn(b, ADJACENCY[a])
            self.assertIn(a, ADJACENCY[b])


# ---------------------------------------------------------------------------
# 1. Pre-adjacency rule (patent §4.1)
# ---------------------------------------------------------------------------

class TestPreAdjacency(unittest.TestCase):

    def test_already_adjacent_not_struck(self):
        """C3→B2: C4 was adjacent to C3 (origin), so C4 must NOT be flipped."""
        state = make_state({'C3': W, 'C4': B}, 'WHITE')

        self.assertIn('C4', ADJACENCY['C3'])
        self.assertIn('C4', ADJACENCY['B2'])

        result, strikes, _ = apply_move_to_board(state, 'C3', 'B2')
        self.assertNotIn('C4', strikes)
        self.assertEqual(result['checkers']['C4']['color'], 'BLACK')

    def test_non_adjacent_is_struck(self):
        """C1→B1: B2 was NOT adjacent to C1, so B2 IS struck."""
        state = make_state({'C1': Wu, 'B2': B}, 'WHITE')

        self.assertNotIn('B2', ADJACENCY['C1'])
        self.assertIn('B2', ADJACENCY['B1'])

        result, strikes, _ = apply_move_to_board(state, 'C1', 'B1')
        self.assertIn('B2', strikes)
        self.assertEqual(result['checkers']['B2']['color'], 'WHITE')

    def test_multi_strike_only_non_adjacent(self):
        """B2→B3: A1 was adjacent to B2, so A1 should NOT be struck."""
        state = make_state({'B2': Wu, 'A1': B, 'C3': B}, 'WHITE')

        self.assertIn('A1', ADJACENCY['B2'])

        result, strikes, _ = apply_move_to_board(state, 'B2', 'B3')
        self.assertNotIn('A1', strikes)
        self.assertEqual(result['checkers']['A1']['color'], 'BLACK')


# ---------------------------------------------------------------------------
# 2. Home-base movement exception (patent §3.2)
# ---------------------------------------------------------------------------

class TestHomeBaseException(unittest.TestCase):

    def test_white_cob_on_home_can_move_any_direction(self):
        state = make_state({'D1': W}, 'WHITE')
        moves = get_all_possible_moves(state)
        destinations = {to_v for _, to_v in moves}
        self.assertIn('D2', destinations)
        self.assertIn('C1', destinations)

    def test_black_cob_on_home_can_move_any_direction(self):
        state = make_state({'D3': B}, 'BLACK')
        moves = get_all_possible_moves(state)
        destinations = {to_v for _, to_v in moves}
        self.assertIn('D4', destinations)
        self.assertIn('C7', destinations)

    def test_cob_off_home_still_forward_only(self):
        state = make_state({'B3': W}, 'WHITE')
        moves = get_all_possible_moves(state)
        self.assertLess(len(moves), 5, "B3 has 5 neighbors but cob shouldn't reach all")


# ---------------------------------------------------------------------------
# 3. Captured on own home-base ≠ immediate promotion (patent §5.2)
# ---------------------------------------------------------------------------

class TestCapturedOnOwnHome(unittest.TestCase):

    def test_black_cob_flipped_on_own_home_not_upgraded(self):
        """BLACK at D3 (Black's home) flipped to WHITE — should NOT auto-upgrade."""
        state = make_state({'B4': Wu, 'D3': B}, 'WHITE')

        self.assertNotIn('D3', ADJACENCY['B4'])
        self.assertIn('D3', ADJACENCY['C7'])

        result, strikes, upgrades = apply_move_to_board(state, 'B4', 'C7')
        self.assertIn('D3', strikes)
        self.assertEqual(result['checkers']['D3']['color'], 'WHITE')
        self.assertFalse(result['checkers']['D3']['isUpgraded'])

    def test_white_cob_flipped_on_own_home_not_upgraded(self):
        """WHITE at D1 (White's home) flipped to BLACK — should NOT auto-upgrade."""
        state = make_state({'C12': Bu, 'D1': W}, 'BLACK')

        self.assertNotIn('D1', ADJACENCY['C12'])
        self.assertIn('D1', ADJACENCY['C1'])

        result, strikes, _ = apply_move_to_board(state, 'C12', 'C1')
        self.assertIn('D1', strikes)
        self.assertEqual(result['checkers']['D1']['color'], 'BLACK')
        self.assertFalse(result['checkers']['D1']['isUpgraded'])

    def test_mover_landing_on_opponent_home_still_upgrades(self):
        """WHITE moves to C7 (Black's home) — mover should upgrade normally."""
        state = make_state({'B4': W}, 'WHITE')
        result, _, upgrades = apply_move_to_board(state, 'B4', 'C7')
        self.assertTrue(result['checkers']['C7']['isUpgraded'])
        self.assertIn('C7', upgrades)


# ---------------------------------------------------------------------------
# 4. Dead pieces & forced promotion (patent §6)
# ---------------------------------------------------------------------------

class TestDeadPieces(unittest.TestCase):

    def test_dead_cob_gets_promotion_when_stuck(self):
        """WHITE cob at D3 with no forward moves gets a promotion option."""
        state = make_state({'D3': W, 'C1': B}, 'WHITE')
        moves = get_all_possible_moves(state)
        promos = [(f, t) for f, t in moves if f == t]
        self.assertGreater(len(promos), 0)
        self.assertEqual(promos[0], ('D3', 'D3'))

    def test_promotion_move_upgrades_piece(self):
        state = make_state({'D3': W, 'C1': B}, 'WHITE')
        result, _, upgrades = apply_move_to_board(state, 'D3', 'D3')
        self.assertTrue(result['checkers']['D3']['isUpgraded'])

    def test_no_promotions_when_normal_moves_exist(self):
        state = initial_game_state()
        moves = get_all_possible_moves(state)
        promos = [(f, t) for f, t in moves if f == t]
        self.assertEqual(len(promos), 0)


# ---------------------------------------------------------------------------
# 5. Sole remaining piece auto-promotion (patent §6.4)
# ---------------------------------------------------------------------------

class TestSoleRemainingPiece(unittest.TestCase):

    def test_sole_cob_auto_promoted_after_strike(self):
        """After strike leaves BLACK with 1 cob, it should auto-promote."""
        # WHITE upgraded at C3, BLACK cobs at C5 and B5.
        # Move C3→C4. C4 adj to C5 (not pre-adjacent to C3) → strike C5.
        # BLACK left with only B5 cob → auto-promote.
        state = make_state({'C3': Wu, 'C5': B, 'B5': B}, 'WHITE')

        self.assertNotIn('C5', ADJACENCY['C3'])

        result, strikes, _ = apply_move_to_board(state, 'C3', 'C4')
        self.assertIn('C5', strikes)
        self.assertEqual(result['checkers']['B5']['color'], 'BLACK')
        self.assertTrue(result['checkers']['B5']['isUpgraded'],
                        "Sole remaining BLACK cob should auto-promote")


# ---------------------------------------------------------------------------
# 6. Draw detection (patent §7.2)
# ---------------------------------------------------------------------------

class TestDrawDetection(unittest.TestCase):

    def test_threefold_repetition(self):
        hashes = ['a', 'b', 'a', 'b', 'a']
        self.assertTrue(check_threefold_repetition(hashes))

    def test_no_threefold(self):
        hashes = ['a', 'b', 'c', 'd', 'a', 'b']
        self.assertFalse(check_threefold_repetition(hashes))

    def test_fifty_move_rule_triggered(self):
        flags = [False] * 100
        self.assertTrue(check_fifty_move_rule(flags))

    def test_fifty_move_rule_with_cob_movement(self):
        flags = [False] * 100
        flags[50] = True
        self.assertFalse(check_fifty_move_rule(flags))

    def test_fifty_move_rule_too_few(self):
        flags = [False] * 99
        self.assertFalse(check_fifty_move_rule(flags))

    def test_hash_deterministic(self):
        state = make_state({'A1': W, 'B1': B}, 'WHITE')
        self.assertEqual(hash_position(state), hash_position(state))

    def test_hash_differs_by_turn(self):
        s1 = make_state({'A1': W, 'B1': B}, 'WHITE')
        s2 = make_state({'A1': W, 'B1': B}, 'BLACK')
        self.assertNotEqual(hash_position(s1), hash_position(s2))


# ---------------------------------------------------------------------------
# 7. AI integration
# ---------------------------------------------------------------------------

class TestAIIntegration(unittest.TestCase):

    def test_ai_returns_valid_move(self):
        state = initial_game_state()
        result = get_next_best_move(state, depth=3, is_maximizing=True, randomize=False)
        self.assertIsNotNone(result['move'])
        from_v, to_v = result['move']
        self.assertTrue(is_valid_move(state, from_v, to_v))

    def test_ai_plays_full_game(self):
        state = initial_game_state()
        move_count = 0
        MAX = 200

        while not is_game_over(state) and move_count < MAX:
            is_max = state['currentTurn'] == 'BLACK'
            result = get_next_best_move(state, depth=3, is_maximizing=is_max, randomize=True)
            if result['move'] is None:
                break
            from_v, to_v = result['move']
            state = apply_move_ai(state, from_v, to_v)
            move_count += 1

        self.assertGreater(move_count, 0)


if __name__ == '__main__':
    unittest.main()
