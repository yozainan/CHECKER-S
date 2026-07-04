import React from 'react';
import { useGameStore } from '../store/useGameStore';

export const Board: React.FC = () => {
  const {
    board, turn, playerColor, pieces,
    selectedCell, validTargets, winner,
    activeJumper, opponentCursor, huffOffer, huffWarning,
    selectCell, sendCursor,
  } = useGameStore();

  const isSelected     = (r: number, c: number) =>
    selectedCell !== null && selectedCell[0] === r && selectedCell[1] === c;

  const isValidTarget  = (r: number, c: number) =>
    validTargets.some(([tr, tc]) => tr === r && tc === c);

  const isActiveJumper = (r: number, c: number) =>
    activeJumper !== null && activeJumper[0] === r && activeJumper[1] === c;
  const isOpponentHover = (r: number, c: number) =>
    opponentCursor !== null && opponentCursor[0] === r && opponentCursor[1] === c;

  const isHuffOffer = (r: number, c: number) =>
    huffOffer !== null && huffOffer.pos[0] === r && huffOffer.pos[1] === c;
  const isHuffWarning = (r: number, c: number) =>
    huffWarning !== null && huffWarning.pos[0] === r && huffWarning.pos[1] === c;

  const getPieceClass = (piece: string) => {
    let cls = 'piece';
    if (piece.startsWith('R')) cls += ' red';
    else if (piece.startsWith('B')) cls += ' black';
    if (piece === 'RK' || piece === 'BK') cls += ' king';
    return cls;
  };

  const handleCellClick = (r: number, c: number) => {
    if (winner) return;
    selectCell(r, c);
  };

  const handleCellEnter = (r: number, c: number) => {
    sendCursor(r, c);
  };

  const rows = playerColor === 'B' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = playerColor === 'B' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const getTop = (r: number) => playerColor === 'B' ? (7 - r) * 12.5 : r * 12.5;
  const getLeft = (c: number) => playerColor === 'B' ? (7 - c) * 12.5 : c * 12.5;

  return (
    <div className="board-frame">
      <div className="board-grid">
        {rows.map(r =>
          cols.map(c => {
            const piece = board[r][c];
            const isDark      = (r + c) % 2 === 1;
            const selected    = isSelected(r, c);
            const validTarget = isValidTarget(r, c);
            const jumping     = isActiveJumper(r, c);
            const isMyPiece   = piece !== '' &&
              ((playerColor === 'R' && (piece === 'R' || piece === 'RK')) ||
               (playerColor === 'B' && (piece === 'B' || piece === 'BK')));
            const isOpponentPiece = piece !== '' && !isMyPiece;
            const oppHover    = isOpponentHover(r, c) && isOpponentPiece;
            const huffTarget  = isHuffOffer(r, c) || isHuffWarning(r, c);

            let cellClass = `cell ${isDark ? 'dark' : 'light'}`;
            if (selected) cellClass += ' selected-cell';
            else if (validTarget) cellClass += ' valid-move';
            else if (isDark && isMyPiece && turn === playerColor && !winner)
              cellClass += ' can-select';

            return (
              <div
                key={`${r}-${c}`}
                className={cellClass}
                onClick={() => handleCellClick(r, c)}
                onMouseEnter={() => handleCellEnter(r, c)}
              >
                {/* ── Opponent cursor ── */}
                {oppHover && (
                  <div className={piece !== '' ? "opponent-cursor-piece-ring" : "opponent-cursor-ring"} />
                )}

                {/* ── Huff target warning ── */}
                {huffTarget && (
                  <div className="huff-target-ring" />
                )}

                {/* ── Valid-move dot (on empty dark cells) ── */}
                {validTarget && !piece && (
                  <div className="valid-dot" />
                )}
              </div>
            );
          })
        )}

        {/* ── Dynamic Pieces Layer for Smooth Animations ── */}
        <div className="pieces-layer">
          {pieces.map(p => {
            const selected = isSelected(p.r, p.c);
            const jumping = isActiveJumper(p.r, p.c);
            const shaking = isHuffWarning(p.r, p.c) || isHuffOffer(p.r, p.c);
            return (
              <div
                key={p.id}
                className="piece-container"
                style={{ top: `${getTop(p.r)}%`, left: `${getLeft(p.c)}%` }}
              >
                {/* ── Active jumper pulse travels with piece ── */}
                {jumping && !selected && (
                  <div className="active-jumper-ring" />
                )}
                <div className={`${getPieceClass(p.type)}${selected || jumping ? ' active' : ''}${shaking ? ' huff-danger-shake' : ''}`} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
