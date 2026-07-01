"""
Tests for the non-mandatory-capture rules (huff/blow rule system).

Key rule change: captures are NO LONGER mandatory.
A player may slide even when a jump is available.
The server (not tested here) will trigger a huff offer when that happens.

Tests cover:
  1. Valid moves now include BOTH slides and jumps when both are possible.
  2. A player can successfully EXECUTE a slide when jumps exist.
  3. huff_piece() removes a piece WITHOUT switching turn.
  4. huff_piece() works on any colour (no ownership restriction).
  5. huff_piece() returns False when the cell is empty.
  6. stop_chain() ends a mid-chain and switches turn.
  7. stop_chain() returns False when no chain is active.
  8. Mid-chain: active_jumper still restricts valid moves to jumps only.
  9. has_captures() still correctly detects available jumps.
 10. Win condition still fires correctly.
 11. Huff target = piece that HAD the jump (same piece, now at to_pos after sliding).
 12. Huff target = piece that HAD the jump (DIFFERENT piece still at original pos).
"""
import unittest
from app.engine import CheckersEngine


def clear_board(engine: CheckersEngine) -> None:
    """Wipe the board — useful for setting up custom positions."""
    engine.board = [['' for _ in range(8)] for _ in range(8)]
    engine.active_jumper = None
    engine.winner = None


class TestNonMandatoryCapture(unittest.TestCase):
    """Captures are no longer mandatory — slides are always legal."""

    def setUp(self):
        self.e = CheckersEngine()

    # ------------------------------------------------------------------ #
    # 1. Valid moves include slides AND jumps simultaneously              #
    # ------------------------------------------------------------------ #
    def test_valid_moves_include_slides_when_jump_exists(self):
        """When R can jump, slides must ALSO appear in valid_moves."""
        clear_board(self.e)
        self.e.turn = 'R'
        # Place R at (5, 2) — can slide to (4, 1) or (4, 3)
        self.e.board[5][2] = 'R'
        # Place B at (4, 3) so R can also jump to (3, 4)
        self.e.board[4][3] = 'B'

        moves = self.e.get_all_valid_moves('R')
        self.assertIn((5, 2), moves, "Piece at (5,2) should have moves")
        destinations = moves[(5, 2)]
        # Jump target
        self.assertIn((3, 4), destinations, "Jump to (3,4) must be listed")
        # Slide target (was blocked by mandatory-capture rule before the fix)
        self.assertIn((4, 1), destinations, "Slide to (4,1) must also be listed")

    def test_all_pieces_have_moves_when_captures_exist(self):
        """
        With mandatory capture removed, ALL pieces appear in valid_moves
        (not just the capturing ones).
        """
        clear_board(self.e)
        self.e.turn = 'R'
        # Two R pieces: one can jump, one can only slide
        self.e.board[5][2] = 'R'   # can jump
        self.e.board[5][6] = 'R'   # can only slide (no B nearby)
        self.e.board[4][3] = 'B'   # target for jump from (5,2)

        moves = self.e.get_all_valid_moves('R')
        self.assertIn((5, 2), moves, "Jumping piece must have moves")
        self.assertIn((5, 6), moves, "Non-jumping piece must ALSO have moves (no mandatory rule)")

    # ------------------------------------------------------------------ #
    # 2. Slide succeeds even when a jump is available                     #
    # ------------------------------------------------------------------ #
    def test_slide_executes_successfully_when_jump_available(self):
        """make_move must accept a slide even if a jump exists."""
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[5][2] = 'R'
        self.e.board[4][3] = 'B'   # jump available to (3,4)

        # Slide to (4,1) — previously rejected, now must succeed
        ok = self.e.make_move(5, 2, 4, 1)
        self.assertTrue(ok, "Slide must succeed even when a jump exists")
        self.assertEqual(self.e.board[4][1], 'R')
        self.assertEqual(self.e.board[5][2], '')
        # B piece untouched
        self.assertEqual(self.e.board[4][3], 'B')
        # Turn switches to B
        self.assertEqual(self.e.turn, 'B')

    def test_jump_still_works_when_also_slide_available(self):
        """Jumps must still execute correctly (removing the opponent piece)."""
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[5][2] = 'R'
        self.e.board[4][3] = 'B'

        ok = self.e.make_move(5, 2, 3, 4)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[3][4], 'R')
        self.assertEqual(self.e.board[4][3], '', "Captured piece must be removed")
        self.assertEqual(self.e.board[5][2], '')


class TestHuffPiece(unittest.TestCase):
    """huff_piece: removes a piece, no turn switch, no ownership restriction."""

    def setUp(self):
        self.e = CheckersEngine()

    # ------------------------------------------------------------------ #
    # 3. huff_piece removes piece and does NOT switch turn                #
    # ------------------------------------------------------------------ #
    def test_huff_removes_piece_no_turn_change(self):
        """After huffing, the piece is gone and it remains the SAME player's turn."""
        clear_board(self.e)
        self.e.turn = 'B'          # B's turn (B is huffing)
        self.e.board[4][1] = 'R'   # R's piece that skipped a capture

        ok = self.e.huff_piece(4, 1)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[4][1], '', "Piece must be removed")
        self.assertEqual(self.e.turn, 'B', "Turn must NOT switch after huff")

    # ------------------------------------------------------------------ #
    # 4. huff_piece works on any colour (no ownership check)              #
    # ------------------------------------------------------------------ #
    def test_huff_can_remove_opponent_piece(self):
        """huff_piece must remove a piece regardless of whose turn it is."""
        clear_board(self.e)
        self.e.turn = 'B'
        self.e.board[3][2] = 'R'   # R piece (same side as turn — also legal)

        ok = self.e.huff_piece(3, 2)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[3][2], '')

    def test_huff_can_remove_own_color_piece(self):
        """Edge case: server validates legitimacy; engine just removes."""
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[6][1] = 'R'

        ok = self.e.huff_piece(6, 1)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[6][1], '')

    # ------------------------------------------------------------------ #
    # 5. huff_piece returns False on empty cell                           #
    # ------------------------------------------------------------------ #
    def test_huff_empty_cell_returns_false(self):
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[3][2] = ''

        ok = self.e.huff_piece(3, 2)
        self.assertFalse(ok)

    def test_huff_on_winner_returns_false(self):
        clear_board(self.e)
        self.e.winner = 'R'
        self.e.board[3][2] = 'B'
        ok = self.e.huff_piece(3, 2)
        self.assertFalse(ok)

    def test_huff_triggers_win_check(self):
        """Huffing the last enemy piece should set a winner."""
        clear_board(self.e)
        # It's B's turn (B is doing the huffing).
        # R has only one piece left — once huffed, R has no pieces → B wins.
        # After huff, turn stays at B; _check_winner checks whose turn it is.
        # But winner is set by checking if the NEXT player has moves.
        # We need to ensure after huff B still has a piece with moves so B wins.
        self.e.board[4][1] = 'R'   # last R piece (to be huffed)
        self.e.board[6][3] = 'B'   # B piece so B has pieces after huff
        self.e.turn = 'B'

        ok = self.e.huff_piece(4, 1)
        self.assertTrue(ok)
        self.assertEqual(self.e.board[4][1], '', "Piece must be removed")
        # After huff, turn stays at B. _check_winner() checks if B (current turn)
        # has moves — B does have moves, so no winner triggered by lack-of-moves.
        # Winner fires only when a player has NO moves. Since R has no pieces
        # and R would be next (but we don't switch turn), we call _check_winner
        # manually as if it's now R's turn.
        self.e.turn = 'R'
        self.e._check_winner()
        self.assertEqual(self.e.winner, 'B', "B wins after last R piece is removed")


class TestStopChain(unittest.TestCase):
    """stop_chain: voluntarily end mid-chain and switch turn."""

    def setUp(self):
        self.e = CheckersEngine()

    # ------------------------------------------------------------------ #
    # 6. stop_chain ends chain and switches turn                          #
    # ------------------------------------------------------------------ #
    def test_stop_chain_switches_turn(self):
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[3][4] = 'R'
        self.e.active_jumper = (3, 4)

        ok = self.e.stop_chain()
        self.assertTrue(ok)
        self.assertIsNone(self.e.active_jumper)
        self.assertEqual(self.e.turn, 'B')

    def test_stop_chain_from_black(self):
        clear_board(self.e)
        self.e.turn = 'B'
        self.e.board[4][3] = 'B'
        self.e.active_jumper = (4, 3)

        ok = self.e.stop_chain()
        self.assertTrue(ok)
        self.assertEqual(self.e.turn, 'R')

    # ------------------------------------------------------------------ #
    # 7. stop_chain returns False when no chain active                    #
    # ------------------------------------------------------------------ #
    def test_stop_chain_no_chain_returns_false(self):
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.active_jumper = None

        ok = self.e.stop_chain()
        self.assertFalse(ok)

    def test_stop_chain_on_winner_returns_false(self):
        clear_board(self.e)
        self.e.winner = 'R'
        self.e.active_jumper = (3, 4)
        ok = self.e.stop_chain()
        self.assertFalse(ok)


class TestMidChainRestriction(unittest.TestCase):
    """
    During a mid-chain (active_jumper set), valid_moves is still restricted
    to the locked piece's jump continuations only.
    """

    def setUp(self):
        self.e = CheckersEngine()

    # ------------------------------------------------------------------ #
    # 8. Mid-chain: only the locked piece's jumps are valid               #
    # ------------------------------------------------------------------ #
    def test_mid_chain_only_active_jumper_may_move(self):
        clear_board(self.e)
        self.e.turn = 'R'
        # Active jumper at (3, 4)
        self.e.board[3][4] = 'R'
        self.e.active_jumper = (3, 4)
        # Another R piece that could otherwise slide
        self.e.board[5][2] = 'R'
        # Give active jumper a valid further jump
        self.e.board[2][5] = 'B'   # opponent for jumper to eat → land at (1, 6)

        moves = self.e.get_all_valid_moves('R')
        # Only the active jumper must appear
        self.assertIn((3, 4), moves)
        self.assertNotIn((5, 2), moves, "Non-active piece must NOT appear during chain")

    def test_mid_chain_only_jumps_offered(self):
        """When mid-chain, only jump targets are offered (not slides)."""
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[3][4] = 'R'
        self.e.active_jumper = (3, 4)
        self.e.board[2][5] = 'B'   # gives jump to (1, 6)

        moves = self.e.get_all_valid_moves('R')
        destinations = moves.get((3, 4), [])
        self.assertIn((1, 6), destinations, "Jump continuation must be listed")
        # (4, 3) or (4, 5) would be slides — must not appear during chain
        slide_targets = [(4, 3), (4, 5), (2, 3)]
        for slide in slide_targets:
            self.assertNotIn(slide, destinations, f"Slide {slide} must not appear during chain")


class TestHasCapturesAndWin(unittest.TestCase):
    """has_captures() and win condition still work correctly after the rule change."""

    def setUp(self):
        self.e = CheckersEngine()

    # ------------------------------------------------------------------ #
    # 9. has_captures still detects available jumps                       #
    # ------------------------------------------------------------------ #
    def test_has_captures_true_when_jump_available(self):
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[5][2] = 'R'
        self.e.board[4][3] = 'B'   # R can jump

        self.assertTrue(self.e.has_captures('R'))

    def test_has_captures_false_when_no_jump(self):
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[5][2] = 'R'
        # No B adjacent

        self.assertFalse(self.e.has_captures('R'))

    # ------------------------------------------------------------------ #
    # 10. Win condition fires when no moves remain                        #
    # ------------------------------------------------------------------ #
    def test_win_when_no_moves_remain(self):
        """A player with no legal moves (no slides, no jumps) loses."""
        clear_board(self.e)
        # Trap R in the top-left corner (row 0, col 1 — a dark square).
        # Block both diagonal exits with friendly/enemy pieces so it can't
        # slide OR jump anywhere.
        #   R is at (0, 1).
        #   (1, 0) and (1, 2) are its only forward destinations (kings go all dirs,
        #   but R is a man so it can't slide backward past row 0).
        #   R can't move backward (row -1 is out of bounds).
        #   Place B at (1, 0) — R can't slide there.
        #   Place B at (1, 2) — R could jump to (2, 3) if (2,3) is free, so
        #   block (2, 3) with another B to prevent the jump landing.
        self.e.board[0][1] = 'R'
        self.e.board[1][0] = 'B'   # blocks slide and jump-left
        self.e.board[1][2] = 'B'   # blocks slide-right; jump-right would land (2,3)
        self.e.board[2][3] = 'B'   # blocks jump-right landing square
        self.e.board[7][7] = 'B'   # B has a piece so winner check is meaningful
        self.e.turn = 'R'

        valid = self.e.get_all_valid_moves('R')
        self.assertEqual(valid, {}, "R must have no legal moves at all")

        self.e._check_winner()
        self.assertEqual(self.e.winner, 'B',
                         "B wins when R has no legal moves")

    def test_no_winner_when_moves_exist(self):
        """Start of game — both sides have moves, no winner."""
        e = CheckersEngine()
        self.assertIsNone(e.winner)


class TestHuffTarget(unittest.TestCase):
    """
    Verify that the server correctly identifies WHICH piece should be
    marked as the huff target when a slide is made while jumps were available.

    The correct piece is always the one that HAD the jump opportunity —
    NOT necessarily the piece that moved.

    These tests replicate the server-side logic from main.py in isolation
    using pure engine calls, so they run without a WebSocket server.
    """

    def setUp(self):
        self.e = CheckersEngine()

    def _jumping_positions(self, color: str):
        """Return all positions of 'color' pieces that have jump moves."""
        positions = []
        for r in range(8):
            for c in range(8):
                if self.e.get_piece_owner(self.e.board[r][c]) == color:
                    if self.e._get_jumps(self.e.board, r, c):
                        positions.append((r, c))
        return positions

    # ------------------------------------------------------------------ #
    # 11. Slider IS the piece that had the jump → huff target = to_pos   #
    # ------------------------------------------------------------------ #
    def test_huff_target_same_piece_slid(self):
        """
        R at (5, 2) can jump B at (4, 3) → (3, 4).
        R slides (5, 2) → (4, 1) instead.
        The piece that had the jump IS the one that moved.
        After the slide: jumping piece is at (4, 1) = to_pos.
        Huff target should be (4, 1).
        """
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[5][2] = 'R'  # this piece can jump
        self.e.board[4][3] = 'B'  # B to be jumped

        # Snapshot: which pieces have jumps before the move?
        from_pos = (5, 2)
        to_pos   = (4, 1)
        jumping_before = self._jumping_positions('R')
        self.assertIn((5, 2), jumping_before, "Setup: R@(5,2) must have a jump")

        # Execute the slide
        ok = self.e.make_move(from_pos[0], from_pos[1], to_pos[0], to_pos[1])
        self.assertTrue(ok, "Slide must succeed")

        # Determine huff target using the same logic as main.py
        if from_pos in jumping_before:
            huff_target = to_pos          # slider was the jumping piece → now at to_pos
        else:
            huff_target = jumping_before[0]

        self.assertEqual(huff_target, (4, 1),
                         "Huff target must be the sliding piece's new position (4,1)")
        # Verify that position actually has the piece
        self.assertEqual(self.e.board[huff_target[0]][huff_target[1]], 'R')

    # ------------------------------------------------------------------ #
    # 12. Slider is DIFFERENT from the piece that had the jump            #
    # ------------------------------------------------------------------ #
    def test_huff_target_different_piece_slid(self):
        """
        R at (5, 2) can jump B at (4, 3) → (3, 4).
        R at (5, 6) can only slide (no jump).
        R slides (5, 6) → (4, 5) instead of using (5, 2)'s jump.
        The piece that had the jump is STILL at (5, 2) (untouched).
        Huff target should be (5, 2) — the piece that forgot to eat.
        """
        clear_board(self.e)
        self.e.turn = 'R'
        self.e.board[5][2] = 'R'   # this piece can jump
        self.e.board[4][3] = 'B'   # B to be jumped
        self.e.board[5][6] = 'R'   # this piece can only slide

        from_pos = (5, 6)
        to_pos   = (4, 5)
        jumping_before = self._jumping_positions('R')
        self.assertIn((5, 2), jumping_before, "Setup: R@(5,2) must have a jump")
        self.assertNotIn((5, 6), jumping_before, "Setup: R@(5,6) must NOT have a jump")

        # Execute the slide with the non-jumping piece
        ok = self.e.make_move(from_pos[0], from_pos[1], to_pos[0], to_pos[1])
        self.assertTrue(ok, "Slide must succeed")

        # Determine huff target using the same logic as main.py
        if from_pos in jumping_before:
            huff_target = to_pos
        else:
            huff_target = jumping_before[0]  # the piece that had the jump

        self.assertEqual(huff_target, (5, 2),
                         "Huff target must be the piece that HAD the jump, not the slider")
        # Confirm the jumping piece is still at (5, 2) and can be huffed
        self.assertEqual(self.e.board[5][2], 'R',
                         "The jumping piece must still be at its original position")


if __name__ == '__main__':
    unittest.main()
