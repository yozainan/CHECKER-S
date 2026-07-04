import { create } from 'zustand';
import type { Color, Piece, Board, Pos, MoveRecord, HuffOffer, ActivePiece } from '@checkers/types';
import { toNotation, countPieces } from '@checkers/shared';

export interface GameState {
  board: Board;
  turn: Color;
  winner: string | null;
  activeJumper: Pos | null;

  // Active pieces tracking for smooth animations
  pieces: ActivePiece[];

  // Chess clock remaining timers (in seconds)
  timeLeftRed: number;
  timeLeftBlack: number;
  timeLimit: number | null; // Selected time limit (e.g. 300) or null (none)

  // Piece counts (computed from live board — always accurate)
  redPieces: number;   // Red pieces remaining on board
  blkPieces: number;   // Black pieces remaining on board

  // Captured piece counts (starts at 0, +1 per capture)
  capturedByRed: number;   // Black pieces Red has taken
  capturedByBlack: number; // Red pieces Black has taken

  // Cells that just got captured (for flash animation)
  capturedCells: Pos[];

  moveHistory: MoveRecord[];

  roomId: string;
  playerColor: Color | null;
  connected: boolean;
  isMatchmaking: boolean;
  error: string | null;
  socket: WebSocket | null;
  matchmakeSocket: WebSocket | null;

  selectedCell: Pos | null;
  validTargets: Pos[];

  opponentCursor: Pos | null;   // Cell the opponent is hovering over
  huffOffer: HuffOffer | null;  // Pending huff offer from server
  huffWarning: HuffOffer | null; // Warning that my piece might get huffed
  huffEnabled: boolean;         // Whether the huff rule is active (settings toggle)


  isPrivate: boolean;
  elapsed: number;
  paused: boolean;

  // Actions
  findMatch: () => void;
  cancelMatchmaking: () => void;
  joinRoom: (room: string, color: Color, isPrivate?: boolean) => void;
  selectCell: (r: number, c: number) => void;
  makeMove: (fromPos: Pos, toPos: Pos) => void;
  undoMove: () => void;
  resetGame: () => void;
  disconnect: () => void;
  setError: (msg: string | null) => void;
  sendCursor: (r: number, c: number) => void;
  acceptHuff: () => void;
  dismissHuff: () => void;
  setHuffEnabled: (v: boolean) => void;
  tickTimer: () => void;
  togglePause: () => void;
  changeTimeLimit: (limit: number | null) => void;
}

const EMPTY_BOARD: Board = Array(8).fill(null).map(() => Array(8).fill(''));

/* ── Piece owner ── */
function getOwner(p: Piece | undefined): Color | null {
  if (p === 'R' || p === 'RK') return 'R';
  if (p === 'B' || p === 'BK') return 'B';
  return null;
}

function isKing(p: Piece) { return p === 'RK' || p === 'BK'; }
function inBounds(r: number, c: number) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

/* ── Valid-move calculation (mirrors server rules for UI highlighting) ──
   Includes flying-king support.
   ─────────────────────────────────────────────────────────────────── */
function manDirs(p: Piece): [number, number][] {
  if (isKing(p)) return [[-1,-1],[-1,1],[1,-1],[1,1]];
  if (getOwner(p) === 'R') return [[-1,-1],[-1,1]];
  return [[1,-1],[1,1]];
}

function getJumps(board: Board, r: number, c: number): Pos[] {
  const p = board[r][c];
  const owner = getOwner(p);
  if (!owner) return [];

  // Flying king
  if (isKing(p)) {
    const jumps: Pos[] = [];
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]] as [number,number][]) {
      let [nr, nc] = [r + dr, c + dc];
      let foundOpp = false;
      while (inBounds(nr, nc)) {
        const cell = board[nr][nc];
        if (cell === '') {
          if (foundOpp) jumps.push([nr, nc]);
        } else if (getOwner(cell) === owner) {
          break;                    // own piece blocks
        } else {
          if (foundOpp) break;      // two opponents in ray
          foundOpp = true;
        }
        nr += dr; nc += dc;
      }
    }
    return jumps;
  }

  // Regular man
  return manDirs(p).flatMap(([dr, dc]) => {
    const [or, oc] = [r + dr, c + dc];
    const [lr, lc] = [r + 2*dr, c + 2*dc];
    if (!inBounds(lr, lc)) return [];
    const opp = getOwner(board[or]?.[oc]);
    if (opp && opp !== owner && board[lr][lc] === '') return [[lr, lc] as Pos];
    return [];
  });
}

function getSlides(board: Board, r: number, c: number): Pos[] {
  const p = board[r][c];
  if (!getOwner(p)) return [];

  // Flying king
  if (isKing(p)) {
    const slides: Pos[] = [];
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]] as [number,number][]) {
      let [nr, nc] = [r + dr, c + dc];
      while (inBounds(nr, nc) && board[nr][nc] === '') {
        slides.push([nr, nc]);
        nr += dr; nc += dc;
      }
    }
    return slides;
  }

  // Regular man
  return manDirs(p).flatMap(([dr, dc]) => {
    const [nr, nc] = [r + dr, c + dc];
    if (inBounds(nr, nc) && board[nr][nc] === '') return [[nr, nc] as Pos];
    return [];
  });
}

function computeValidTargets(
  board: Board, r: number, c: number,
  activeJumper: Pos | null, turn: Color
): Pos[] {
  const p = board[r]?.[c];
  if (!p || getOwner(p) !== turn) return [];

  // Mid-chain: only the active jumper piece may continue, and only via jumps
  if (activeJumper) {
    if (activeJumper[0] !== r || activeJumper[1] !== c) return [];
    return getJumps(board, r, c);
  }

  // No mandatory capture — show ALL legal destinations (jumps + slides)
  const jumps  = getJumps(board, r, c);
  const slides = getSlides(board, r, c);
  return [...jumps, ...slides];
}


/* ── Active pieces matching for smooth transitions ── */
export function updateActivePieces(oldPieces: ActivePiece[], newBoard: Board): ActivePiece[] {
  const result: ActivePiece[] = [];
  const unmatched = [...oldPieces];

  const newPieces: { r: number; c: number; type: Piece }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (newBoard[r][c] !== '') {
        newPieces.push({ r, c, type: newBoard[r][c] });
      }
    }
  }

  // Pass 1: Exact location matches (dist === 0)
  for (let i = newPieces.length - 1; i >= 0; i--) {
    const np = newPieces[i];
    const owner = getOwner(np.type);
    const exactIdx = unmatched.findIndex(p => p.r === np.r && p.c === np.c && getOwner(p.type) === owner);
    
    if (exactIdx !== -1) {
      const matched = unmatched.splice(exactIdx, 1)[0];
      result.push({ id: matched.id, r: np.r, c: np.c, type: np.type });
      newPieces.splice(i, 1);
    }
  }

  // Pass 2: Closest remaining pieces
  for (const np of newPieces) {
    const owner = getOwner(np.type);
    let bestIdx = -1;
    let minDist = Infinity;
    
    for (let i = 0; i < unmatched.length; i++) {
      const p = unmatched[i];
      if (getOwner(p.type) === owner) {
        const dist = Math.abs(p.r - np.r) + Math.abs(p.c - np.c);
        if (dist < minDist) {
          minDist = dist;
          bestIdx = i;
        }
      }
    }

    if (bestIdx !== -1) {
      const matched = unmatched.splice(bestIdx, 1)[0];
      result.push({ id: matched.id, r: np.r, c: np.c, type: np.type });
    } else {
      const newId = `${owner}-${Math.random().toString(36).substr(2, 9)}`;
      result.push({ id: newId, r: np.r, c: np.c, type: np.type });
    }
  }

  return result;
}
/* ── Helper to resolve WebSocket URL ── */
function getWebSocketUrl(path: string): string {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (backendUrl) {
    const cleanUrl = backendUrl.replace(/^(https?:\/\/|wss?:\/\/)/, '');
    const protocol = backendUrl.startsWith('https://') || backendUrl.startsWith('wss://') ? 'wss:' : 'ws:';
    return `${protocol}//${cleanUrl}${path}`;
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `ws://localhost:8000${path}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

/* ── Store ── */
export const useGameStore = create<GameState>((set, get) => ({
  board: EMPTY_BOARD,
  turn: 'R',
  winner: null,
  activeJumper: null,
  pieces: [],
  timeLeftRed: 300,
  timeLeftBlack: 300,
  timeLimit: 300,
  redPieces: 12,
  blkPieces: 12,
  capturedByRed: 0,
  capturedByBlack: 0,
  capturedCells: [],
  moveHistory: [],
  roomId: '',
  playerColor: null,
  connected: false,
  isMatchmaking: false,
  error: null,
  socket: null,
  matchmakeSocket: null,
  selectedCell: null,
  validTargets: [],
  opponentCursor: null,
  huffOffer: null,
  huffWarning: null,
  huffEnabled: true,
  isPrivate: true,
  elapsed: 0,
  paused: false,

  /* ── Matchmaking ── */
  findMatch: () => {
    const { socket, matchmakeSocket } = get();
    if (socket) socket.close();
    if (matchmakeSocket) matchmakeSocket.close();

    set({ isMatchmaking: true, error: null });

    const wsUrl = getWebSocketUrl('/ws/matchmake');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => set({ matchmakeSocket: ws });

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'match_found') {
          set({ isMatchmaking: false, matchmakeSocket: null });
          ws.close();
          get().joinRoom(data.room_id, data.color as Color, false);
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () =>
      set({ isMatchmaking: false, error: 'Matchmaking connection failed.', matchmakeSocket: null });

    ws.onclose = () =>
      set({ isMatchmaking: false, matchmakeSocket: null });
  },

  cancelMatchmaking: () => {
    const { matchmakeSocket } = get();
    if (matchmakeSocket) { matchmakeSocket.send('cancel'); matchmakeSocket.close(); }
    set({ isMatchmaking: false, matchmakeSocket: null });
  },

  /* ── Join room ── */
  joinRoom: (room, color, isPrivate = true) => {
    const { socket } = get();
    if (socket) socket.close();

    set({
      roomId: room, playerColor: color, error: null,
      connected: false, selectedCell: null, validTargets: [],
      redPieces: 12, blkPieces: 12,
      capturedByRed: 0, capturedByBlack: 0,
      capturedCells: [],
      pieces: [],
      timeLeftRed: 300,
      timeLeftBlack: 300,
      timeLimit: 300,
      moveHistory: [], elapsed: 0, isMatchmaking: false,
      opponentCursor: null, huffOffer: null, huffWarning: null,
      isPrivate,
    });

    const wsUrl = getWebSocketUrl(`/ws/${room}/${color}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => set({ connected: true, socket: ws });

    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);

        /* ── Board sync ── */
        if (payload.type === 'sync') {
          const prev = get();
          const newBoard: Board = payload.state.board;

          // Find newly-empty cells (captures that just happened)
          const newlyCaptured: Pos[] = [];
          for (let r = 0; r < 8; r++)
            for (let c = 0; c < 8; c++) {
              const was = prev.board[r]?.[c];
              if (was && (was as string) !== '' && newBoard[r][c] === '')
                newlyCaptured.push([r, c]);
            }

          const { red, blk } = countPieces(newBoard);

          // Captured counts: accumulate from previous (not recomputed from scratch)
          // We use 12 - remaining to always stay accurate even on join
          const capturedByRed   = 12 - blk;   // Black pieces Red has taken
          const capturedByBlack = 12 - red;    // Red pieces Black has taken

          const newActiveJumper: Pos | null = payload.state.active_jumper;


          const timeLimit = payload.state.time_limit !== undefined ? payload.state.time_limit : prev.timeLimit;
          const timeLeftRed = payload.state.time_red !== undefined ? payload.state.time_red : prev.timeLeftRed;
          const timeLeftBlack = payload.state.time_black !== undefined ? payload.state.time_black : prev.timeLeftBlack;
          const huffEnabled = payload.state.huff_enabled !== undefined ? payload.state.huff_enabled : prev.huffEnabled;

          set({
            board: newBoard,
            pieces: updateActivePieces(prev.pieces, newBoard),
            timeLeftRed,
            timeLeftBlack,
            timeLimit,
            huffEnabled,
            turn: payload.state.turn,
            winner: payload.state.winner,
            activeJumper: newActiveJumper,
            redPieces: red,
            blkPieces: blk,
            capturedByRed,
            capturedByBlack,
            capturedCells: newlyCaptured,
            selectedCell: null,
            validTargets: [],
            error: null,
          });

          // ── Auto-continue chain captures ──
          // If active jumper is set and it's our turn, auto-send the next jump
          if (newActiveJumper && payload.state.turn === prev.playerColor) {
            const [jr, jc] = newActiveJumper;
            const chainTargets = getJumps(newBoard, jr, jc);
            if (chainTargets.length > 0) {
              const nextTarget = chainTargets[0];
              setTimeout(() => {
                const current = get();
                if (current.activeJumper && 
                    current.activeJumper[0] === jr && 
                    current.activeJumper[1] === jc &&
                    !current.winner) {
                  current.makeMove([jr, jc], nextTarget);
                }
              }, 1000);
            }
          }

          // Clear capture-flash cells after animation
          if (newlyCaptured.length > 0) {
            setTimeout(() => {
              if (get().capturedCells === newlyCaptured)
                set({ capturedCells: [] });
            }, 1000);
          }

        /* ── Error from server ── */
        } else if (payload.type === 'error') {
          set({ error: payload.message, selectedCell: null, validTargets: [] });
          setTimeout(() => {
            if (get().error === payload.message) set({ error: null });
          }, 3500);

        /* ── Opponent cursor ── */
        } else if (payload.type === 'opponent_cursor') {
          const r = payload.r, c = payload.c;
          if (r == null || c == null) {
            set({ opponentCursor: null });
          } else {
            set({ opponentCursor: [r, c] });
          }

        /* ── Huff offer ── */
        } else if (payload.type === 'huff_offer' || payload.type === 'huff_warning') {
          // If huff rule is disabled in settings, silently ignore
          if (!get().huffEnabled) return;

          const expiresAt = Date.now() + payload.expires_in * 1000;
          if (payload.type === 'huff_offer') {
            set({ huffOffer: { pos: payload.pos as Pos, expiresAt } });
          } else {
            set({ huffWarning: { pos: payload.pos as Pos, expiresAt } });
          }
          
          // Auto-dismiss when expired
          setTimeout(() => {
            const { huffOffer, huffWarning } = get();
            if (huffOffer && Date.now() >= huffOffer.expiresAt)
              set({ huffOffer: null });
            if (huffWarning && Date.now() >= huffWarning.expiresAt)
              set({ huffWarning: null });
          }, (payload.expires_in + 0.5) * 1000);
        }

      } catch { /* ignore */ }
    };

    ws.onclose = () => set({ connected: false, socket: null, opponentCursor: null });
    ws.onerror = () => set({ error: 'Connection lost.', connected: false });
  },

  /* ── Select cell / compute valid targets ── */
  selectCell: (r, c) => {
    const { board, turn, playerColor, activeJumper, selectedCell, validTargets, makeMove } = get();

    // If chain choice modal is showing, ignore board clicks
    // (no longer applicable — chain is auto-continued)

    if (selectedCell) {
      const isTarget = validTargets.some(([tr, tc]) => tr === r && tc === c);
      if (isTarget) { makeMove(selectedCell, [r, c]); return; }
    }

    const piece = board[r]?.[c];
    const owner = getOwner(piece as Piece);
    if (owner !== playerColor || turn !== playerColor) {
      set({ selectedCell: null, validTargets: [] });
      return;
    }

    const targets = computeValidTargets(board, r, c, activeJumper, turn);
    set({ selectedCell: [r, c], validTargets: targets });
  },

  /* ── Make move ── */
  makeMove: (fromPos, toPos) => {
    const { socket, turn, playerColor, moveHistory } = get();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      set({ error: 'Not connected.' }); return;
    }
    if (turn !== playerColor) {
      set({ error: "It's not your turn!" }); return;
    }

    const notation = toNotation(fromPos[0], fromPos[1], toPos[0], toPos[1]);
    set({
      selectedCell: null, validTargets: [],
      moveHistory: [...moveHistory, { player: playerColor!, notation }]
    });
    socket.send(JSON.stringify({ type: 'move', from_pos: fromPos, to_pos: toPos }));
  },


  /* ── Reset ── */
  resetGame: () => {
    const { socket, timeLimit } = get();
    if (socket && socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: 'reset' }));
    set({
      selectedCell: null, validTargets: [],
      winner: null,
      redPieces: 12, blkPieces: 12,
      capturedByRed: 0, capturedByBlack: 0,
      capturedCells: [],
      pieces: [],
      timeLeftRed: timeLimit ?? 300,
      timeLeftBlack: timeLimit ?? 300,
      moveHistory: [], elapsed: 0, huffOffer: null, huffWarning: null,
    });
  },

  /* ── Disconnect ── */
  disconnect: () => {
    const { socket, matchmakeSocket } = get();
    if (socket) socket.close();
    if (matchmakeSocket) matchmakeSocket.close();
    set({
      socket: null, matchmakeSocket: null, connected: false, isMatchmaking: false,
      board: EMPTY_BOARD, turn: 'R', winner: null, activeJumper: null,
      selectedCell: null, validTargets: [],
      pieces: [],
      timeLeftRed: 300,
      timeLeftBlack: 300,
      timeLimit: 300,
      redPieces: 12, blkPieces: 12,
      capturedByRed: 0, capturedByBlack: 0,
      capturedCells: [],
      moveHistory: [], roomId: '', playerColor: null,
      error: null, elapsed: 0, opponentCursor: null, huffOffer: null, huffWarning: null,
      isPrivate: true,
    });
  },

  setError: (msg) => set({ error: msg }),

  /* ── Send cursor position ── */
  sendCursor: (r, c) => {
    const { socket } = get();
    if (socket && socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: 'cursor', r, c }));
  },

  /* ── Huff ── */
  acceptHuff: () => {
    const { socket, huffOffer } = get();
    if (socket && huffOffer) {
      socket.send(JSON.stringify({ type: 'huff', pos: huffOffer.pos }));
      set({ huffOffer: null });
    }
  },

  dismissHuff: () => set({ huffOffer: null }),

  /* ── Huff enabled toggle ── */
  setHuffEnabled: (v: boolean) => {
    set({ huffEnabled: v });
    // If disabling, clear any pending offer locally
    if (!v) set({ huffOffer: null, huffWarning: null });
    // Sync with server so AI respects the setting too
    const { socket, timeLimit } = get();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'settings', time_limit: timeLimit, huff_enabled: v }));
    }
  },

  /* ── Timer ── */
  tickTimer: () => {
    const { paused, winner, timeLimit, turn } = get();
    if (paused || winner) return;

    set(s => {
      const nextElapsed = s.elapsed + 1;
      
      // If chess clock is active, let's also decrement locally for smooth visual countdown in real-time
      if (timeLimit) {
        if (turn === 'R') {
          return {
            elapsed: nextElapsed,
            timeLeftRed: Math.max(0, s.timeLeftRed - 1)
          };
        } else {
          return {
            elapsed: nextElapsed,
            timeLeftBlack: Math.max(0, s.timeLeftBlack - 1)
          };
        }
      }
      return { elapsed: nextElapsed };
    });
  },

  togglePause: () => set(s => ({ paused: !s.paused })),

  changeTimeLimit: (limit: number | null) => {
    const { socket } = get();
    set({ timeLimit: limit, timeLeftRed: limit ?? 300, timeLeftBlack: limit ?? 300 });
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'settings', time_limit: limit }));
    }
  },

  undoMove: () => {
    const { socket, connected, winner } = get();
    if (connected && socket && socket.readyState === WebSocket.OPEN && !winner) {
      socket.send(JSON.stringify({ type: 'undo' }));
    }
  },
}));
