"""
Checkers (Dama) game engine — International / Flying-King rules.

Board layout (8×8):
  Row 0 = Black's back row (top).   Row 7 = Red's back row (bottom).

Piece values:
  'R'  Red man     'B'  Black man
  'RK' Red King    'BK' Black King
  ''   Empty cell

Flying-King rule (Queen):
  A king may slide/capture along the full diagonal in any direction,
  not just one step.  On a capture it may land any number of squares
  *beyond* the captured piece.
"""
from typing import Dict, List, Tuple, Optional


class CheckersEngine:
    """8×8 checkers engine with flying-king (international draughts) rules."""

    # ------------------------------------------------------------------ #
    #  Initialisation                                                      #
    # ------------------------------------------------------------------ #

    def __init__(self) -> None:
        self.board: List[List[str]] = []
        self.turn: str = "R"                         # "R" or "B"
        self.winner: Optional[str] = None
        self.active_jumper: Optional[Tuple[int, int]] = None
        self._init_board()

    def _init_board(self) -> None:
        """Set up the standard starting position."""
        self.board = [['' for _ in range(8)] for _ in range(8)]
        # Black — rows 0-2 on dark (odd sum) squares
        for row in range(3):
            for col in range(8):
                if (row + col) % 2 == 1:
                    self.board[row][col] = 'B'
        # Red — rows 5-7 on dark squares
        for row in range(5, 8):
            for col in range(8):
                if (row + col) % 2 == 1:
                    self.board[row][col] = 'R'

    # ------------------------------------------------------------------ #
    #  Public helpers (also used by ai.py)                                #
    # ------------------------------------------------------------------ #

    def get_piece_owner(self, piece: str) -> Optional[str]:
        """Return 'R', 'B', or None."""
        if piece in ('R', 'RK'): return 'R'
        if piece in ('B', 'BK'): return 'B'
        return None

    def is_king(self, piece: str) -> bool:
        return piece in ('RK', 'BK')

    def has_captures(self, color: str) -> bool:
        """Return True when *color* has at least one mandatory capture."""
        for r in range(8):
            for c in range(8):
                if self.get_piece_owner(self.board[r][c]) == color:
                    if self._get_jumps(self.board, r, c):
                        return True
        return False

    # ------------------------------------------------------------------ #
    #  Internal helpers                                                    #
    # ------------------------------------------------------------------ #

    def _in_bounds(self, r: int, c: int) -> bool:
        return 0 <= r < 8 and 0 <= c < 8

    def _man_directions(self, piece: str) -> List[Tuple[int, int]]:
        """Forward directions for a non-king piece."""
        if piece == 'R': return [(-1, -1), (-1, 1)]   # Red moves up
        if piece == 'B': return [(1, -1), (1, 1)]      # Black moves down
        return [(-1,-1), (-1,1), (1,-1), (1,1)]

    # ---- jumps -------------------------------------------------------- #

    def _get_jumps(self, board: List[List[str]], r: int, c: int) -> List[Tuple[int, int]]:
        piece = board[r][c]
        owner = self.get_piece_owner(piece)
        if not owner:
            return []
        if self.is_king(piece):
            return self._king_jumps(board, r, c, owner)
        return self._man_jumps(board, r, c, piece, owner)

    def _man_jumps(self, board, r, c, piece, owner) -> List[Tuple[int, int]]:
        jumps: List[Tuple[int, int]] = []
        for dr, dc in self._man_directions(piece):
            over_r, over_c = r + dr, c + dc
            land_r, land_c = r + 2*dr, c + 2*dc
            if not self._in_bounds(land_r, land_c):
                continue
            over = board[over_r][over_c]
            if over and self.get_piece_owner(over) != owner and board[land_r][land_c] == '':
                jumps.append((land_r, land_c))
        return jumps

    def _king_jumps(self, board, r, c, owner) -> List[Tuple[int, int]]:
        """Flying king: jump over first opponent on a diagonal, land anywhere beyond."""
        jumps: List[Tuple[int, int]] = []
        for dr, dc in [(-1,-1), (-1,1), (1,-1), (1,1)]:
            nr, nc = r + dr, c + dc
            found_opponent = False
            while self._in_bounds(nr, nc):
                cell = board[nr][nc]
                if cell == '':
                    if found_opponent:
                        jumps.append((nr, nc))
                elif self.get_piece_owner(cell) == owner:
                    break                           # own piece blocks path
                else:
                    if found_opponent:
                        break                       # two opponents in same ray
                    found_opponent = True
                nr += dr
                nc += dc
        return jumps

    # ---- slides ------------------------------------------------------- #

    def _get_slides(self, board: List[List[str]], r: int, c: int) -> List[Tuple[int, int]]:
        piece = board[r][c]
        if not self.get_piece_owner(piece):
            return []
        if self.is_king(piece):
            return self._king_slides(board, r, c)
        return self._man_slides(board, r, c, piece)

    def _man_slides(self, board, r, c, piece) -> List[Tuple[int, int]]:
        slides: List[Tuple[int, int]] = []
        for dr, dc in self._man_directions(piece):
            nr, nc = r + dr, c + dc
            if self._in_bounds(nr, nc) and board[nr][nc] == '':
                slides.append((nr, nc))
        return slides

    def _king_slides(self, board, r, c) -> List[Tuple[int, int]]:
        """Flying king: slide any number of squares along all diagonals."""
        slides: List[Tuple[int, int]] = []
        for dr, dc in [(-1,-1), (-1,1), (1,-1), (1,1)]:
            nr, nc = r + dr, c + dc
            while self._in_bounds(nr, nc) and board[nr][nc] == '':
                slides.append((nr, nc))
                nr += dr
                nc += dc
        return slides

    # ---- captured piece locator --------------------------------------- #

    def _find_captured_piece(
        self, from_r: int, from_c: int, to_r: int, to_c: int
    ) -> Optional[Tuple[int, int]]:
        """Scan the diagonal from→to and return the first non-empty square (if any).
        Works for both regular men (2 steps) and flying kings (N steps)."""
        dr = 1 if to_r > from_r else -1
        dc = 1 if to_c > from_c else -1
        r, c = from_r + dr, from_c + dc
        while (r, c) != (to_r, to_c):
            if self.board[r][c] != '':
                return (r, c)
            r += dr
            c += dc
        return None

    # ------------------------------------------------------------------ #
    #  Valid-move calculation                                              #
    # ------------------------------------------------------------------ #

    def get_all_valid_moves(self, color: str) -> Dict[Tuple[int, int], List[Tuple[int, int]]]:
        """
        Return all legal moves for *color* as ``{from_pos: [to_pos, ...]}``.

        Captures are NOT mandatory.  A player may slide even when jumps exist.
        The huff rule (applied externally by the server) penalises skipped captures.

        Mid-chain exception: when active_jumper is set, only that piece may move
        and only jump continuations are offered (the chain must be resolved first).
        """
        board = self.board

        # Mid multi-jump: locked piece must continue or the player calls stop_chain
        if self.active_jumper:
            ar, ac = self.active_jumper
            jumps = self._get_jumps(board, ar, ac)
            if jumps:
                return {(ar, ac): jumps}
            return {}

        # All moves — slides AND jumps (no mandatory capture)
        all_moves: Dict[Tuple[int, int], List[Tuple[int, int]]] = {}
        for r in range(8):
            for c in range(8):
                if self.get_piece_owner(board[r][c]) == color:
                    destinations = (
                        list(self._get_jumps(board, r, c)) +
                        list(self._get_slides(board, r, c))
                    )
                    if destinations:
                        all_moves[(r, c)] = destinations
        return all_moves

    # ------------------------------------------------------------------ #
    #  Move execution                                                      #
    # ------------------------------------------------------------------ #

    def make_move(self, from_r: int, from_c: int, to_r: int, to_c: int) -> bool:
        """Apply the move if legal.  Returns True on success."""
        if self.winner:
            return False

        valid_moves = self.get_all_valid_moves(self.turn)
        from_pos = (from_r, from_c)
        to_pos   = (to_r,   to_c)

        if from_pos not in valid_moves or to_pos not in valid_moves[from_pos]:
            return False

        piece = self.board[from_r][from_c]

        # Locate captured piece (works for any jump distance)
        captured_pos = self._find_captured_piece(from_r, from_c, to_r, to_c)
        is_jump = captured_pos is not None

        # Execute move
        self.board[from_r][from_c] = ''
        self.board[to_r][to_c] = piece

        # Remove captured piece
        if is_jump and captured_pos:
            self.board[captured_pos[0]][captured_pos[1]] = ''

        # King promotion
        promoted = False
        if piece == 'R' and to_r == 0:
            self.board[to_r][to_c] = 'RK'
            promoted = True
        elif piece == 'B' and to_r == 7:
            self.board[to_r][to_c] = 'BK'
            promoted = True

        # Multi-jump continuation (only if captured and not just promoted)
        if is_jump and not promoted:
            further = self._get_jumps(self.board, to_r, to_c)
            if further:
                self.active_jumper = (to_r, to_c)
                return True

        # End of turn
        self.active_jumper = None
        self.turn = 'B' if self.turn == 'R' else 'R'
        self._check_winner()
        return True

    def huff_piece(self, r: int, c: int) -> bool:
        """
        Huffing penalty: remove the piece at (r, c).

        Unlike the old implementation, this does NOT switch the turn — the
        turn was already advanced by the slide move that triggered the huff.
        The server is responsible for validating that the huff is legitimate
        (correct player requesting, correct piece position).
        """
        if self.winner:
            return False
        piece = self.board[r][c]
        if not piece:
            return False
        self.board[r][c] = ''
        self.active_jumper = None
        self._check_winner()
        return True

    def stop_chain(self) -> bool:
        """
        Allow the active jumper to voluntarily end a multi-jump chain.
        Clears active_jumper and switches turn to the opponent.
        Returns True only when there IS an active chain in progress.
        """
        if self.winner:
            return False
        if not self.active_jumper:
            return False
        self.active_jumper = None
        self.turn = 'B' if self.turn == 'R' else 'R'
        self._check_winner()
        return True

    # ------------------------------------------------------------------ #
    #  Win condition                                                       #
    # ------------------------------------------------------------------ #

    def _check_winner(self) -> None:
        """The player who cannot move (or has no pieces) loses."""
        if not self.get_all_valid_moves(self.turn):
            self.winner = 'B' if self.turn == 'R' else 'R'

    # ------------------------------------------------------------------ #
    #  State serialisation                                                 #
    # ------------------------------------------------------------------ #

    def get_state(self) -> dict:
        return {
            "board":         self.board,
            "turn":          self.turn,
            "winner":        self.winner,
            "active_jumper": list(self.active_jumper) if self.active_jumper else None,
        }

    # ------------------------------------------------------------------ #
    #  Reset                                                               #
    # ------------------------------------------------------------------ #

    def reset(self) -> None:
        self.winner       = None
        self.turn         = 'R'
        self.active_jumper = None
        self._init_board()
