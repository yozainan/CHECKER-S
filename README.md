# ♟️ DAMA ARENA — Full-Stack Checkers Monorepo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Testing-Vitest-brightgreen.svg)](https://vitest.dev/)
[![Fastify](https://img.shields.io/badge/Backend-Fastify-black.svg)](https://www.fastify.io/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-blue.svg)](https://react.dev/)

A modern, highly responsive, real-time multiplayer Checkers (Dama) game built as a robust **TypeScript Monorepo**. Features real-time matchmaking, lobby room websocket relays, a minimax search tree AI, and strict implementation of classic draft checkers rules (including Flying Kings and the legendary Huff penalty blow).

![Checkers Gameplay Preview](assets/gameplay.png)

---

## 🏗️ Monorepo Architecture

The repository leverages **npm Workspaces** to coordinate dependencies and split concerns into clean, modular workspaces:

```mermaid
graph TD
    subgraph Apps [Applications]
        Web[apps/web - React + Vite]
        API[apps/api - Fastify Server]
    end

    subgraph Packages [Shared Libraries]
        Types[packages/types - TS Interfaces]
        Shared[packages/shared - Schemas & Helpers]
        Engine[packages/engine - Rules & Move Solver]
        AI[packages/ai - Minimax Search Tree]
    end

    Web --> Types
    Web --> Shared
    Web --> Engine
    Web --> AI
    
    API --> Types
    API --> Shared
    API --> Engine
    API --> AI

    Engine --> Types
    Engine --> Shared
    AI --> Types
    AI --> Engine
    Shared --> Types
```

### Directory Map

| Path | Type | Responsibility |
|:---|:---|:---|
| **`apps/web`** | React App | Frontend user interface with canvas/CSS animations, sound manager, and game state stores. |
| **`apps/api`** | Fastify App | Backend HTTP/WebSocket game server handling matchmaking, room ticking, and socket forwarding. |
| **`packages/types`** | Package | Core shared TypeScript interfaces and models. |
| **`packages/shared`** | Package | Zod validation schemas and utility functions (e.g. notation converters, board counts). |
| **`packages/engine`** | Package | Pure rules engine (`CheckersEngine` class) maintaining state copy and resolving moves/chains. |
| **`packages/ai`** | Package | High-performance minimax search tree solver with alpha-beta pruning. |

---

## ⚡ Game Mechanics & Features

- **Real-Time Multiplayer**: Instant matchmaking or private invite links to play against friends over persistent WebSockets.
- **Minimax AI**: Play offline or singleplayer against a minimax search solver with customizable search depths (Easy, Medium, Hard).
- **Flying Kings**: Kings can slide any number of empty squares in diagonals, leap over single enemy pieces from a distance, and land on any square behind them.
- **Huff Penalty Blow**: Strict draft rules! If a player misses a mandatory capture, the opponent has 15 seconds to "huff" (blow/remove) the offending piece from the board.
- **Multi-Jump Lock**: When a piece makes a jump and has further jumps available, the turn locks to that piece until the jump chain is completed or stopped.
- **Chess Clock**: Fully integrated optional move timers with real-time WebSocket ticks.
- **Mobile Responsive Layout**: Premium CSS grid gameboard and floating scorecards tailored for all screen sizes, from mobile phones to high-resolution desktops.

---

## 🔄 WebSocket Message Protocol

The real-time gameplay relies on type-safe WebSocket event frames validated via Zod schemas:

```mermaid
sequenceDiagram
    autonumber
    actor Red as Player Red (Vercel)
    participant Server as Fastify API (Render)
    actor Black as Player Black / AI (Vercel)

    Red->>Server: /ws/matchmake (Enter Queue)
    Black->>Server: /ws/matchmake (Enter Queue)
    Note over Server: Matchmaker pairs players
    Server-->>Red: { type: "match_found", room_id: "XYZ", color: "R" }
    Server-->>Black: { type: "match_found", room_id: "XYZ", color: "B" }
    
    Note over Red,Black: Connect to /ws/XYZ/Color
    Red->>Server: Connect socket
    Black->>Server: Connect socket
    Server-->>Red: { type: "sync", state: EngineState }
    Server-->>Black: { type: "sync", state: EngineState }

    Red->>Server: { type: "move", from_pos: [5,2], to_pos: [4,3] }
    Note over Server: Engine validates move & updates state
    Server-->>Red: { type: "sync", state: EngineState }
    Server-->>Black: { type: "sync", state: EngineState }

    Red->>Server: { type: "cursor", r: 4, c: 3 } (Realtime pointer relay)
    Server-->>Black: { type: "opponent_cursor", r: 4, c: 3 }
```

---

## 🛠️ Local Development Setup

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Installation

Clone the repository and install all workspace dependencies:
```bash
git clone https://github.com/yozainan/CHECKER-S.git
cd CHECKER-S
npm install
```

### Running Locally

To run both the backend server and frontend client concurrently:

```bash
# Start the Fastify API (runs on http://localhost:8000)
npm run dev:api

# Start the Vite React client (runs on http://localhost:5173, proxying API to port 8000)
npm run dev:web
```

### Running Unit Tests

Unit tests are written using **Vitest** for the rules engine and the AI minimax configurations. To execute the tests:
```bash
npm run test
```

### Production Build

Build all packages and applications in dependency order:
```bash
npm run build
```

---

## 🚀 Deployment Guide

### Backend: Render (Free Tier)
1. Set up a new **Web Service** pointing to your repository.
2. Select branch **`main`**.
3. **Build Command**: `npm install && npm run build`
4. **Start Command**: `node apps/api/dist/index.js`
5. **Health Check Path**: `/`

### Frontend: Vercel
1. Set up a new project pointing to your repository.
2. **Framework Preset**: select **Vite**.
3. **Root Directory**: **`apps/web`**.
4. **Environment Variables**:
   - `VITE_BACKEND_URL`: `https://your-api.onrender.com` *(paste your Render backend URL)*
5. Click **Deploy**.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
