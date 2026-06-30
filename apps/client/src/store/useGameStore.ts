import { create } from 'zustand';

export type Color  = 'R' | 'B';
export type Piece  = 'R' | 'B' | 'RK' | 'BK' | '';
export type Board  = Piece[][];
export type Pos    = [number, number];

export interface MoveRecord {
  player: Color;
  notation: string;
}

export interface HuffOffer {
  pos: Pos;
  expiresAt: number;  // Date.now() + ms
}

export interface GameState {
  board: Board;
  turn: Color;
  winner: string | null;
  activeJumper: Pos | null;

  // Piece counts (computed from live board — always accurate)
  redPieces: number;   // Red pieces remaining on board
  blkPieces: number;   // Black pieces remaining on board

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

  elapsed: number;
  paused: boolean;

  // Actions
  findMatch: () => void;
  cancelMatchmaking: () => void;
  joinRoom: (room: string, color: Color) => void;
  selectCell: (r: number, c: number) => void;
  makeMove: (fromPos: Pos, toPos: Pos) => void;
  resetGame: () => void;
  disconnect: () => void;
  setError: (msg: string | null) => void;
  sendCursor: (r: number, c: number) => void;
  acceptHuff: () => void;
  dismissHuff: () => void;
  tickTimer: () => void;
  togglePause: () => void;
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

  if (activeJumper && (activeJumper[0] !== r || activeJumper[1] !== c)) return [];

  // Check if ANY piece of this player can jump
  let anyJump = false;
  if (!activeJumper) {
    for (let i = 0; i < 8 && !anyJump; i++)
      for (let j = 0; j < 8 && !anyJump; j++)
        if (getOwner(board[i][j]) === turn && getJumps(board, i, j).length > 0)
          anyJump = true;
  }

  const jumps = getJumps(board, r, c);
  if (anyJump || activeJumper) return jumps;
  return getSlides(board, r, c);
}

/* ── Notation ── */
function toNotation(fr: number, fc: number, tr: number, tc: number): string {
  const cols = 'abcdefgh';
  return `${cols[fc]}${8-fr}→${cols[tc]}${8-tr}`;
}

/* ── Count pieces directly from the board ── */
function countPieces(board: Board): { red: number; blk: number } {
  let red = 0, blk = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === 'R' || p === 'RK') red++;
      else if (p === 'B' || p === 'BK') blk++;
    }
  return { red, blk };
}

/* ── Store ── */
export const useGameStore = create<GameState>((set, get) => ({
  board: EMPTY_BOARD,
  turn: 'R',
  winner: null,
  activeJumper: null,
  redPieces: 12,
  blkPieces: 12,
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
  elapsed: 0,
  paused: false,

  /* ── Matchmaking ── */
  findMatch: () => {
    const { socket, matchmakeSocket } = get();
    if (socket) socket.close();
    if (matchmakeSocket) matchmakeSocket.close();

    set({ isMatchmaking: true, error: null });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/matchmake`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => set({ matchmakeSocket: ws });

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'match_found') {
          set({ isMatchmaking: false, matchmakeSocket: null });
          ws.close();
          get().joinRoom(data.room_id, data.color as Color);
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
  joinRoom: (room, color) => {
    const { socket } = get();
    if (socket) socket.close();

    set({
      roomId: room, playerColor: color, error: null,
      connected: false, selectedCell: null, validTargets: [],
      redPieces: 12, blkPieces: 12, capturedCells: [],
      moveHistory: [], elapsed: 0, isMatchmaking: false,
      opponentCursor: null, huffOffer: null,
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${room}/${color}`;
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

          set({
            board: newBoard,
            turn: payload.state.turn,
            winner: payload.state.winner,
            activeJumper: payload.state.active_jumper,
            redPieces: red,
            blkPieces: blk,
            capturedCells: newlyCaptured,
            selectedCell: null,
            validTargets: [],
            error: null,
          });

          // Clear capture-flash cells after animation
          if (newlyCaptured.length > 0) {
            setTimeout(() => {
              if (get().capturedCells === newlyCaptured)
                set({ capturedCells: [] });
            }, 700);
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
        } else if (payload.type === 'huff_offer') {
          const expiresAt = Date.now() + payload.expires_in * 1000;
          set({ huffOffer: { pos: payload.pos as Pos, expiresAt } });
          // Auto-dismiss when expired
          setTimeout(() => {
            const { huffOffer } = get();
            if (huffOffer && Date.now() >= huffOffer.expiresAt)
              set({ huffOffer: null });
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
    const { socket } = get();
    if (socket && socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: 'reset' }));
    set({
      selectedCell: null, validTargets: [],
      redPieces: 12, blkPieces: 12, capturedCells: [],
      moveHistory: [], elapsed: 0, huffOffer: null,
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
      redPieces: 12, blkPieces: 12, capturedCells: [],
      moveHistory: [], roomId: '', playerColor: null,
      error: null, elapsed: 0, opponentCursor: null, huffOffer: null,
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

  /* ── Timer ── */
  tickTimer: () => {
    const { paused, winner } = get();
    if (!paused && !winner) set(s => ({ elapsed: s.elapsed + 1 }));
  },

  togglePause: () => set(s => ({ paused: !s.paused })),
}));
