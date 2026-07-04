# Portfolio & Assets Integration Guide

This guide describes how to capture screenshots, record demo GIFs, and organize visual media inside the repository to maximize recruiter engagement.

---

## 📸 Recommended Screenshots to Include

### 1. Main Lobby Overview
* **Focus**: Showcases the landing UI design, choice of sides, matchmaking trigger, and the clean wood-felt aesthetic.
* **Suggested Filename**: `lobby_overview.png`
* **Capture Setup**: Open `http://localhost:5173/`, make sure no active game is connected.

### 2. Active Gameplay & Moves
* **Focus**: Showcases the 3D checkers pieces, gloss shaders, glowing move targets, and selected piece highlights.
* **Suggested Filename**: `active_gameplay.png`
* **Capture Setup**: Join an AI game, select a piece, hover over a valid target square, and capture the scene showing the highlights.

### 3. Huff Penalty Alert
* **Focus**: Showcases real-time notification panels, warning borders, and the huff active countdown clock.
* **Suggested Filename**: `huff_notification.png`
* **Capture Setup**: Make a move that skips a capture. The server will dispatch the huff offer, popping up the bright orange alert bar at the top of the viewport.

---

## 📹 Suggested Demo GIFs (Screen Recordings)

Adding 5-10 second loop recordings as GIFs to the README makes the project feel alive instantly:

| Feature | Action to Record | Duration | Filename |
|:---|:---|:---|:---|
| **AI Match & Play** | Click "Find Online Match", wait 15s for the AI match transition, and slide a piece. | ~8s | `ai_match_demo.gif` |
| **Huff Capture Blow** | Move a piece ignoring a jump, click "💨 Huff the piece!" as the opponent, and watch the piece vanish with a burst animation. | ~6s | `huff_action_demo.gif` |
| **Mobile Layout Scroll** | Resize the browser window to mobile view to show the responsive stack transition (scores top, board center, controls bottom). | ~5s | `mobile_responsive.gif` |

---

## 🎨 Visual Guidelines & Styling System

Ensure any customized UI assets or branding mockups follow the core design tokens of Dama Arena:

| Element | Hex Code | Visual Style |
|:---|:---|:---|
| **Felt Green (Background)** | `#1a3d10` | Radial gradient CASINO green felt. |
| **Gold Highlight (Active)** | `#ffd700` | Glowing, intense gold for selected states, timers, and crowns. |
| **Red Pieces** | `#ff7070` to `#b50000` | Glossy 3D radial sphere gradient, with drop-shadows. |
| **Black Pieces** | `#888888` to `#111111` | Obsidian-like glossy sphere gradient, with drop-shadows. |
| **Typography** | `Inter`, sans-serif | Bold, clean, geometric sans-serif font. |
