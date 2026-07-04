import { describe, it, expect, beforeEach } from 'vitest';
import { CheckersEngine } from './index';
import { Color, Pos } from '@checkers/types';

describe('TestInitialState', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should start with red turn', () => {
    expect(e.turn).toBe('R');
  });

  it('should have no winner at start', () => {
    expect(e.winner).toBeNull();
  });

  it('should have active jumper null at start', () => {
    expect(e.active_jumper).toBeNull();
  });

  it('should count 12 red pieces', () => {
    let count = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (e.board[r][c] === 'R') count++;
      }
    }
    expect(count).toBe(12);
  });

  it('should count 12 black pieces', () => {
    let count = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (e.board[r][c] === 'B') count++;
      }
    }
    expect(count).toBe(12);
  });

  it('should have middle rows empty', () => {
    for (let r = 3; r < 5; r++) {
      for (let c = 0; c < 8; c++) {
        expect(e.board[r][c]).toBe('');
      }
    }
  });

  it('should place red pieces only on dark squares', () => {
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          expect(e.board[r][c]).toBe('R');
        } else {
          expect(e.board[r][c]).toBe('');
        }
      }
    }
  });
});

describe('TestSlides', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should slide red upward', () => {
    const ok = e.makeMove(5, 0, 4, 1);
    expect(ok).toBe(true);
    expect(e.board[4][1]).toBe('R');
    expect(e.board[5][0]).toBe('');
  });

  it('should not slide red backward', () => {
    const ok = e.makeMove(5, 0, 6, 1);
    expect(ok).toBe(false);
  });

  it('should slide black downward', () => {
    e.turn = 'B';
    const ok = e.makeMove(2, 1, 3, 0);
    expect(ok).toBe(true);
    expect(e.board[3][0]).toBe('B');
    expect(e.board[2][1]).toBe('');
  });

  it('should fail to slide to occupied cell', () => {
    const ok = e.makeMove(5, 2, 6, 1);
    expect(ok).toBe(false);
  });
});

describe('TestCaptures', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should execute basic capture', () => {
    e.board[4][3] = 'B';
    const ok = e.makeMove(5, 2, 3, 4);
    expect(ok).toBe(true);
    expect(e.board[5][2]).toBe('');
    expect(e.board[4][3]).toBe('');
    expect(e.board[3][4]).toBe('R');
  });

  it('should allow slide when jump exists', () => {
    e.board[4][3] = 'B';
    const ok = e.makeMove(5, 0, 4, 1);
    expect(ok).toBe(true);
  });

  it('should switch turn when no further jumps', () => {
    e.board[4][3] = 'B';
    e.makeMove(5, 2, 3, 4);
    expect(e.turn).toBe('B');
  });
});

describe('TestMultiJump', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
    e.active_jumper = null;
    e.winner = null;
  });

  const place = (piece: any, r: number, c: number) => {
    e.board[r][c] = piece;
  };

  it('should multi jump and stay same turn', () => {
    place('R', 7, 0);
    place('B', 6, 1);
    place('B', 4, 3);
    e.turn = 'R';

    let ok = e.makeMove(7, 0, 5, 2);
    expect(ok).toBe(true);
    expect(e.board[6][1]).toBe('');
    expect(e.board[5][2]).toBe('R');
    expect(e.turn).toBe('R');
    expect(e.active_jumper).toEqual([5, 2]);

    ok = e.makeMove(5, 2, 3, 4);
    expect(ok).toBe(true);
    expect(e.board[4][3]).toBe('');
    expect(e.board[3][4]).toBe('R');
    expect(e.turn).toBe('B');
    expect(e.active_jumper).toBeNull();
  });

  it('should restrict movement to active jumper', () => {
    place('R', 7, 0);
    place('B', 6, 1);
    place('B', 4, 3);
    place('R', 7, 4);
    e.turn = 'R';

    e.makeMove(7, 0, 5, 2);
    expect(e.active_jumper).toEqual([5, 2]);

    const ok = e.makeMove(7, 4, 6, 5);
    expect(ok).toBe(false);
  });
});

describe('TestKingPromotion', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
  });

  it('should promote red to king on row 0', () => {
    e.board[1][2] = 'R';
    e.turn = 'R';
    const ok = e.makeMove(1, 2, 0, 3);
    expect(ok).toBe(true);
    expect(e.board[0][3]).toBe('RK');
  });

  it('should promote black to king on row 7', () => {
    e.board[6][3] = 'B';
    e.turn = 'B';
    const ok = e.makeMove(6, 3, 7, 4);
    expect(ok).toBe(true);
    expect(e.board[7][4]).toBe('BK');
  });
});

describe('TestKingMovement', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
  });

  it('should slide king backward', () => {
    e.board[3][3] = 'RK';
    e.turn = 'R';
    const ok = e.makeMove(3, 3, 4, 4);
    expect(ok).toBe(true);
    expect(e.board[4][4]).toBe('RK');
  });

  it('should capture backward', () => {
    e.board[3][3] = 'RK';
    e.board[4][4] = 'BK';
    e.turn = 'R';
    const ok = e.makeMove(3, 3, 5, 5);
    expect(ok).toBe(true);
    expect(e.board[4][4]).toBe('');
    expect(e.board[5][5]).toBe('RK');
  });
});

describe('TestWinCondition', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
  });

  it('should win when opponent has no pieces', () => {
    e.board[4][3] = 'B';
    e.board[5][2] = 'R';
    e.turn = 'R';
    e.makeMove(5, 2, 3, 4);
    expect(e.winner).toBe('R');
  });

  it('should win when opponent has no moves', () => {
    e.board[0][1] = 'R';
    e.board[1][0] = 'B';
    e.board[1][2] = 'B';
    e.board[2][3] = 'B';
    e.board[7][7] = 'B'; // black piece has moves
    e.turn = 'R';

    e.checkWinner();
    expect(e.winner).toBe('B');
  });
});

describe('TestHelpers', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should get owner of pieces', () => {
    expect(e.getPieceOwner('R')).toBe('R');
    expect(e.getPieceOwner('RK')).toBe('R');
    expect(e.getPieceOwner('B')).toBe('B');
    expect(e.getPieceOwner('BK')).toBe('B');
    expect(e.getPieceOwner('')).toBeNull();
  });

  it('should identify king status', () => {
    expect(e.isKing('RK')).toBe(true);
    expect(e.isKing('BK')).toBe(true);
    expect(e.isKing('R')).toBe(false);
    expect(e.isKing('B')).toBe(false);
    expect(e.isKing('')).toBe(false);
  });
});

describe('TestGetState', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should return serializable state object', () => {
    const state = e.getState();
    expect(state).toHaveProperty('board');
    expect(state).toHaveProperty('turn');
    expect(state).toHaveProperty('winner');
    expect(state).toHaveProperty('active_jumper');
    expect(state.active_jumper).toBeNull();
  });

  it('should reflect active jumper in state', () => {
    e.active_jumper = [2, 3];
    const state = e.getState();
    expect(state.active_jumper).toEqual([2, 3]);
  });
});

describe('TestReset', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should restore board and state on reset', () => {
    e.makeMove(5, 0, 4, 1);
    e.winner = 'R';
    e.reset();

    expect(e.winner).toBeNull();
    expect(e.turn).toBe('R');
    expect(e.board[5][0]).toBe('R');
    expect(e.board[4][1]).toBe('');
  });
});

describe('TestHuffRules', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should allow slides when captures exist', () => {
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
    e.board[5][2] = 'R';
    e.board[4][3] = 'B';
    e.turn = 'R';

    const moves = e.getAllValidMoves('R');
    const key = '5,2';
    expect(moves.has(key)).toBe(true);
    const dests = moves.get(key)!;
    expect(dests).toContainEqual([3, 4]); // jump
    expect(dests).toContainEqual([4, 1]); // slide
  });

  it('should remove piece without switching turn', () => {
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
    e.board[4][1] = 'R';
    e.turn = 'B';

    const ok = e.huffPiece(4, 1);
    expect(ok).toBe(true);
    expect(e.board[4][1]).toBe('');
    expect(e.turn).toBe('B');
  });

  it('should end chain with stop_chain', () => {
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
    e.board[3][4] = 'R';
    e.active_jumper = [3, 4];
    e.turn = 'R';

    const ok = e.stopChain();
    expect(ok).toBe(true);
    expect(e.active_jumper).toBeNull();
    expect(e.turn).toBe('B');
  });
});

describe('TestHuffTarget', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  const getJumpingPositions = (color: Color): Pos[] => {
    const positions: Pos[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (e.getPieceOwner(e.board[r][c]) === color) {
          if (e.getJumps(e.board, r, c).length > 0) {
            positions.push([r, c]);
          }
        }
      }
    }
    return positions;
  };

  it('should set huff target to destination if jumper moved', () => {
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
    e.board[5][2] = 'R';
    e.board[4][3] = 'B';
    e.turn = 'R';

    const fromPos: Pos = [5, 2];
    const toPos: Pos = [4, 1];
    const jumpingBefore = getJumpingPositions('R');

    e.makeMove(fromPos[0], fromPos[1], toPos[0], toPos[1]);

    const isMatch = jumpingBefore.some(([r, c]) => r === fromPos[0] && c === fromPos[1]);
    let huffTarget: Pos;
    if (isMatch) {
      huffTarget = toPos;
    } else {
      huffTarget = jumpingBefore[0];
    }

    expect(huffTarget).toEqual([4, 1]);
  });

  it('should set huff target to original piece if different piece moved', () => {
    e.board = Array(8).fill(null).map(() => Array(8).fill(''));
    e.board[5][2] = 'R'; // can jump
    e.board[4][3] = 'B';
    e.board[5][6] = 'R'; // can slide

    const fromPos: Pos = [5, 6];
    const toPos: Pos = [4, 5];
    const jumpingBefore = getJumpingPositions('R');

    e.makeMove(fromPos[0], fromPos[1], toPos[0], toPos[1]);

    const isMatch = jumpingBefore.some(([r, c]) => r === fromPos[0] && c === fromPos[1]);
    let huffTarget: Pos;
    if (isMatch) {
      huffTarget = toPos;
    } else {
      huffTarget = jumpingBefore[0];
    }

    expect(huffTarget).toEqual([5, 2]);
  });
});
