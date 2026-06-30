import copy
import random
from typing import Tuple, Optional
from app.engine import CheckersEngine

def evaluate_board(engine: CheckersEngine, ai_color: str) -> float:
    """
    Evaluates the board state. Positive score favors ai_color, negative favors opponent.
    """
    if engine.winner:
        if engine.winner == ai_color:
            return 10000.0
        else:
            return -10000.0

    opp_color = "B" if ai_color == "R" else "R"
    score = 0.0

    # Weights
    PIECE_WEIGHT = 10.0
    KING_WEIGHT = 20.0  # King advantage multiplier (x2)
    CENTER_BONUS = 1.0

    for r in range(8):
        for c in range(8):
            piece = engine.board[r][c]
            if piece == "":
                continue

            # Determine who owns the piece
            is_ai = (engine.get_piece_owner(piece) == ai_color)
            multiplier = 1 if is_ai else -1

            # Base piece score
            if engine.is_king(piece):
                score += KING_WEIGHT * multiplier
            else:
                score += PIECE_WEIGHT * multiplier

            # Center control bonus
            if 2 <= r <= 5 and 2 <= c <= 5:
                score += CENTER_BONUS * multiplier

    # Mobility score (legal moves count)
    # This is a bit expensive to calculate for both every node, but we'll approximate 
    # by just counting the number of currently available valid moves for the active player.
    if engine.turn == ai_color:
        moves = engine.get_all_valid_moves(ai_color)
        score += len(moves) * 0.1
    else:
        moves = engine.get_all_valid_moves(opp_color)
        score -= len(moves) * 0.1

    return score


def minimax(engine: CheckersEngine, depth: int, alpha: float, beta: float, maximizing_player: bool, ai_color: str) -> Tuple[float, Optional[Tuple[int, int, int, int]]]:
    """
    Minimax algorithm with Alpha-Beta pruning.
    Returns (eval_score, best_move_tuple(from_r, from_c, to_r, to_c))
    """
    if depth == 0 or engine.winner:
        return evaluate_board(engine, ai_color), None

    valid_moves = engine.get_all_valid_moves(engine.turn)
    
    if not valid_moves:
        # No moves available, meaning current player loses
        return evaluate_board(engine, ai_color), None

    # Flatten moves into a list of (from_r, from_c, to_r, to_c)
    all_moves = []
    for from_pos, to_positions in valid_moves.items():
        for to_pos in to_positions:
            all_moves.append((from_pos[0], from_pos[1], to_pos[0], to_pos[1]))

    best_move = None

    if maximizing_player:
        max_eval = float('-inf')
        for move in all_moves:
            engine_copy = copy.deepcopy(engine)
            engine_copy.make_move(move[0], move[1], move[2], move[3])
            
            # If the move resulted in a multi-jump, it's still the maximizing player's turn
            next_maximizing = (engine_copy.turn == engine.turn)

            eval_score, _ = minimax(engine_copy, depth - 1, alpha, beta, next_maximizing, ai_color)
            
            if eval_score > max_eval:
                max_eval = eval_score
                best_move = move
                
            alpha = max(alpha, eval_score)
            if beta <= alpha:
                break
        return max_eval, best_move
    else:
        min_eval = float('inf')
        for move in all_moves:
            engine_copy = copy.deepcopy(engine)
            engine_copy.make_move(move[0], move[1], move[2], move[3])
            
            next_maximizing = not (engine_copy.turn == engine.turn)

            eval_score, _ = minimax(engine_copy, depth - 1, alpha, beta, next_maximizing, ai_color)
            
            if eval_score < min_eval:
                min_eval = eval_score
                best_move = move
                
            beta = min(beta, eval_score)
            if beta <= alpha:
                break
        return min_eval, best_move


def get_best_move(engine: CheckersEngine, difficulty: str, ai_color: str) -> Optional[Tuple[int, int, int, int]]:
    """
    Gets the best move for the AI using Minimax.
    difficulty: "easy" (depth 2), "medium" (depth 4), "hard" (depth 6)
    """
    if difficulty == "easy":
        depth = 2
    elif difficulty == "medium":
        depth = 4
    else:
        depth = 6
        
    # In easy mode, sometimes apply a random factor
    if difficulty == "easy" and random.random() < 0.10:
        valid_moves = engine.get_all_valid_moves(engine.turn)
        all_moves = []
        for from_pos, to_positions in valid_moves.items():
            for to_pos in to_positions:
                all_moves.append((from_pos[0], from_pos[1], to_pos[0], to_pos[1]))
        if all_moves:
            return random.choice(all_moves)

    _, best_move = minimax(engine, depth, float('-inf'), float('inf'), True, ai_color)
    return best_move
