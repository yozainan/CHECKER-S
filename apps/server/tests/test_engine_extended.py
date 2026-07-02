"""
Extended test suite for CheckersEngine.

Covers:
  - Board initialisation (piece counts, positions)
  - Slide moves (forward only for men, all dirs for kings)
  - Capture moves (mandatory capture rule)
  - Multi-jump chains
  - King promotion (Red → row 0, Black → row 7)
  - King movement (backward slides and backward captures)
  - Win condition (no moves available)
  - Turn management
  - get_all_valid_moves helper
  - get_piece_owner / is_king helpers
  - get_state serialisation
  - reset()
"""
import copy
import unittest
from app.engine import CheckersEngine


class TestInitialState(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()

    def test_turn_is_red(self):
        self.assertEqual(self.e.turn, "R")

    def test_no_winner_at_start(self):
        self.assertIsNone(self.e.winner)

    def test_active_jumper_none_at_start(self):
        self.assertIsNone(self.e.active_jumper)

    def test_red_piece_count(self):
        count = sum(1 for r in range(8) for c in range(8) if self.e.board[r][c] == "R")
        self.assertEqual(count, 12)

    def test_black_piece_count(self):
        count = sum(1 for r in range(8) for c in range(8) if self.e.board[r][c] == "B")
        self.assertEqual(count, 12)

    def test_middle_rows_empty(self):
        for r in range(3, 5):
            for c in range(8):
                self.assertEqual(self.e.board[r][c], "")

    def test_red_only_on_dark_squares(self):
        for r in range(5, 8):
            for c in range(8):
                if (r + c) % 2 == 1:
                    self.assertEqual(self.e.board[r][c], "R")
                else:
                    self.assertEqual(self.e.board[r][c], "")

    def test_black_only_on_dark_squares(self):
        for r in range(3):
            for c in range(8):
                if (r + c) % 2 == 1:
                    self.assertEqual(self.e.board[r][c], "B")
                else:
                    self.assertEqual(self.e.board[r][c], "")


class TestSlides(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()

    def test_red_slides_upward(self):
        ok = self.e.make_move(5, 0, 4, 1)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[4][1], "R")
        self.assertEqual(self.e.board[5][0], "")

    def test_red_cannot_slide_backward(self):
        # Red man at (5,0) cannot go to (6,1) – backward
        ok = self.e.make_move(5, 0, 6, 1)
        self.assertFalse(ok)

    def test_black_slides_downward(self):
        # Manually set turn to Black to allow Black to move
        self.e.turn = "B"
        ok = self.e.make_move(2, 1, 3, 0)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[3][0], "B")
        self.assertEqual(self.e.board[2][1], "")

    def test_black_cannot_slide_backward(self):
        self.e.turn = "B"
        ok = self.e.make_move(2, 1, 1, 0)
        self.assertFalse(ok)

    def test_slide_to_occupied_cell_fails(self):
        ok = self.e.make_move(5, 2, 6, 1)  # (6,1) is already Red
        self.assertFalse(ok)

    def test_slide_switches_turn(self):
        self.e.make_move(5, 0, 4, 1)
        self.assertEqual(self.e.turn, "B")


class TestCaptures(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()

    def test_basic_capture_removes_opponent(self):
        # Place Black at (4,3) so Red at (5,2) can jump
        self.e.board[4][3] = "B"
        ok = self.e.make_move(5, 2, 3, 4)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[5][2], "")
        self.assertEqual(self.e.board[4][3], "")   # captured
        self.assertEqual(self.e.board[3][4], "R")

    def test_slide_allowed_when_jump_exists(self):
        # Rule change: captures are no longer mandatory.
        # A plain slide must SUCCEED even when a jump is available.
        # (The huff rule, handled by the server, penalises the skipped capture.)
        self.e.board[4][3] = "B"   # Red at (5,2) can jump to (3,4)
        ok = self.e.make_move(5, 0, 4, 1)   # slide a DIFFERENT piece
        self.assertTrue(ok, "Slide must be allowed even when a jump exists")

    def test_capture_switches_turn_when_no_further_jumps(self):
        self.e.board[4][3] = "B"
        self.e.make_move(5, 2, 3, 4)
        self.assertEqual(self.e.turn, "B")

    def test_cannot_jump_own_piece(self):
        # Red at (5,2), Red at (4,3) → no jump to (3,4)
        self.e.board[4][3] = "R"
        ok = self.e.make_move(5, 2, 3, 4)
        self.assertFalse(ok)


class TestMultiJump(unittest.TestCase):
    def setUp(self):
        # Build a fresh board with only the pieces we need
        self.e = CheckersEngine()
        # Clear the board entirely
        self.e.board = [['' for _ in range(8)] for _ in range(8)]

    def _place(self, piece, r, c):
        self.e.board[r][c] = piece

    def test_multi_jump_stays_same_turn(self):
        """Red at (7,0) can chain: capture (6,1)→(5,2) and then (4,3)→(3,4)."""
        self._place("R", 7, 0)
        self._place("B", 6, 1)  # first victim
        self._place("B", 4, 3)  # second victim
        self.e.turn = "R"

        # First jump
        ok = self.e.make_move(7, 0, 5, 2)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[6][1], "")  # captured
        self.assertEqual(self.e.board[5][2], "R")
        # Turn must NOT have switched
        self.assertEqual(self.e.turn, "R")
        self.assertEqual(self.e.active_jumper, (5, 2))

        # Second jump (continuing with the same piece)
        ok = self.e.make_move(5, 2, 3, 4)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[4][3], "")  # captured
        self.assertEqual(self.e.board[3][4], "R")
        # No more jumps → turn switches
        self.assertEqual(self.e.turn, "B")
        self.assertIsNone(self.e.active_jumper)

    def test_multi_jump_locked_piece_only(self):
        """During a multi-jump, only the active piece may be moved."""
        self._place("R", 7, 0)
        self._place("B", 6, 1)
        self._place("B", 4, 3)
        self._place("R", 7, 4)  # another Red piece
        self.e.turn = "R"

        # First jump with R@(7,0)
        self.e.make_move(7, 0, 5, 2)
        self.assertEqual(self.e.active_jumper, (5, 2))

        # Trying to move the OTHER red piece must fail
        ok = self.e.make_move(7, 4, 6, 5)
        self.assertFalse(ok)


class TestKingPromotion(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()
        self.e.board = [['' for _ in range(8)] for _ in range(8)]

    def test_red_promoted_on_row_0(self):
        self.e.board[1][2] = "R"
        self.e.board[0][3] = ""
        self.e.turn = "R"
        ok = self.e.make_move(1, 2, 0, 3)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[0][3], "RK")

    def test_black_promoted_on_row_7(self):
        self.e.board[6][3] = "B"
        self.e.board[7][4] = ""
        self.e.turn = "B"
        ok = self.e.make_move(6, 3, 7, 4)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[7][4], "BK")

    def test_promotion_ends_turn_when_no_further_jumps(self):
        """Promoting mid-chain ends the turn only when no further captures are possible."""
        self.e.board = [['' for _ in range(8)] for _ in range(8)]
        self.e.board[2][1] = "R"
        self.e.board[1][2] = "B"
        self.e.board[0][3] = ""
        self.e.turn = "R"
        ok = self.e.make_move(2, 1, 0, 3)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[0][3], "RK")  # promoted
        self.assertEqual(self.e.turn, "B")           # turn ended (no more jumps)
        self.assertIsNone(self.e.active_jumper)

    def test_promotion_ends_turn_even_if_jump_available(self):
        """A newly promoted queen ends its turn even if jump targets exist."""
        # Setup: R at (2,1), jumps B at (1,2) → promotes at (0,3)
        # Then as a flying king can jump B at (1,4) → land at (2,5)
        self.e.board = [['' for _ in range(8)] for _ in range(8)]
        self.e.board[2][1] = "R"
        self.e.board[1][2] = "B"   # first victim
        self.e.board[1][4] = "B"   # second victim (reachable diagonally from (0,3))
        self.e.board[0][3] = ""
        self.e.board[2][5] = ""
        self.e.turn = "R"

        ok = self.e.make_move(2, 1, 0, 3)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[0][3], "RK")  # promoted
        self.assertEqual(self.e.turn, "B")          # turn switched (chain ends)
        self.assertIsNone(self.e.active_jumper)     # no active jumper


class TestKingMovement(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()
        self.e.board = [['' for _ in range(8)] for _ in range(8)]

    def test_king_slides_backward(self):
        """RK at (3,3) can slide to (4,4) (backward for Red)."""
        self.e.board[3][3] = "RK"
        self.e.turn = "R"
        ok = self.e.make_move(3, 3, 4, 4)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[4][4], "RK")

    def test_king_captures_backward(self):
        """RK at (3,3) can jump over BK at (4,4) to land at (5,5)."""
        self.e.board[3][3] = "RK"
        self.e.board[4][4] = "BK"
        self.e.board[5][5] = ""
        self.e.turn = "R"
        ok = self.e.make_move(3, 3, 5, 5)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[4][4], "")    # captured
        self.assertEqual(self.e.board[5][5], "RK")

    def test_black_king_slides_upward(self):
        """BK at (5,5) can slide to (4,4) (backward for Black)."""
        self.e.board[5][5] = "BK"
        self.e.turn = "B"
        ok = self.e.make_move(5, 5, 4, 4)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[4][4], "BK")


class TestWinCondition(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()
        self.e.board = [['' for _ in range(8)] for _ in range(8)]

    def test_red_wins_when_black_has_no_pieces(self):
        # Only one Black piece; Red captures it
        self.e.board[4][3] = "B"
        self.e.board[5][2] = "R"
        self.e.turn = "R"
        self.e.make_move(5, 2, 3, 4)
        self.assertEqual(self.e.winner, "R")

    def test_black_wins_when_red_has_no_pieces(self):
        self.e.board[3][4] = "R"
        self.e.board[2][3] = "B"
        self.e.turn = "B"
        self.e.make_move(2, 3, 4, 5)
        self.assertEqual(self.e.winner, "B")

    def test_no_move_loses(self):
        """A player with pieces but no valid moves loses."""
        # Trap a Red piece in the corner
        self.e.board[0][1] = "R"
        self.e.board[1][0] = "B"
        self.e.board[1][2] = "B"
        # Black somewhere else so that Black has moves after Red is stuck
        self.e.board[7][0] = "B"
        self.e.turn = "R"
        # Red has no legal moves → Red loses on its turn
        valid = self.e.get_all_valid_moves("R")
        self.assertEqual(valid, {})
        # Simulate _check_winner after Red has no moves
        self.e._check_winner()
        self.assertEqual(self.e.winner, "B")


class TestGetAllValidMoves(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()

    def test_red_has_moves_at_start(self):
        moves = self.e.get_all_valid_moves("R")
        self.assertGreater(len(moves), 0)

    def test_black_has_moves_at_start(self):
        moves = self.e.get_all_valid_moves("B")
        self.assertGreater(len(moves), 0)

    def test_all_pieces_appear_when_jump_available(self):
        """With no mandatory capture, ALL pieces with any move appear in valid_moves."""
        self.e.board = [['' for _ in range(8)] for _ in range(8)]
        self.e.board[5][2] = "R"
        self.e.board[4][3] = "B"   # capturable by R@(5,2)
        self.e.board[7][0] = "R"   # another Red with only a slide
        moves = self.e.get_all_valid_moves("R")
        # Both pieces must appear (slides are now legal even when jumps exist)
        self.assertIn((5, 2), moves, "Jumping piece must have moves")
        self.assertIn((7, 0), moves, "Non-jumping piece must ALSO appear (no mandatory rule)")
        # Jump must still be in the jumping piece's options
        self.assertIn((3, 4), moves[(5, 2)], "Jump target must be listed for (5,2)")


class TestHelpers(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()

    def test_get_piece_owner_red(self):
        self.assertEqual(self.e.get_piece_owner("R"), "R")
        self.assertEqual(self.e.get_piece_owner("RK"), "R")

    def test_get_piece_owner_black(self):
        self.assertEqual(self.e.get_piece_owner("B"), "B")
        self.assertEqual(self.e.get_piece_owner("BK"), "B")

    def test_get_piece_owner_empty(self):
        self.assertIsNone(self.e.get_piece_owner(""))

    def test_is_king_true(self):
        self.assertTrue(self.e.is_king("RK"))
        self.assertTrue(self.e.is_king("BK"))

    def test_is_king_false(self):
        self.assertFalse(self.e.is_king("R"))
        self.assertFalse(self.e.is_king("B"))
        self.assertFalse(self.e.is_king(""))


class TestGetState(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()

    def test_get_state_keys(self):
        state = self.e.get_state()
        self.assertIn("board", state)
        self.assertIn("turn", state)
        self.assertIn("winner", state)
        self.assertIn("active_jumper", state)

    def test_get_state_board_is_list(self):
        state = self.e.get_state()
        self.assertIsInstance(state["board"], list)
        self.assertEqual(len(state["board"]), 8)
        self.assertEqual(len(state["board"][0]), 8)

    def test_get_state_active_jumper_none(self):
        self.assertIsNone(self.e.get_state()["active_jumper"])

    def test_get_state_active_jumper_list_when_set(self):
        self.e.active_jumper = (3, 4)
        state = self.e.get_state()
        self.assertEqual(state["active_jumper"], [3, 4])


class TestReset(unittest.TestCase):
    def setUp(self):
        self.e = CheckersEngine()

    def test_reset_restores_initial_board(self):
        # Make a move, set winner, then reset
        self.e.make_move(5, 0, 4, 1)
        self.e.winner = "R"
        self.e.reset()
        self.assertIsNone(self.e.winner)
        self.assertEqual(self.e.turn, "R")
        self.assertEqual(self.e.board[5][0], "R")
        self.assertEqual(self.e.board[4][1], "")

    def test_reset_clears_active_jumper(self):
        self.e.active_jumper = (3, 4)
        self.e.reset()
        self.assertIsNone(self.e.active_jumper)

    def test_reset_restores_piece_counts(self):
        # Obliterate the board then reset
        self.e.board = [['' for _ in range(8)] for _ in range(8)]
        self.e.reset()
        red_count = sum(1 for r in range(8) for c in range(8) if self.e.board[r][c] == "R")
        blk_count = sum(1 for r in range(8) for c in range(8) if self.e.board[r][c] == "B")
        self.assertEqual(red_count, 12)
        self.assertEqual(blk_count, 12)


if __name__ == '__main__':
    unittest.main()
