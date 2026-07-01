import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { motion, AnimatePresence } from 'framer-motion';

export const Board: React.FC = () => {
  const {
    board, turn, playerColor,
    selectedCell, validTargets, winner,
    activeJumper, capturedCells, opponentCursor, huffOffer,
    selectCell, sendCursor,
  } = useGameStore();

  const isSelected     = (r: number, c: number) =>
    selectedCell !== null && selectedCell[0] === r && selectedCell[1] === c;

  const isValidTarget  = (r: number, c: number) =>
    validTargets.some(([tr, tc]) => tr === r && tc === c);

  const isActiveJumper = (r: number, c: number) =>
    activeJumper !== null && activeJumper[0] === r && activeJumper[1] === c;

  const isCaptured = (r: number, c: number) =>
    capturedCells.some(([cr, cc]) => cr === r && cc === c);

  const isOpponentHover = (r: number, c: number) =>
    opponentCursor !== null && opponentCursor[0] === r && opponentCursor[1] === c;

  const isHuffTarget = (r: number, c: number) =>
    huffOffer !== null && huffOffer.pos[0] === r && huffOffer.pos[1] === c;

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

  return (
    <div className="board-frame">
      <div className="board-grid">
        {board.map((row, r) =>
          row.map((piece, c) => {
            const isDark      = (r + c) % 2 === 1;
            const selected    = isSelected(r, c);
            const validTarget = isValidTarget(r, c);
            const jumping     = isActiveJumper(r, c);
            const captured    = isCaptured(r, c);
            const oppHover    = isOpponentHover(r, c);
            const huffTarget  = isHuffTarget(r, c);
            const isMyPiece   = piece !== '' &&
              ((playerColor === 'R' && (piece === 'R' || piece === 'RK')) ||
               (playerColor === 'B' && (piece === 'B' || piece === 'BK')));

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
                {/* ── Opponent cursor ring (only on opponent's OWN pieces) ── */}
                {oppHover && piece !== '' && !isMyPiece && (
                  <div className="opponent-cursor-piece-ring" />
                )}

                {/* ── Huff target warning ── */}
                {huffTarget && (
                  <div className="huff-target-ring" />
                )}

                {/* ── Capture flash ── */}
                {captured && (
                  <div className="capture-flash" />
                )}

                {/* ── Active jumper pulse ── */}
                {jumping && !selected && (
                  <div className="active-jumper-ring" />
                )}

                {/* ── Piece ── */}
                <AnimatePresence>
                  {piece && (
                    <motion.div
                      key={`${r}-${c}-${piece}`}
                      className={`${getPieceClass(piece)}${selected || jumping ? ' active' : ''}`}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                    />
                  )}
                </AnimatePresence>

                {/* ── Valid-move dot (on empty dark cells) ── */}
                {validTarget && !piece && (
                  <div className="valid-dot" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
