import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';
import { Color, Pos, EngineState } from '@checkers/types';
import { CheckersEngine } from '@checkers/engine';
import { getBestMove } from '@checkers/ai';
import {
  GenericMessageSchema,
  toNotation,
  countPieces,
  DEFAULT_TIME_LIMIT,
} from '@checkers/shared';

const app = Fastify({ logger: true });

// Register CORS for client requests
app.register(fastifyCors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Register WebSocket plugin
app.register(fastifyWebsocket);

interface Room {
  engine: CheckersEngine;
  connections: { R?: any; B?: any };
  is_ai: boolean;
  ai_color: Color | null;
  ai_difficulty: string;
  huff_pending: { pos: Pos; for: Color } | null;
  huff_enabled: boolean;
  time_limit: number | null;
  time_red: number;
  time_black: number;
  ai_task_id: string | null;
  history: any[];
}

const rooms: Record<string, Room> = {};

// Helper to sleep
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Timer tick background task
const startTimerTask = () => {
  setInterval(() => {
    for (const roomId of Object.keys(rooms)) {
      const room = rooms[roomId];
      if (!room) continue;

      const engine = room.engine;
      if (engine.winner) continue;
      if (room.time_limit === null) continue;

      // Only tick if at least one connection exists
      if (!room.connections.R && !room.connections.B) continue;

      const turn = engine.turn;
      if (turn === 'R') {
        room.time_red = Math.max(0, room.time_red - 1);
        if (room.time_red <= 0) {
          engine.winner = 'B';
          broadcastState(roomId);
        }
      } else if (turn === 'B') {
        room.time_black = Math.max(0, room.time_black - 1);
        if (room.time_black <= 0) {
          engine.winner = 'R';
          broadcastState(roomId);
        }
      }
    }
  }, 1000);
};

startTimerTask();

// Matchmaking queue
interface MatchmakerPlayer {
  socket: any;
  joinedAt: number;
}
let matchmakingQueue: MatchmakerPlayer[] = [];

function getOrCreateRoom(roomId: string): Room {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      engine: new CheckersEngine(),
      connections: {},
      is_ai: false,
      ai_color: null,
      ai_difficulty: 'medium',
      huff_pending: null,
      huff_enabled: true,
      time_limit: DEFAULT_TIME_LIMIT,
      time_red: DEFAULT_TIME_LIMIT,
      time_black: DEFAULT_TIME_LIMIT,
      ai_task_id: null,
      history: [],
    };
  }
  return rooms[roomId];
}

async function broadcastState(roomId: string): Promise<void> {
  const room = rooms[roomId];
  if (!room) return;

  const state = room.engine.getState() as any;
  state.time_limit = room.time_limit;
  state.time_red = Math.floor(room.time_red);
  state.time_black = Math.floor(room.time_black);
  state.huff_enabled = room.huff_enabled;

  const payload = JSON.stringify({ type: 'sync', state });

  for (const color of ['R', 'B'] as Color[]) {
    const ws = room.connections[color];
    if (ws && ws.readyState === 1 /* OPEN */) {
      try {
        ws.send(payload);
      } catch (err) {
        app.log.error(`Failed to send to ${color} in room ${roomId}: ${err}`);
      }
    }
  }
}

function getRoomSnapshot(room: Room) {
  const engine = room.engine;
  return {
    engine_state: {
      board: engine.board.map((row) => [...row]),
      turn: engine.turn,
      winner: engine.winner,
      active_jumper: engine.active_jumper ? [...engine.active_jumper] : null,
    },
    time_red: room.time_red,
    time_black: room.time_black,
    huff_pending: room.huff_pending
      ? { pos: [...room.huff_pending.pos], for: room.huff_pending.for }
      : null,
  };
}

async function processMove(
  roomId: string,
  playerColor: Color,
  fromPos: [number, number],
  toPos: [number, number]
): Promise<boolean> {
  const room = rooms[roomId];
  if (!room) return false;

  const engine = room.engine;
  const oppColor: Color = playerColor === 'R' ? 'B' : 'R';
  const snapshot = getRoomSnapshot(room);

  const inChain = engine.active_jumper !== null;
  const hadCaptures = !inChain && engine.hasCaptures(playerColor);

  const jumpingPositions: Pos[] = [];
  if (hadCaptures) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (engine.getPieceOwner(engine.board[r][c]) === playerColor) {
          if (engine.getJumps(engine.board, r, c).length > 0) {
            jumpingPositions.push([r, c]);
          }
        }
      }
    }
  }

  const { red: redBefore, blk: blkBefore } = countPieces(engine.board);
  const piecesBefore = redBefore + blkBefore;

  const success = engine.makeMove(fromPos[0], fromPos[1], toPos[0], toPos[1]);

  if (success) {
    room.history.push(snapshot);
    if (room.history.length > 100) {
      room.history.shift();
    }

    room.huff_pending = null; // Clear any stale huff

    // Huff offer on skipped capture
    if (hadCaptures) {
      const { red: redAfter, blk: blkAfter } = countPieces(engine.board);
      const piecesAfter = redAfter + blkAfter;
      const wasJump = piecesAfter < piecesBefore;

      if (!wasJump && jumpingPositions.length > 0) {
        let huffPos: Pos;
        const fromMatch = jumpingPositions.some(([r, c]) => r === fromPos[0] && c === fromPos[1]);
        if (fromMatch) {
          // Player slid the piece that could have jumped
          huffPos = [toPos[0], toPos[1]];
        } else {
          // Player slid a different piece; target first piece that could jump
          huffPos = jumpingPositions[0];
        }

        if (room.huff_enabled) {
          room.huff_pending = { pos: huffPos, for: oppColor };

          // Send huff offer to the player who can take it
          const oppWs = room.connections[oppColor];
          if (oppWs && oppWs.readyState === 1) {
            try {
              oppWs.send(
                JSON.stringify({
                  type: 'huff_offer',
                  pos: huffPos,
                  expires_in: 2,
                })
              );
            } catch {}
          }

          // Send warning to the guilty player
          const currWs = room.connections[playerColor];
          if (currWs && currWs.readyState === 1) {
            try {
              currWs.send(
                JSON.stringify({
                  type: 'huff_warning',
                  pos: huffPos,
                  expires_in: 1,
                })
              );
            } catch {}
          }
        }
      }
    }

    await broadcastState(roomId);
    return true;
  }

  return false;
}

function scheduleAITurn(roomId: string) {
  const room = rooms[roomId];
  if (!room || !room.is_ai) return;

  const taskId = uuidv4().substring(0, 8);
  room.ai_task_id = taskId;

  handleAITurn(roomId, taskId);
}

async function handleAITurn(roomId: string, taskId: string) {
  const room = rooms[roomId];
  if (!room || !room.is_ai) return;

  const checkCancelled = () => {
    const current = rooms[roomId];
    return !current || current.ai_task_id !== taskId || current.engine.winner !== null;
  };

  // 1. AI Huff execution
  const pending = room.huff_pending;
  if (pending && pending.for === room.ai_color && room.huff_enabled) {
    await sleep(1000);
    if (checkCancelled()) return;

    // Verify still pending
    const pendingNow = room.huff_pending;
    if (pendingNow && pendingNow.for === room.ai_color) {
      const pos = pendingNow.pos;
      const ok = room.engine.huffPiece(pos[0], pos[1]);
      if (ok) {
        room.huff_pending = null;
        await broadcastState(roomId);
        await sleep(500);
        if (checkCancelled()) return;
      }
    }
  }

  if (room.engine.turn !== room.ai_color || room.engine.winner) {
    return;
  }

  await sleep(1000);
  if (checkCancelled()) return;

  while (room.engine.turn === room.ai_color && !room.engine.winner) {
    const bestMove = getBestMove(room.engine, room.ai_difficulty, room.ai_color);
    if (bestMove) {
      app.log.info(`AI ${room.ai_color} makes move ${bestMove} in room ${roomId}`);
      const success = await processMove(
        roomId,
        room.ai_color,
        [bestMove[0], bestMove[1]],
        [bestMove[2], bestMove[3]]
      );
      if (!success) break;
      if (checkCancelled()) return;

      if (room.engine.turn === room.ai_color) {
        await sleep(1000);
        if (checkCancelled()) return;
      }
    } else {
      break;
    }
  }
}

// REST endpoints
app.get('/', async () => {
  return { status: 'ok', message: 'Checkers Backend running' };
});

app.post('/api/rooms/:roomId/reset', async (request, reply) => {
  const { roomId } = request.params as { roomId: string };
  const room = getOrCreateRoom(roomId);
  room.engine.reset();
  room.huff_pending = null;
  room.history = [];
  room.time_red = room.time_limit ?? DEFAULT_TIME_LIMIT;
  room.time_black = room.time_limit ?? DEFAULT_TIME_LIMIT;

  broadcastState(roomId);

  if (room.is_ai && room.engine.turn === room.ai_color) {
    scheduleAITurn(roomId);
  }

  return { status: 'reset', room_id: roomId };
});

// Websocket route registers
app.register(async function (fastify) {
  // 1. Matchmaking
  fastify.get('/ws/matchmake', { websocket: true }, (connection, req) => {
    const player: MatchmakerPlayer = {
      socket: connection.socket,
      joinedAt: Date.now(),
    };
    matchmakingQueue.push(player);
    app.log.info(`Player joined matchmaking queue. Queue size: ${matchmakingQueue.length}`);

    const matchInterval = setInterval(() => {
      if (connection.socket.readyState !== 1) {
        clearInterval(matchInterval);
        return;
      }

      if (matchmakingQueue.length >= 2) {
        if (matchmakingQueue[0] === player || matchmakingQueue[1] === player) {
          const p1 = matchmakingQueue.shift()!;
          let p2: MatchmakerPlayer;
          if (p1 === player) {
            p2 = matchmakingQueue.shift()!;
          } else {
            matchmakingQueue = matchmakingQueue.filter((p) => p !== player);
            p2 = player;
          }

          const roomId = uuidv4().substring(0, 8);
          try {
            p1.socket.send(JSON.stringify({ type: 'match_found', room_id: roomId, color: 'R' }));
            p2.socket.send(JSON.stringify({ type: 'match_found', room_id: roomId, color: 'B' }));
          } catch {}

          clearInterval(matchInterval);
          return;
        }
      }

      // AI Fallback after 15s
      const waitTime = (Date.now() - player.joinedAt) / 1000;
      if (waitTime > 15.0) {
        matchmakingQueue = matchmakingQueue.filter((p) => p !== player);
        const roomId = `ai-${uuidv4().substring(0, 6)}`;
        const room = getOrCreateRoom(roomId);
        room.is_ai = true;
        room.ai_color = 'B';
        room.ai_difficulty = 'medium';

        try {
          player.socket.send(JSON.stringify({ type: 'match_found', room_id: roomId, color: 'R' }));
        } catch {}

        clearInterval(matchInterval);
      }
    }, 1000);

    connection.socket.on('message', (message: string) => {
      if (message.toString() === 'cancel') {
        matchmakingQueue = matchmakingQueue.filter((p) => p !== player);
        clearInterval(matchInterval);
        connection.socket.close();
      }
    });

    connection.socket.on('close', () => {
      matchmakingQueue = matchmakingQueue.filter((p) => p !== player);
      clearInterval(matchInterval);
    });
  });

  // 2. Room Game socket
  fastify.get('/ws/:roomId/:playerColor', { websocket: true }, (connection, req) => {
    const { roomId, playerColor } = req.params as { roomId: string; playerColor: string };

    if (playerColor !== 'R' && playerColor !== 'B') {
      connection.socket.close(4000, 'Invalid player color. Must be R or B.');
      return;
    }

    const room = getOrCreateRoom(roomId);
    room.connections[playerColor] = connection.socket;

    if (roomId.startsWith('ai-')) {
      room.is_ai = true;
      room.ai_color = playerColor === 'R' ? 'B' : 'R';
    } else {
      if (Object.keys(room.connections).length === 1) {
        room.is_ai = true;
        room.ai_color = playerColor === 'R' ? 'B' : 'R';
      } else {
        room.is_ai = false;
        room.ai_color = null;
      }
    }

    app.log.info(
      `Player ${playerColor} connected to room ${roomId} (AI: ${room.is_ai}, AI color: ${room.ai_color})`
    );

    // Sync state immediately
    try {
      connection.socket.send(JSON.stringify({ type: 'sync', state: room.engine.getState() }));
      broadcastState(roomId);
      if (room.is_ai && room.engine.turn === room.ai_color) {
        scheduleAITurn(roomId);
      }
    } catch (err) {
      app.log.error(`Error on initial sync: ${err}`);
    }

    const oppColor: Color = playerColor === 'R' ? 'B' : 'R';

    connection.socket.on('message', async (data: string) => {
      try {
        const raw = JSON.parse(data);
        const parsed = GenericMessageSchema.safeParse(raw);
        if (!parsed.success) {
          connection.socket.send(
            JSON.stringify({ type: 'error', message: 'Invalid payload schema.' })
          );
          return;
        }

        const message = parsed.data;

        // Move
        if (message.type === 'move') {
          if (room.engine.turn !== playerColor) {
            connection.socket.send(JSON.stringify({ type: 'error', message: 'It is not your turn.' }));
            return;
          }

          const success = await processMove(roomId, playerColor, message.from_pos, message.to_pos);
          if (success) {
            if (room.is_ai && room.engine.turn === room.ai_color && !room.engine.winner) {
              scheduleAITurn(roomId);
            }
          } else {
            connection.socket.send(JSON.stringify({ type: 'error', message: 'Invalid move.' }));
          }
        }

        // Huff
        else if (message.type === 'huff') {
          const pending = room.huff_pending;
          if (pending && pending.for === playerColor) {
            const snapshot = getRoomSnapshot(room);
            const ok = room.engine.huffPiece(message.pos[0], message.pos[1]);
            if (ok) {
              room.history.push(snapshot);
              if (room.history.length > 100) {
                room.history.shift();
              }
              room.huff_pending = null;
              await broadcastState(roomId);

              if (room.is_ai && room.engine.turn === room.ai_color && !room.engine.winner) {
                scheduleAITurn(roomId);
              }
            } else {
              connection.socket.send(JSON.stringify({ type: 'error', message: 'Huff failed.' }));
            }
          } else {
            connection.socket.send(JSON.stringify({ type: 'error', message: 'No active huff offer.' }));
          }
        }

        // Cursor relay
        else if (message.type === 'cursor') {
          const oppWs = room.connections[oppColor];
          if (oppWs && oppWs.readyState === 1) {
            try {
              oppWs.send(
                JSON.stringify({
                  type: 'opponent_cursor',
                  r: message.r,
                  c: message.c,
                })
              );
            } catch {}
          }
        }

        // Reset
        else if (message.type === 'reset') {
          room.engine.reset();
          room.huff_pending = null;
          room.history = [];
          room.time_red = room.time_limit ?? DEFAULT_TIME_LIMIT;
          room.time_black = room.time_limit ?? DEFAULT_TIME_LIMIT;
          await broadcastState(roomId);

          if (room.is_ai && room.engine.turn === room.ai_color) {
            scheduleAITurn(roomId);
          }
        }

        // Undo
        else if (message.type === 'undo') {
          if (room.history.length > 0) {
            const lastState = room.history.pop()!;

            // Restore engine state
            const engine = room.engine;
            const engineState = lastState.engine_state;
            engine.board = engineState.board.map((row: string[]) => [...row]);
            engine.turn = engineState.turn;
            engine.winner = engineState.winner;
            engine.active_jumper = engineState.active_jumper as Pos | null;

            // Restore room state
            room.time_red = lastState.time_red;
            room.time_black = lastState.time_black;
            room.huff_pending = lastState.huff_pending;

            // Invalidate AI task if it is now human turn
            if (room.is_ai && engine.turn !== room.ai_color) {
              room.ai_task_id = null;
            }

            await broadcastState(roomId);

            if (room.is_ai && engine.turn === room.ai_color && !engine.winner) {
              scheduleAITurn(roomId);
            }
          } else {
            connection.socket.send(JSON.stringify({ type: 'error', message: 'No moves to undo.' }));
          }
        }

        // Settings
        else if (message.type === 'settings') {
          room.time_limit = message.time_limit;
          room.time_red = message.time_limit ?? DEFAULT_TIME_LIMIT;
          room.time_black = message.time_limit ?? DEFAULT_TIME_LIMIT;
          if (message.huff_enabled !== undefined) {
            room.huff_enabled = message.huff_enabled;
            if (!room.huff_enabled) {
              room.huff_pending = null;
            }
          }
          await broadcastState(roomId);
        }

        // Stop chain
        else if (message.type === 'stop_chain') {
          if (room.engine.turn !== playerColor) {
            connection.socket.send(JSON.stringify({ type: 'error', message: 'Not your turn.' }));
            return;
          }
          const snapshot = getRoomSnapshot(room);
          const ok = room.engine.stopChain();
          if (ok) {
            room.history.push(snapshot);
            if (room.history.length > 100) {
              room.history.shift();
            }
            await broadcastState(roomId);
            if (room.is_ai && room.engine.turn === room.ai_color && !room.engine.winner) {
              scheduleAITurn(roomId);
            }
          } else {
            connection.socket.send(JSON.stringify({ type: 'error', message: 'No active chain to stop.' }));
          }
        }
      } catch (err) {
        connection.socket.send(
          JSON.stringify({ type: 'error', message: 'Error processing message.' })
        );
      }
    });

    connection.socket.on('close', () => {
      app.log.info(`Player ${playerColor} disconnected from room ${roomId}`);
      if (rooms[roomId]) {
        if (rooms[roomId].connections[playerColor] === connection.socket) {
          delete rooms[roomId].connections[playerColor];
        }

        if (!rooms[roomId].connections.R && !rooms[roomId].connections.B) {
          delete rooms[roomId];
        } else {
          // One player remains; set remaining side to AI
          rooms[roomId].is_ai = true;
          rooms[roomId].ai_color = playerColor;
          broadcastState(roomId);

          if (rooms[roomId].engine.turn === playerColor) {
            scheduleAITurn(roomId);
          }
        }
      }
    });
  });
});

// Run standalone server if NODE_ENV is dev or port is present
const startServer = async () => {
  const port = Number(process.env.PORT) || 8000;
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server is listening on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'production' || process.env.STANDALONE === 'true') {
  startServer();
}

// Vercel serverless integration
export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit('request', req, res);
}
