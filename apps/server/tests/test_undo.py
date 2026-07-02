import unittest
from app.engine import CheckersEngine
from app.main import get_room_snapshot, rooms

class TestUndo(unittest.TestCase):
    def test_snapshot_and_undo(self):
        # Setup a dummy room
        room_id = "test-undo-room"
        engine = CheckersEngine()
        rooms[room_id] = {
            "engine": engine,
            "time_red": 300.0,
            "time_black": 300.0,
            "huff_pending": None,
            "history": []
        }
        
        # Take initial snapshot
        snapshot = get_room_snapshot(rooms[room_id])
        self.assertEqual(snapshot["engine_state"]["turn"], "R")
        self.assertEqual(snapshot["engine_state"]["board"][5][0], "R")
        
        # Make a move
        # R at (5, 0) slides to (4, 1)
        # We need to simulate process_move's snapshotting
        rooms[room_id]["history"].append(snapshot)
        engine.make_move(5, 0, 4, 1)
        
        # Verify state after move
        self.assertEqual(engine.board[4][1], "R")
        self.assertEqual(engine.board[5][0], "")
        self.assertEqual(engine.turn, "B")
        
        # Trigger an undo (restore from history)
        last_state = rooms[room_id]["history"].pop()
        engine_state = last_state["engine_state"]
        engine.board = [row[:] for row in engine_state["board"]]
        engine.turn = engine_state["turn"]
        engine.winner = engine_state["winner"]
        engine.active_jumper = engine_state["active_jumper"]
        
        # Verify state is restored
        self.assertEqual(engine.board[5][0], "R")
        self.assertEqual(engine.board[4][1], "")
        self.assertEqual(engine.turn, "R")
        
        # Clean up
        del rooms[room_id]
