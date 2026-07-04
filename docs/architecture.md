# System Architecture — Checkers Monorepo

This document details the software architecture, package isolation, data models, and system flows of the Checkers (Dama Arena) monorepo.

---

## 🏗️ Monorepo Workspaces Layout

This project is built as a unified TypeScript monorepo using **npm workspaces**. Modules are split into logical packages under the `packages/` directory and standalone deployment apps under the `apps/` directory:

```
├── apps/
│   ├── web/               # React + Vite (Static Frontend)
│   └── api/               # Fastify + WebSockets (Persistent Backend)
├── packages/
│   ├── types/             # Shared TypeScript type definitions
│   ├── shared/            # Common helpers and validation schemas
│   ├── engine/            # Core checkers rules engine
│   └── ai/                # Minimax search tree AI solver
```

---

## 📦 Package Catalog & Descriptions

### 1. Types Package (`@checkers/types`)
Contains compile-time type declarations shared across the frontend and backend. It exports no executable Javascript, ensuring type definitions remain isolated and zero-overhead:
* **Key Contracts**:
  - `Color`: `'R' | 'B'` (Red or Black).
  - `Piece`: `'R' | 'B' | 'RK' | 'BK'` (Regular men and Kings).
  - `Board`: `Piece[][]` (An 8x8 matrix representing cells).
  - `Pos`: `[number, number]` (Tuple representing row and column).
  - `EngineState`: Serializable state interface describing the game board, active turn, winner, and chain jumper coordinates.

### 2. Shared Package (`@checkers/shared`)
Houses runtime validators and notation mappings:
* **Zod Schemas**:
  - `GenericMessageSchema`: Validates WebSocket event payloads (`move`, `huff`, `cursor`, `reset`, `settings`, `stop_chain`, etc.).
* **Notation Helpers**:
  - `toNotation(fromRow, fromCol, toRow, toCol)`: Translates board coordinate shifts into checkers notation (e.g. `d6-e5`).
  - `countPieces(board)`: Resolves remaining counts for Red and Black pieces on the board.

### 3. Rules Engine (`@checkers/engine`)
Houses the central rulebook logic within the `CheckersEngine` class. It manages state transitions, board updates, promotions, and chain locks:
* **Flying Kings**: Resolves diagonal sliding movements, jumping obstacles at a distance, and multiline flight paths.
* **Huffing Checks**: Identifies if the active player missed a mandatory capture before executing a slide, caching coordinates for potential huff blows.
* **Turn Locking**: Resolves multi-jump dependencies, locking play to a specific piece until the capture chain is broken or stopped.

### 4. AI Package (`@checkers/ai`)
An optimized minimax search tree engine that computes the best moves for singleplayer/AI modes:
* **Minimax Search**: Features minimax tree traversal with **Alpha-Beta pruning** to reduce searched nodes.
* **Evaluation Metrics**: Dynamic board scoring based on piece material weights, king positioning, active lines, and center grid control.
* **Difficulty Scaling**: Adjusts minimax search depth (Easy = 1 layer, Medium = 3 layers, Hard = 5 layers).

---

## 🔄 Client-Server Communication Flow

Below is the state transitions diagram showing how clients interact with the Fastify WebSocket server during a game lobby session:

```
[ Lobby State ] 
      │
      ▼
┌──────────────┐      Success      ┌──────────────┐
│ Matchmaking  ├──────────────────►│ Active Arena │
└──────┬───────┘                   └──────┬───────┘
       │ Wait > 15s                       │
       ▼                                  ▼
┌──────────────┐                   ┌──────────────┐
│ Play vs AI   │                   │ Game States: │
└──────────────┘                   │ - Move       │
                                   │ - Huff Offer │
                                   │ - Timer Tick │
                                   │ - Undo Step  │
                                   └──────────────┘
```
