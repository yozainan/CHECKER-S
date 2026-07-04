import { describe, it, expect, beforeEach } from 'vitest';
import { CheckersEngine } from '@checkers/engine';
import { evaluateBoard, getBestMove } from './index';

describe('AI Evaluation and Minimax', () => {
  let e: CheckersEngine;
  beforeEach(() => {
    e = new CheckersEngine();
  });

  it('should evaluate winner appropriately', () => {
    e.winner = 'R';
    expect(evaluateBoard(e, 'R')).toBe(10000.0);
    expect(evaluateBoard(e, 'B')).toBe(-10000.0);
  });

  it('should find best move using minimax', () => {
    e.board = Array(8)
      .fill(null)
      .map(() => Array(8).fill(''));
    // Setup a simple situation: Red can jump Black
    e.board[5][2] = 'R';
    e.board[4][3] = 'B';
    e.turn = 'R';

    const best = getBestMove(e, 'medium', 'R');
    expect(best).toEqual([5, 2, 3, 4]); // Red jumps to 3,4
  });
});
