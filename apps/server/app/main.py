import json
import logging
import uuid
import asyncio
from typing import Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.engine import CheckersEngine
from app.ai import get_best_move

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Checkers (Dama) API")

# Enable CORS for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Room structure:
# {
#   "engine":       CheckersEngine,
#   "connections":  { "R": WebSocket, "B": WebSocket },
#   "is_ai":        bool,
#   "ai_color":     str | None,
#   "ai_difficulty": str,
#   "huff_pending": { "pos": [r, c], "for": color } | None
# }
rooms: Dict[str, Dict[str, Any]] = {}

# ── Chess clock background timer task ──────────────────────────────────────────
async def start_timer_task():
    while True:
        await asyncio.sleep(1.0)
        for room_id in list(rooms.keys()):
            room = rooms.get(room_id)
            if not room:
                continue
            engine = room["engine"]
            if engine.winner:
                continue
            if not room.get("time_limit"):
                continue
            # Only tick if at least one player is connected
            if not room.get("connections"):
                continue

            turn = engine.turn
            if turn == "R":
                room["time_red"] = max(0.0, room["time_red"] - 1.0)
                if room["time_red"] <= 0.0:
                    engine.winner = "B"
                    await broadcast_state(room_id)
            elif turn == "B":
                room["time_black"] = max(0.0, room["time_black"] - 1.0)
                if room["time_black"] <= 0.0:
                    engine.winner = "R"
                    await broadcast_state(room_id)


@app.on_event("startup")
async def startup_event():
    asyncio.create_task(start_timer_task())


# Matchmaking queue
matchmaking_queue: List[Dict[str, Any]] = []


def get_or_create_room(room_id: str) -> Dict[str, Any]:
    if room_id not in rooms:
        rooms[room_id] = {
            "engine": CheckersEngine(),
            "connections": {},
            "is_ai": False,
            "ai_color": None,
            "ai_difficulty": "medium",
            "huff_pending": None,
            "huff_enabled": True,
            "time_limit": 300,  # 5 minutes default (300 seconds)
            "time_red": 300.0,
            "time_black": 300.0,
            "ai_task": None,    # tracks running AI coroutine task
        }
    return rooms[room_id]


async def broadcast_state(room_id: str) -> None:
    room = rooms.get(room_id)
    if not room:
        return
    state = room["engine"].get_state()
    # Add timer info to state
    state["time_limit"] = room.get("time_limit")
    state["time_red"] = int(room.get("time_red", 300))
    state["time_black"] = int(room.get("time_black", 300))
    state["huff_enabled"] = room.get("huff_enabled", True)
    
    payload = {"type": "sync", "state": state}
    for color, ws in list(room["connections"].items()):
        try:
            await ws.send_json(payload)
        except Exception as e:
            logger.error(f"Failed to send to {color} in room {room_id}: {e}")


async def process_move(room_id: str, player_color: str, from_pos: List[int], to_pos: List[int]) -> bool:
    room = rooms.get(room_id)
    if not room:
        return False
    engine = room["engine"]
    opp_color = "B" if player_color == "R" else "R"

    # ── Snapshot for huff detection ─────────────────────────
    # Only relevant when NOT mid-chain (active_jumper already
    # forces the jump; no huff opportunity during a chain).
    in_chain = engine.active_jumper is not None
    had_captures = (not in_chain) and engine.has_captures(player_color)

    # Record positions of ALL pieces that have a jump RIGHT NOW,
    # before the move executes.  After a slide we use this to find
    # the correct huff target: the piece that "forgot" to eat.
    jumping_positions: list = []
    if had_captures:
        for _r in range(8):
            for _c in range(8):
                if engine.get_piece_owner(engine.board[_r][_c]) == player_color:
                    if engine._get_jumps(engine.board, _r, _c):
                        jumping_positions.append((_r, _c))

    pieces_before = (
        sum(1 for r in range(8) for c in range(8) if engine.board[r][c] != '')
        if had_captures else 0
    )

    success = engine.make_move(from_pos[0], from_pos[1], to_pos[0], to_pos[1])

    if success:
        room["huff_pending"] = None   # clear any stale pending huff

        # ── Huff offer on skipped capture ────────────────────
        # If the player had jumps available but made a slide
        # instead, the piece that HAD the jump is the huff target.
        if had_captures:
            pieces_after = sum(
                1 for r in range(8) for c in range(8)
                if engine.board[r][c] != ''
            )
            was_jump = pieces_after < pieces_before
            if not was_jump and jumping_positions:
                # Determine the huff target:
                # - If the player MOVED the piece that had the jump,
                #   that piece is now at to_pos.
                # - Otherwise the piece is still at its original square.
                from_tuple = (from_pos[0], from_pos[1])
                if from_tuple in jumping_positions:
                    # Player slid the piece that could have jumped
                    huff_pos = list(to_pos)
                else:
                    # Player slid a DIFFERENT piece;
                    # offer the first piece that had the jump.
                    huff_pos = list(jumping_positions[0])

                if room.get("huff_enabled", True):
                    room["huff_pending"] = {"pos": huff_pos, "for": opp_color}
                    opp_ws = room["connections"].get(opp_color)
                    if opp_ws:
                        try:
                            await opp_ws.send_json({
                                "type": "huff_offer",
                                "pos": huff_pos,
                                "expires_in": 10,
                            })
                        except Exception:
                            pass

        await broadcast_state(room_id)
        return True
    return False


def schedule_ai_turn(room_id: str) -> None:
    """Schedule an AI turn, cancelling any existing pending task first."""
    room = rooms.get(room_id)
    if not room or not room.get("is_ai"):
        return
    # Cancel any existing AI task that hasn't started yet
    existing: asyncio.Task | None = room.get("ai_task")
    if existing and not existing.done():
        existing.cancel()
    task = asyncio.create_task(handle_ai_turn(room_id))
    room["ai_task"] = task


async def handle_ai_turn(room_id: str) -> None:
    """Called after a human move to let the AI respond."""
    room = rooms.get(room_id)
    if not room or not room.get("is_ai"):
        return
    engine: CheckersEngine = room["engine"]
    if engine.winner:
        return

    # ── AI Huff Execution (runs BEFORE sleep so it's prompt) ──
    # If the human player slid instead of jumping, huff_pending is set for AI.
    # The AI executes the huff immediately (within the huff-enabled check).
    pending = room.get("huff_pending")
    if pending and pending["for"] == room["ai_color"] and room.get("huff_enabled", True):
        pos = pending["pos"]
        logger.info(f"AI executes huff on player piece at {pos} in room {room_id}")
        ok = engine.huff_piece(pos[0], pos[1])
        if ok:
            room["huff_pending"] = None
            await broadcast_state(room_id)
            await asyncio.sleep(0.6)  # brief visual pause after huffing

    # Guard: only proceed if it is actually the AI's turn
    if engine.turn != room["ai_color"] or engine.winner:
        return

    await asyncio.sleep(1.0)

    while engine.turn == room["ai_color"] and not engine.winner:
        best_move = get_best_move(engine, room["ai_difficulty"], room["ai_color"])
        if best_move:
            logger.info(f"AI {room['ai_color']} makes move {best_move} in room {room_id}")
            success = await process_move(room_id, room["ai_color"], [best_move[0], best_move[1]], [best_move[2], best_move[3]])
            if not success:
                break
            if engine.turn == room["ai_color"]:
                await asyncio.sleep(0.6)
        else:
            break


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/")
def read_root():
    return {"status": "ok", "message": "Checkers Backend running"}


# ── Room reset ────────────────────────────────────────────────────────────────
@app.post("/api/rooms/{room_id}/reset")
def reset_room(room_id: str):
    room = get_or_create_room(room_id)
    room["engine"].reset()
    room["huff_pending"] = None
    asyncio.create_task(broadcast_state(room_id))
    if room["is_ai"] and room["engine"].turn == room["ai_color"]:
        schedule_ai_turn(room_id)
    return {"status": "reset", "room_id": room_id}


# ── Matchmaking endpoint ───────────────────────────────────────────────────────
@app.websocket("/ws/matchmake")
async def matchmake_endpoint(websocket: WebSocket):
    await websocket.accept()

    player_data = {
        "ws": websocket,
        "joined_at": asyncio.get_event_loop().time()
    }
    matchmaking_queue.append(player_data)
    logger.info(f"Player joined matchmaking queue. Queue size: {len(matchmaking_queue)}")

    try:
        matched = False
        while not matched:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                if msg == "cancel":
                    break
            except asyncio.TimeoutError:
                pass
            except Exception:
                break

            if len(matchmaking_queue) >= 2 and player_data in matchmaking_queue:
                if matchmaking_queue[0] == player_data or matchmaking_queue[1] == player_data:
                    p1 = matchmaking_queue.pop(0)
                    if p1 != player_data:
                        matchmaking_queue.remove(player_data)
                        p2 = player_data
                    else:
                        p2 = matchmaking_queue.pop(0)

                    room_id = str(uuid.uuid4())[:8]
                    try:
                        await p1["ws"].send_json({"type": "match_found", "room_id": room_id, "color": "R"})
                        await p2["ws"].send_json({"type": "match_found", "room_id": room_id, "color": "B"})
                    except Exception:
                        pass

                    matched = True
                    break

            # AI fallback after 15 s
            if player_data in matchmaking_queue:
                wait_time = asyncio.get_event_loop().time() - player_data["joined_at"]
                if wait_time > 15.0:
                    matchmaking_queue.remove(player_data)
                    room_id = f"ai-{uuid.uuid4().hex[:6]}"
                    room = get_or_create_room(room_id)
                    room["is_ai"] = True
                    room["ai_color"] = "B"
                    room["ai_difficulty"] = "medium"
                    try:
                        await websocket.send_json({"type": "match_found", "room_id": room_id, "color": "R"})
                    except Exception:
                        pass
                    matched = True
                    break

    except Exception as e:
        logger.error(f"Matchmaking error: {e}")
    finally:
        if player_data in matchmaking_queue:
            matchmaking_queue.remove(player_data)


# ── Game room endpoint ────────────────────────────────────────────────────────
@app.websocket("/ws/{room_id}/{player_color}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, player_color: str):
    if player_color not in ("R", "B"):
        await websocket.close(code=4000, reason="Invalid player color. Must be R or B.")
        return

    await websocket.accept()
    room = get_or_create_room(room_id)

    room["connections"][player_color] = websocket

    # Dynamic AI configuration:
    # If starting with "ai-", it is always an AI match.
    # Otherwise, in private rooms, if only 1 player is connected, enable AI for the opponent color.
    # When a second player joins, disable AI so they can play each other.
    if room_id.startswith("ai-"):
        room["is_ai"] = True
        room["ai_color"] = "B" if player_color == "R" else "R"
    else:
        if len(room["connections"]) == 1:
            room["is_ai"] = True
            room["ai_color"] = "B" if player_color == "R" else "R"
        else:
            room["is_ai"] = False
            room["ai_color"] = None

    logger.info(f"Player {player_color} connected to room {room_id} (AI: {room['is_ai']}, AI color: {room['ai_color']})")

    # Send current state immediately
    try:
        await websocket.send_json({"type": "sync", "state": room["engine"].get_state()})
        await broadcast_state(room_id)
        if room["is_ai"] and room["engine"].turn == room["ai_color"]:
            schedule_ai_turn(room_id)
    except Exception as e:
        logger.error(f"Error on initial sync: {e}")

    opp_color = "B" if player_color == "R" else "R"

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")

            # ── Move ──────────────────────────────────────────────────────
            if msg_type == "move":
                engine: CheckersEngine = room["engine"]

                if engine.turn != player_color:
                    await websocket.send_json({"type": "error", "message": "It is not your turn."})
                    continue

                from_pos = message.get("from_pos")
                to_pos   = message.get("to_pos")

                if not from_pos or not to_pos or len(from_pos) != 2 or len(to_pos) != 2:
                    await websocket.send_json({"type": "error", "message": "Invalid move coordinates."})
                    continue

                success = await process_move(room_id, player_color, from_pos, to_pos)
                if success:
                    if room["is_ai"] and engine.turn == room["ai_color"] and not engine.winner:
                        schedule_ai_turn(room_id)
                else:
                    await websocket.send_json({"type": "error", "message": "Invalid move."})

            # ── Huff ──────────────────────────────────────────────────────
            elif msg_type == "huff":
                engine = room["engine"]
                pending = room.get("huff_pending")
                if pending and pending["for"] == player_color:
                    pos = pending["pos"]
                    ok = engine.huff_piece(pos[0], pos[1])
                    if ok:
                        room["huff_pending"] = None
                        await broadcast_state(room_id)
                        if room["is_ai"] and engine.turn == room["ai_color"] and not engine.winner:
                            schedule_ai_turn(room_id)
                    else:
                        await websocket.send_json({"type": "error", "message": "Huff failed."})
                else:
                    await websocket.send_json({"type": "error", "message": "No active huff offer."})

            # ── Cursor ────────────────────────────────────────────────────
            elif msg_type == "cursor":
                opp_ws = room["connections"].get(opp_color)
                if opp_ws:
                    try:
                        await opp_ws.send_json({
                            "type": "opponent_cursor",
                            "r": message.get("r"),
                            "c": message.get("c"),
                        })
                    except Exception:
                        pass

            # ── Reset ─────────────────────────────────────────────────────
            elif msg_type == "reset":
                room["engine"].reset()
                room["huff_pending"] = None
                # Reset timers
                limit = room.get("time_limit")
                room["time_red"] = float(limit) if limit is not None else 300.0
                room["time_black"] = float(limit) if limit is not None else 300.0
                await broadcast_state(room_id)
                if room["is_ai"] and room["engine"].turn == room["ai_color"]:
                    schedule_ai_turn(room_id)

            # ── Settings ──────────────────────────────────────────────────
            elif msg_type == "settings":
                limit = message.get("time_limit")
                room["time_limit"] = limit
                room["time_red"] = float(limit) if limit is not None else 300.0
                room["time_black"] = float(limit) if limit is not None else 300.0
                if "huff_enabled" in message:
                    room["huff_enabled"] = bool(message["huff_enabled"])
                    if not room["huff_enabled"]:
                        room["huff_pending"] = None  # clear any pending huff if rule disabled
                await broadcast_state(room_id)

            # ── Stop chain (voluntary end of multi-jump) ───────────────────
            elif msg_type == "stop_chain":
                engine = room["engine"]
                if engine.turn != player_color:
                    await websocket.send_json({"type": "error", "message": "Not your turn."})
                    continue
                ok = engine.stop_chain()
                if ok:
                    await broadcast_state(room_id)
                    if room["is_ai"] and engine.turn == room["ai_color"] and not engine.winner:
                        schedule_ai_turn(room_id)
                else:
                    await websocket.send_json({"type": "error", "message": "No active chain to stop."})

    except WebSocketDisconnect:
        logger.info(f"Player {player_color} disconnected from room {room_id}")
        if room_id in rooms:
            if player_color in rooms[room_id]["connections"]:
                del rooms[room_id]["connections"][player_color]
            
            if not rooms[room_id]["connections"]:
                del rooms[room_id]
            else:
                # One player remains, so enable AI for the color that just disconnected
                rooms[room_id]["is_ai"] = True
                rooms[room_id]["ai_color"] = player_color
                await broadcast_state(room_id)
                # If it's now that AI's turn, trigger it
                if rooms[room_id]["engine"].turn == player_color:
                    schedule_ai_turn(room_id)
