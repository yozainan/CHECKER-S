import { Board, Color, EngineState, Piece, Pos } from '@checkers/types';

export class CheckersEngine {
  public board!: Board;
  public turn!: Color;
  public winner!: Color | null;
  public active_jumper!: Pos | null;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.winner = null;
    this.turn = 'R';
    this.active_jumper = null;
    this.initBoard();
  }

  private initBoard(): void {
    this.board = Array(8)
      .fill(null)
      .map(() => Array(8).fill(''));

    // Black — rows 0-2 on dark (odd sum) squares
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          this.board[row][col] = 'B';
        }
      }
    }

    // Red — rows 5-7 on dark squares
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 === 1) {
          this.board[row][col] = 'R';
        }
      }
    }
  }

  public getPieceOwner(piece: Piece): Color | null {
    if (piece === 'R' || piece === 'RK') return 'R';
    if (piece === 'B' || piece === 'BK') return 'B';
    return null;
  }

  public isKing(piece: Piece): boolean {
    return piece === 'RK' || piece === 'BK';
  }

  public hasCaptures(color: Color): boolean {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.getPieceOwner(this.board[r][c]) === color) {
          if (this.getJumps(this.board, r, c).length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  public inBounds(r: number, c: number): boolean {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
  }

  public manDirections(piece: Piece): Pos[] {
    if (piece === 'R') return [[-1, -1], [-1, 1]]; // Red moves up
    if (piece === 'B') return [[1, -1], [1, 1]]; // Black moves down
    return [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
  }

  // Jumps
  public getJumps(board: Board, r: number, c: number): Pos[] {
    const piece = board[r][c];
    const owner = this.getPieceOwner(piece);
    if (!owner) return [];
    if (this.isKing(piece)) {
      return this.kingJumps(board, r, c, owner);
    }
    return this.manJumps(board, r, c, piece, owner);
  }

  private manJumps(board: Board, r: number, c: number, piece: Piece, owner: Color): Pos[] {
    const jumps: Pos[] = [];
    for (const [dr, dc] of this.manDirections(piece)) {
      const overR = r + dr;
      const overC = c + dc;
      const landR = r + 2 * dr;
      const landC = c + 2 * dc;
      if (!this.inBounds(landR, landC)) continue;
      const over = board[overR][overC];
      if (over && this.getPieceOwner(over) !== owner && board[landR][landC] === '') {
        jumps.push([landR, landC]);
      }
    }
    return jumps;
  }

  private kingJumps(board: Board, r: number, c: number, owner: Color): Pos[] {
    const jumps: Pos[] = [];
    const dirs: Pos[] = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      let foundOpponent = false;
      while (this.inBounds(nr, nc)) {
        const cell = board[nr][nc];
        if (cell === '') {
          if (foundOpponent) {
            jumps.push([nr, nc]);
          }
        } else if (this.getPieceOwner(cell) === owner) {
          break; // own piece blocks path
        } else {
          if (foundOpponent) {
            break; // two opponents in same ray
          }
          foundOpponent = true;
        }
        nr += dr;
        nc += dc;
      }
    }
    return jumps;
  }

  // Slides
  public getSlides(board: Board, r: number, c: number): Pos[] {
    const piece = board[r][c];
    if (!this.getPieceOwner(piece)) return [];
    if (this.isKing(piece)) {
      return this.kingSlides(board, r, c);
    }
    return this.manSlides(board, r, c, piece);
  }

  private manSlides(board: Board, r: number, c: number, piece: Piece): Pos[] {
    const slides: Pos[] = [];
    for (const [dr, dc] of this.manDirections(piece)) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.inBounds(nr, nc) && board[nr][nc] === '') {
        slides.push([nr, nc]);
      }
    }
    return slides;
  }

  private kingSlides(board: Board, r: number, c: number): Pos[] {
    const slides: Pos[] = [];
    const dirs: Pos[] = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (this.inBounds(nr, nc) && board[nr][nc] === '') {
        slides.push([nr, nc]);
        nr += dr;
        nc += dc;
      }
    }
    return slides;
  }

  // Find captured piece
  public findCapturedPiece(fromR: number, fromC: number, toR: number, toC: number): Pos | null {
    const dr = toR > fromR ? 1 : -1;
    const dc = toC > fromC ? 1 : -1;
    let r = fromR + dr;
    let c = fromC + dc;
    while (r !== toR && c !== toC) {
      if (this.board[r][c] !== '') {
        return [r, c];
      }
      r += dr;
      c += dc;
    }
    return null;
  }

  public getAllValidMoves(color: Color): Map<string, Pos[]> {
    const allMoves = new Map<string, Pos[]>();

    if (this.active_jumper) {
      const [ar, ac] = this.active_jumper;
      const jumps = this.getJumps(this.board, ar, ac);
      if (jumps.length > 0) {
        allMoves.set(`${ar},${ac}`, jumps);
      }
      return allMoves;
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.getPieceOwner(this.board[r][c]) === color) {
          const destinations = [
            ...this.getJumps(this.board, r, c),
            ...this.getSlides(this.board, r, c),
          ];
          if (destinations.length > 0) {
            allMoves.set(`${r},${c}`, destinations);
          }
        }
      }
    }
    return allMoves;
  }

  public makeMove(fromR: number, fromC: number, toR: number, toC: number): boolean {
    if (this.winner) return false;

    const validMoves = this.getAllValidMoves(this.turn);
    const key = `${fromR},${fromC}`;
    const dests = validMoves.get(key);

    if (!dests || !dests.some(([tr, tc]) => tr === toR && tc === toC)) {
      return false;
    }

    const piece = this.board[fromR][fromC];
    const capturedPos = this.findCapturedPiece(fromR, fromC, toR, toC);
    const isJump = capturedPos !== null;

    // Apply move
    this.board[fromR][fromC] = '';
    this.board[toR][toC] = piece;

    // Remove captured piece
    if (isJump && capturedPos) {
      this.board[capturedPos[0]][capturedPos[1]] = '';
    }

    // King promotion
    let promoted = false;
    if (piece === 'R' && toR === 0) {
      this.board[toR][toC] = 'RK';
      promoted = true;
    } else if (piece === 'B' && toR === 7) {
      this.board[toR][toC] = 'BK';
      promoted = true;
    }

    // Multi-jump continuation
    if (isJump && !promoted) {
      const further = this.getJumps(this.board, toR, toC);
      if (further.length > 0) {
        this.active_jumper = [toR, toC];
        return true;
      }
    }

    // End of turn
    this.active_jumper = null;
    this.turn = this.turn === 'R' ? 'B' : 'R';
    this.checkWinner();
    return true;
  }

  public huffPiece(r: number, c: number): boolean {
    if (this.winner) return false;
    const piece = this.board[r][c];
    if (!piece) return false;
    this.board[r][c] = '';
    this.active_jumper = null;
    this.checkWinner();
    return true;
  }

  public stopChain(): boolean {
    if (this.winner) return false;
    if (!this.active_jumper) return false;
    this.active_jumper = null;
    this.turn = this.turn === 'R' ? 'B' : 'R';
    this.checkWinner();
    return true;
  }

  public checkWinner(): void {
    let hasPieces = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.getPieceOwner(this.board[r][c]) === this.turn) {
          hasPieces = true;
          break;
        }
      }
      if (hasPieces) break;
    }

    if (!hasPieces || this.getAllValidMoves(this.turn).size === 0) {
      this.winner = this.turn === 'R' ? 'B' : 'R';
    }
  }

  public getState(): EngineState {
    return {
      board: this.board,
      turn: this.turn,
      winner: this.winner,
      active_jumper: this.active_jumper,
    };
  }

  public clone(): CheckersEngine {
    const next = new CheckersEngine();
    next.board = this.board.map((row: Piece[]) => [...row]);
    next.turn = this.turn;
    next.winner = this.winner;
    next.active_jumper = this.active_jumper ? [...this.active_jumper] : null;
    return next;
  }
}
