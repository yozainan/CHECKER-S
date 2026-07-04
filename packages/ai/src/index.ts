import { Color, Pos } from '@checkers/types';
import { CheckersEngine } from '@checkers/engine';

export function evaluateBoard(engine: CheckersEngine, aiColor: Color): number {
  if (engine.winner) {
    if (engine.winner === aiColor) {
      return 10000.0;
    } else {
      return -10000.0;
    }
  }

  const oppColor: Color = aiColor === 'R' ? 'B' : 'R';
  let score = 0.0;

  // Weights
  const PIECE_WEIGHT = 10.0;
  const KING_WEIGHT = 20.0; // King advantage multiplier (x2)
  const CENTER_BONUS = 1.0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = engine.board[r][c];
      if (piece === '') continue;

      const owner = engine.getPieceOwner(piece);
      const isAI = owner === aiColor;
      const multiplier = isAI ? 1 : -1;

      // Base piece score
      if (engine.isKing(piece)) {
        score += KING_WEIGHT * multiplier;
      } else {
        score += PIECE_WEIGHT * multiplier;
      }

      // Center control bonus
      if (r >= 2 && r <= 5 && c >= 2 && c <= 5) {
        score += CENTER_BONUS * multiplier;
      }
    }
  }

  // Mobility score
  if (engine.turn === aiColor) {
    const moves = engine.getAllValidMoves(aiColor);
    let count = 0;
    for (const destinations of moves.values()) {
      count += destinations.length;
    }
    score += count * 0.1;
  } else {
    const moves = engine.getAllValidMoves(oppColor);
    let count = 0;
    for (const destinations of moves.values()) {
      count += destinations.length;
    }
    score -= count * 0.1;
  }

  return score;
}

export function minimax(
  engine: CheckersEngine,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: boolean,
  aiColor: Color
): [number, [number, number, number, number] | null] {
  if (depth === 0 || engine.winner) {
    return [evaluateBoard(engine, aiColor), null];
  }

  const validMoves = engine.getAllValidMoves(engine.turn);
  if (validMoves.size === 0) {
    return [evaluateBoard(engine, aiColor), null];
  }

  // Flatten moves into array of [fromR, fromC, toR, toC]
  const allMoves: [number, number, number, number][] = [];
  for (const [fromStr, destinations] of validMoves.entries()) {
    const [fromR, fromC] = fromStr.split(',').map(Number);
    for (const [toR, toC] of destinations) {
      allMoves.push([fromR, fromC, toR, toC]);
    }
  }

  let bestMove: [number, number, number, number] | null = null;

  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const move of allMoves) {
      const engineCopy = engine.clone();
      engineCopy.makeMove(move[0], move[1], move[2], move[3]);

      // If the move resulted in a multi-jump, it's still the maximizing player's turn
      const nextMaximizing = engineCopy.turn === engine.turn;

      const [evalScore] = minimax(engineCopy, depth - 1, alpha, beta, nextMaximizing, aiColor);

      if (evalScore > maxEval) {
        maxEval = evalScore;
        bestMove = move;
      }

      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) {
        break;
      }
    }
    return [maxEval, bestMove];
  } else {
    let minEval = Infinity;
    for (const move of allMoves) {
      const engineCopy = engine.clone();
      engineCopy.makeMove(move[0], move[1], move[2], move[3]);

      const nextMaximizing = !(engineCopy.turn === engine.turn);

      const [evalScore] = minimax(engineCopy, depth - 1, alpha, beta, nextMaximizing, aiColor);

      if (evalScore < minEval) {
        minEval = evalScore;
        bestMove = move;
      }

      beta = Math.min(beta, evalScore);
      if (beta <= alpha) {
        break;
      }
    }
    return [minEval, bestMove];
  }
}

export function getBestMove(
  engine: CheckersEngine,
  difficulty: string,
  aiColor: Color
): [number, number, number, number] | null {
  let depth = 4;
  if (difficulty === 'easy') {
    depth = 2;
  } else if (difficulty === 'medium') {
    depth = 4;
  } else {
    depth = 6;
  }

  // Easy mode: 10% chance of random move
  if (difficulty === 'easy' && Math.random() < 0.1) {
    const validMoves = engine.getAllValidMoves(engine.turn);
    const allMoves: [number, number, number, number][] = [];
    for (const [fromStr, destinations] of validMoves.entries()) {
      const [fromR, fromC] = fromStr.split(',').map(Number);
      for (const [toR, toC] of destinations) {
        allMoves.push([fromR, fromC, toR, toC]);
      }
    }
    if (allMoves.length > 0) {
      const randomIndex = Math.floor(Math.random() * allMoves.length);
      return allMoves[randomIndex];
    }
  }

  const [, bestMove] = minimax(engine, depth, -Infinity, Infinity, true, aiColor);
  return bestMove;
}
