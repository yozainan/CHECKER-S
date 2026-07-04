# WebSocket Matchmaking & Game Protocol

This document details the real-time WebSocket messaging schemas, events, and flow patterns utilized by Dama Arena.

---

## 🛜 Connection Handshakes

### 1. Matchmaking Socket (`/ws/matchmake`)
Used to queue players looking for public matches:
* **Connection URL**: `ws://<backend-domain>/ws/matchmake`
* **Flow**:
  1. Client connects to `/ws/matchmake`.
  2. Server registers player and queues them.
  3. If 2 players queue, the server pairs them, generates a random Room ID, and sends `match_found` to both sockets.
  4. Sockets are closed, and clients navigate to their dedicated game arena.
  5. If no match is found after 15 seconds, the server automatically spawns an AI game room and redirects the client to it.

### 2. Game Arena Socket (`/ws/:roomId/:playerColor`)
Used to synchronize moves, huffs, clocks, and hover states within a specific room:
* **Connection URL**: `ws://<backend-domain>/ws/:roomId/:playerColor`
  - `roomId`: Generated ID (e.g. `8f4b2c1a` or `ai-7d2a5f`).
  - `playerColor`: `R` (Red) or `B` (Black).

---

## 📨 Message Payloads (JSON Schema)

### Client ➔ Server Messages

All client payloads must conform to the Zod `GenericMessageSchema` schema:

#### 1. Move Event (`move`)
Dispatched when a player executes a board move.
```json
{
  "type": "move",
  "from_pos": [5, 2],
  "to_pos": [4, 3]
}
```

#### 2. Huff Blow Event (`huff`)
Dispatched to claim a huff penalty on an opponent's piece for missing a mandatory jump.
```json
{
  "type": "huff",
  "pos": [3, 4]
}
```

#### 3. Cursor Update Event (`cursor`)
Dispatched in real-time as the user hovers over board cells to synchronize cursor pointers.
```json
{
  "type": "cursor",
  "r": 5,
  "c": 4
}
```

#### 4. Settings Sync Event (`settings`)
Dispatched by the room owner to update settings.
```json
{
  "type": "settings",
  "time_limit": 300,
  "huff_enabled": true
}
```

#### 5. Stop Chain Event (`stop_chain`)
Dispatched to end a multi-jump sequence when allowed by the rules.
```json
{
  "type": "stop_chain"
}
```

---

### Server ➔ Client Messages

#### 1. Match Found (`match_found`)
```json
{
  "type": "match_found",
  "room_id": "arena-xyz",
  "color": "R"
}
```

#### 2. Board Sync (`sync`)
Dispatched to keep client boards aligned. Returns the full game state.
```json
{
  "type": "sync",
  "state": {
    "board": [
      ["", "B", "", "B", "", "B", "", "B"],
      ["B", "", "B", "", "B", "", "B", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
      ["", "R", "", "R", "", "R", "", "R"],
      ["R", "", "R", "", "R", "", "R", ""]
    ],
    "turn": "R",
    "winner": null,
    "active_jumper": null,
    "time_limit": 300,
    "time_red": 284,
    "time_black": 300,
    "huff_enabled": true
  }
}
```

#### 3. Huff Offer / Huff Warning (`huff_offer` / `huff_warning`)
Dispatched when a player skips a mandatory capture, opening the huff window.
```json
{
  "type": "huff_offer",
  "pos": [5, 2],
  "expires_in": 15
}
```
* **`huff_offer`**: Sent to the capturing player (they have 15s to click "Huff Piece").
* **`huff_warning`**: Sent to the offending player (notifying them their piece can be blown).
