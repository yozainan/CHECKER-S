export type Color = 'R' | 'B';
export type Piece = 'R' | 'B' | 'RK' | 'BK' | '';
export type Board = Piece[][];
export type Pos = [number, number];
export interface MoveRecord {
    player: Color;
    notation: string;
}
export interface HuffOffer {
    pos: Pos;
    expiresAt: number;
}
export interface ActivePiece {
    id: string;
    r: number;
    c: number;
    type: Piece;
}
export interface EngineState {
    board: Board;
    turn: Color;
    winner: Color | null;
    active_jumper: Pos | null;
}
export declare const TYPE_FLAG = true;
//# sourceMappingURL=index.d.ts.map