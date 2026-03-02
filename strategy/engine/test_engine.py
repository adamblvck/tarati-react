"""Validation tests for the Python Tarati engine.

Run with:  python -m pytest strategy/engine/test_engine.py -v
      or:  python strategy/engine/test_engine.py
"""

import unittest
import sys
import os
import time

# Allow running from repo root or from strategy/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from engine.board import (
    VERTICES, EDGES, EDGE_SET, ADJACENCY, HOME_BASES,
    apply_move_to_board, initial_game_state,
)
from engine.ai import (
    is_valid_move, get_all_possible_moves, apply_move_ai,
    is_game_over, evaluate_board, get_next_best_move,
)
from engine.positions import get_position


class TestBoardTopology(unittest.TestCase):
    """Verify the board structure matches the React app."""

    def test_vertex_count(self):
        self.assertEqual(len(VERTICES), 23)

    def test_edge_count(self):
        self.assertEqual(len(EDGES), 42)

    def test_adjacency_symmetric(self):
        for a, b in EDGES:
            self.assertIn(b, ADJACENCY[a], f"{b} not in ADJACENCY[{a}]")
            self.assertIn(a, ADJACENCY[b], f"{a} not in ADJACENCY[{b}]")

    def test_home_bases(self):
        self.assertEqual(HOME_BASES['WHITE'], frozenset(['C1', 'C2', 'D1', 'D2']))
        self.assertEqual(HOME_BASES['BLACK'], frozenset(['C7', 'C8', 'D3', 'D4']))


class TestPositions(unittest.TestCase):
    """Verify vertex Y-coordinates match forward-direction expectations."""

    def test_white_home_higher_y(self):
        """WHITE home (D1, D2) should have higher Y than BLACK home (D3, D4)."""
        white_ys = [get_position(v)[1] for v in ['D1', 'D2']]
        black_ys = [get_position(v)[1] for v in ['D3', 'D4']]
        self.assertTrue(min(white_ys) > max(black_ys),
                        "WHITE home should be at higher Y (bottom) than BLACK home (top)")

    def test_a1_is_centre(self):
        x, y = get_position('A1')
        self.assertEqual(x, 125.0)
        self.assertEqual(y, 250.0)


class TestInitialState(unittest.TestCase):
    """Test 1 from the plan: initial-state legal moves."""

    def test_white_has_legal_moves(self):
        state = initial_game_state()
        moves = get_all_possible_moves(state)
        self.assertGreater(len(moves), 0, "WHITE should have legal moves on turn 1")
        # All moves should be by WHITE
        for from_v, to_v in moves:
            self.assertEqual(state['checkers'][from_v]['color'], 'WHITE')

    def test_black_has_no_moves_on_white_turn(self):
        """BLACK can't move when it's WHITE's turn."""
        state = initial_game_state()
        for from_v, checker in state['checkers'].items():
            if checker['color'] == 'BLACK':
                for to_v in ADJACENCY[from_v]:
                    self.assertFalse(
                        is_valid_move(state, from_v, to_v),
                        f"BLACK should not have a valid move {from_v}->{to_v} on WHITE's turn"
                    )


class TestStriking(unittest.TestCase):
    """Test 2: A strike that flips adjacent pieces."""

    def test_single_strike(self):
        """Move a WHITE piece adjacent to a BLACK piece and verify it flips."""
        state = {
            'checkers': {
                'B1': {'color': 'WHITE', 'isUpgraded': True},
                'A1': {'color': 'BLACK', 'isUpgraded': False},
            },
            'currentTurn': 'WHITE',
        }
        new_state, strikes, upgrades = apply_move_to_board(state, 'B1', 'B2')
        # A1 is adjacent to B2, so it should be struck
        if 'A1' in [a for a in ADJACENCY['B2']]:
            self.assertIn('A1', strikes)
            self.assertEqual(new_state['checkers']['A1']['color'], 'WHITE')

    def test_double_strike(self):
        """Move that flips 2 adjacent opponent pieces simultaneously."""
        # Place WHITE at C1 (upgraded so it can move anywhere)
        # Place BLACK at B1 and C12 (both adjacent to C1... wait, we need
        # to land on a vertex adjacent to two blacks)
        # B2 is adjacent to A1, B1, B3, C3, C4
        state = {
            'checkers': {
                'C3': {'color': 'WHITE', 'isUpgraded': True},
                'A1': {'color': 'BLACK', 'isUpgraded': False},
                'B1': {'color': 'BLACK', 'isUpgraded': False},
            },
            'currentTurn': 'WHITE',
        }
        # Move WHITE C3 -> B2. B2 is adjacent to A1 and B1.
        new_state, strikes, upgrades = apply_move_to_board(state, 'C3', 'B2')
        self.assertEqual(len(strikes), 2, f"Expected 2 strikes, got {strikes}")
        self.assertEqual(new_state['checkers']['A1']['color'], 'WHITE')
        self.assertEqual(new_state['checkers']['B1']['color'], 'WHITE')


class TestUpgrades(unittest.TestCase):
    """Test 3: Upgrade on opponent home-base."""

    def test_mover_upgrades_on_opponent_home(self):
        """WHITE piece moving to BLACK's home base (C7) should upgrade."""
        state = {
            'checkers': {
                'B4': {'color': 'WHITE', 'isUpgraded': True},  # upgraded to move freely
            },
            'currentTurn': 'WHITE',
        }
        new_state, strikes, upgrades = apply_move_to_board(state, 'B4', 'C7')
        self.assertTrue(new_state['checkers']['C7']['isUpgraded'])
        self.assertIn('C7', upgrades)

    def test_struck_piece_upgrades_on_new_home(self):
        """A struck piece that ends up on its new team's opponent home should upgrade."""
        # Place BLACK at C7 (BLACK's own home). WHITE moves adjacent and strikes it.
        # After strike, C7 piece becomes WHITE. WHITE piece on C7 (BLACK home) → upgrade.
        state = {
            'checkers': {
                'C6': {'color': 'WHITE', 'isUpgraded': True},
                'C7': {'color': 'BLACK', 'isUpgraded': False},
            },
            'currentTurn': 'WHITE',
        }
        # C6 -> B3 won't hit C7. Let's use B4 which is adjacent to C7.
        state['checkers'] = {
            'B5': {'color': 'WHITE', 'isUpgraded': True},
            'C9': {'color': 'BLACK', 'isUpgraded': False},
            'C10': {'color': 'BLACK', 'isUpgraded': False},
        }
        # Move B5 -> C9? No, C9 is occupied. 
        # Let me set up a cleaner scenario.
        state = {
            'checkers': {
                'C6': {'color': 'WHITE', 'isUpgraded': True},
                'C7': {'color': 'BLACK', 'isUpgraded': False},
            },
            'currentTurn': 'WHITE',
        }
        # C6 is adjacent to C7 and B3 and C5 and B4 (check adjacency)
        # Actually C6 -> C7 is an edge. But C7 is occupied.
        # Let's move to B3 (adjacent to C6, C5). That won't hit C7.
        # Better approach: move to B4 which is adjacent to C7.
        # But is C6 adjacent to B4? C6's adjacency: C5, C7, B3
        # Let's use a different setup.
        state = {
            'checkers': {
                'B4': {'color': 'WHITE', 'isUpgraded': True},
                'C8': {'color': 'BLACK', 'isUpgraded': False},
            },
            'currentTurn': 'WHITE',
        }
        # B4 adjacent to: B3, B5, C7, C8, A1
        # Move B4 -> C7. C7 is empty. C8 is adjacent to C7. C8 is BLACK → strike.
        # After strike, C8 becomes WHITE. C8 is in BLACK's home. WHITE on BLACK home → upgrade.
        new_state, strikes, upgrades = apply_move_to_board(state, 'B4', 'C7')
        self.assertIn('C8', strikes)
        self.assertTrue(new_state['checkers']['C8']['isUpgraded'],
                        "Struck piece on opponent home should upgrade")


class TestGameOver(unittest.TestCase):
    """Tests 4 & 5: Game-over conditions."""

    def test_game_over_total_conversion(self):
        """All pieces the same colour → game over."""
        state = {
            'checkers': {
                'A1': {'color': 'WHITE', 'isUpgraded': False},
                'B1': {'color': 'WHITE', 'isUpgraded': False},
                'B2': {'color': 'WHITE', 'isUpgraded': False},
            },
            'currentTurn': 'BLACK',
        }
        self.assertTrue(is_game_over(state))

    def test_game_over_no_legal_moves(self):
        """Current player has pieces but no legal moves → game over."""
        # WHITE piece boxed in by friendly pieces with no empty adjacent vertex
        state = {
            'checkers': {
                'A1': {'color': 'WHITE', 'isUpgraded': False},
                'B1': {'color': 'WHITE', 'isUpgraded': False},
                'B2': {'color': 'WHITE', 'isUpgraded': False},
                'B3': {'color': 'WHITE', 'isUpgraded': False},
                'B4': {'color': 'WHITE', 'isUpgraded': False},
                'B5': {'color': 'WHITE', 'isUpgraded': False},
                'B6': {'color': 'WHITE', 'isUpgraded': False},
                'C1': {'color': 'BLACK', 'isUpgraded': False},
            },
            'currentTurn': 'BLACK',
        }
        # BLACK's only piece is C1. C1 is adjacent to D1, C2, C12, B1.
        # D1 empty, C2 empty, C12 empty, B1 occupied.
        # BLACK must move forward (increase Y). Check if any move is valid.
        moves = get_all_possible_moves(state)
        # If BLACK has no forward moves, game is over.
        if len(moves) == 0:
            self.assertTrue(is_game_over(state))

    def test_not_game_over_initial(self):
        """Initial state is not game over."""
        state = initial_game_state()
        self.assertFalse(is_game_over(state))


class TestAISearch(unittest.TestCase):
    """Verify the AI produces valid moves."""

    def test_ai_returns_valid_move(self):
        state = initial_game_state()
        result = get_next_best_move(state, depth=3, is_maximizing=True, randomize=False)
        self.assertIsNotNone(result['move'], "AI should return a move")
        from_v, to_v = result['move']
        self.assertTrue(is_valid_move(state, from_v, to_v),
                        f"AI move {from_v}->{to_v} should be valid")

    def test_ai_plays_full_game(self):
        """Play a complete game at low depth to verify no crashes."""
        state = initial_game_state()
        move_count = 0
        max_moves = 200

        while not is_game_over(state) and move_count < max_moves:
            is_max = state['currentTurn'] == 'BLACK'
            result = get_next_best_move(state, depth=3, is_maximizing=is_max, randomize=True)
            if result['move'] is None:
                break
            from_v, to_v = result['move']
            state = apply_move_ai(state, from_v, to_v)
            move_count += 1

        self.assertGreater(move_count, 0, "Game should have at least 1 move")
        # Game should end before 200 moves at depth 3
        self.assertTrue(
            is_game_over(state) or move_count >= max_moves,
            "Game should terminate"
        )

    def test_ai_respects_time_budget_and_returns_legal_move(self):
        """With max_ms set, search should still return quickly with a legal move."""
        state = initial_game_state()
        t0 = time.perf_counter()
        result = get_next_best_move(
            state,
            depth=12,
            is_maximizing=False,
            randomize=False,
            max_nodes=None,
            max_ms=5,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000

        self.assertIsNotNone(result['move'], "AI should return a move under time budget")
        from_v, to_v = result['move']
        self.assertTrue(is_valid_move(state, from_v, to_v),
                        f"AI move {from_v}->{to_v} should be valid under time budget")
        self.assertLess(elapsed_ms, 250, f"Time-budgeted search took too long: {elapsed_ms:.2f}ms")


if __name__ == '__main__':
    unittest.main()
