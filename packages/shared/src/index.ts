import { z } from 'zod';
import type { Board } from '@checkers/types';

// Zod validation schemas for client WebSocket payloads
export const MoveMessageSchema = z.object({
  type: z.literal('move'),
  from_pos: z.tuple([z.number(), z.number()]),
  to_pos: z.tuple([z.number(), z.number()]),
});

export const HuffMessageSchema = z.object({
  type: z.literal('huff'),
  pos: z.tuple([z.number(), z.number()]),
});

export const SettingsMessageSchema = z.object({
  type: z.literal('settings'),
  time_limit: z.number().nullable(),
  huff_enabled: z.boolean().optional(),
});

export const CursorMessageSchema = z.object({
  type: z.literal('cursor'),
  r: z.number().nullable(),
  c: z.number().nullable(),
});

export const GenericMessageSchema = z.discriminatedUnion('type', [
  MoveMessageSchema,
  HuffMessageSchema,
  SettingsMessageSchema,
  CursorMessageSchema,
  z.object({ type: z.literal('reset') }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('stop_chain') }),
]);

// Constants
export const DEFAULT_TIME_LIMIT = 300;

// Helpers
export function toNotation(fr: number, fc: number, tr: number, tc: number): string {
  const cols = 'abcdefgh';
  return `${cols[fc]}${8 - fr}→${cols[tc]}${8 - tr}`;
}

export function countPieces(board: Board): { red: number; blk: number } {
  let red = 0;
  let blk = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === 'R' || p === 'RK') {
        red++;
      } else if (p === 'B' || p === 'BK') {
        blk++;
      }
    }
  }
  return { red, blk };
}
