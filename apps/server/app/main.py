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
        }
    return rooms[room_id]


async def broadcast_state(room_id: str) -> None:
    room = rooms.get(room_id)
    if not room:
        return
    state = room["engine"].get_state()
    payload = {"type": "sync", "state": state}
    for color, ws in list(room["connections"].items()):
        try:
            await ws.send_json(payload)
        except Exception as e:
            logger.error(f"Failed to send to {color} in room {room_id}: {e}")


async def handle_ai_turn(room_id: str) -> None:
    """Called after a human move to let the AI respond."""
    room = rooms.get(room_id)
    if not room or not room.get("is_ai"):
        return
    engine: CheckersEngine = room["engine"]
    if engine.winner:
        return
    if engine.turn != room["ai_color"]:
        return

    await asyncio.sleep(1.0)

    while engine.turn == room["ai_color"] and not engine.winner:
        best_move = get_best_move(engine, room["ai_difficulty"], room["ai_color"])
        if best_move:
            logger.info(f"AI {room['ai_color']} makes move {best_move} in room {room_id}")
            engine.make_move(best_move[0], best_move[1], best_move[2], best_move[3])
            await broadcast_state(room_id)
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
        asyncio.create_task(handle_ai_turn(room_id))
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

    # Mark AI rooms
    if room_id.startswith("ai-") and not room["is_ai"]:
        room["is_ai"] = True
        room["ai_color"] = "B" if player_color == "R" else "R"

    room["connections"][player_color] = websocket
    logger.info(f"Player {player_color} connected to room {room_id} (AI: {room['is_ai']})")

    # Send current state immediately
    try:
        await websocket.send_json({"type": "sync", "state": room["engine"].get_state()})
        await broadcast_state(room_id)
        if room["is_ai"] and room["engine"].turn == room["ai_color"]:
            asyncio.create_task(handle_ai_turn(room_id))
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

                success = engine.make_move(from_pos[0], from_pos[1], to_pos[0], to_pos[1])

                if success:
                    room["huff_pending"] = None   # valid move clears any pending huff
                    await broadcast_state(room_id)
                    if room["is_ai"] and engine.turn == room["ai_color"] and not engine.winner:
                        asyncio.create_task(handle_ai_turn(room_id))
                else:
                    # ── Huff offer ─────────────────────────────────────────
                    error_msg = "Invalid move."
                    if engine.has_captures(player_color):
                        # Player tried to avoid a mandatory capture → offer opponent to huff
                        huff_pos = from_pos
                        room["huff_pending"] = {"pos": huff_pos, "for": opp_color}
                        error_msg = "You must capture! Opponent may huff your piece."
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

                    await websocket.send_json({"type": "error", "message": error_msg})

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
                            asyncio.create_task(handle_ai_turn(room_id))
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
                await broadcast_state(room_id)
                if room["is_ai"] and room["engine"].turn == room["ai_color"]:
                    asyncio.create_task(handle_ai_turn(room_id))

    except WebSocketDisconnect:
        logger.info(f"Player {player_color} disconnected from room {room_id}")
        if room_id in rooms:
            if player_color in rooms[room_id]["connections"]:
                del rooms[room_id]["connections"][player_color]
            if not rooms[room_id]["connections"]:
                del rooms[room_id]
