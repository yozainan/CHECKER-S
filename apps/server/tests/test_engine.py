import unittest
from app.engine import CheckersEngine

class TestCheckersEngine(unittest.TestCase):
    def setUp(self):
        self.engine = CheckersEngine()

    def test_initial_state(self):
        # Game should start with Red turn and no winner
        self.assertEqual(self.engine.turn, "R")
        self.assertIsNone(self.engine.winner)
        # Red piece should be at row 5, col 0
        self.assertEqual(self.engine.board[5][0], "R")
        # Empty space at row 4, col 0
        self.assertEqual(self.engine.board[4][0], "")

    def test_valid_slide_move(self):
        # Red piece at (5, 2) should slide to (4, 3)
        # In setup, board[5][2] = "R", board[4][3] = ""
        success = self.engine.make_move(5, 2, 4, 3)
        self.assertTrue(success)
        self.assertEqual(self.engine.board[5][2], "")
        self.assertEqual(self.engine.board[4][3], "R")
        # Turn should toggle to Black
        self.assertEqual(self.engine.turn, "B")

    def test_invalid_slide_move(self):
        # Attempt to slide to non-diagonal cell
        success = self.engine.make_move(5, 0, 4, 0)
        self.assertFalse(success)
        # Piece should not have moved
        self.assertEqual(self.engine.board[5][0], "R")
        self.assertEqual(self.engine.turn, "R")

    def test_capture_move(self):
        # Set up custom capture scenario: Red piece at (5, 2), Black piece at (4, 3), land at (3, 4)
        self.engine.board[4][3] = "B"
        # Verify a jump is available
        valid_moves = self.engine.get_all_valid_moves("R")
        self.assertIn((5, 2), valid_moves)
        self.assertIn((3, 4), valid_moves[(5, 2)])
        
        # Execute capture jump
        success = self.engine.make_move(5, 2, 3, 4)
        self.assertTrue(success)
        # Check piece landing and opponent capture removal
        self.assertEqual(self.engine.board[5][2], "")
        self.assertEqual(self.engine.board[4][3], "") # captured
        self.assertEqual(self.engine.board[3][4], "R")
        # Turn toggles to B since no further jumps are possible from (3,4)
        self.assertEqual(self.engine.turn, "B")

    def test_king_promotion(self):
        # Move a red piece close to row 0
        self.engine.board[1][2] = "R"
        self.engine.board[0][1] = ""
        # Force active turn rules
        self.engine.turn = "R"
        # Slide to back row
        success = self.engine.make_move(1, 2, 0, 1)
        self.assertTrue(success)
        # Confirm promoted to Red King "RK"
        self.assertEqual(self.engine.board[0][1], "RK")
        self.assertEqual(self.engine.board[1][2], "")

if __name__ == '__main__':
    unittest.main()
