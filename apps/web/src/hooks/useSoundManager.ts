/**
 * Sound Manager — preloads and plays game sound effects.
 *
 * Sound mapping:
 *   move-self.mp3       → current player moves
 *   move-check.mp3      → opponent moves
 *   capture.mp3         → any capture
 *   castle.mp3          → piece promoted to queen
 *   huff_notify.mp3     → huff offer appears
 *   La Balena Seguena.mp3 → match ends (victory/defeat)
 */
import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/useGameStore';

type SoundName = 'moveSelf' | 'moveCheck' | 'capture' | 'castle' | 'huffNotify' | 'matchEnd';

const SOUND_URLS: Record<SoundName, string> = {
  moveSelf:   '/sounds/move-self.mp3',
  moveCheck:  '/sounds/move-check.mp3',
  capture:    '/sounds/capture.mp3',
  castle:     '/sounds/castle.mp3',
  huffNotify: '/sounds/huff_notify.mp3',
  matchEnd:   '/sounds/La Balena Seguena.mp3',
};

function createAudio(url: string): HTMLAudioElement {
  const a = new Audio(url);
  a.preload = 'auto';
  return a;
}

/**
 * Call once in the Game component to wire up sound effects.
 * Watches store state reactively and plays sounds on changes.
 */
export function useSoundManager() {
  const audioRef = useRef<Record<SoundName, HTMLAudioElement> | null>(null);

  // Preload all sounds once
  if (!audioRef.current) {
    audioRef.current = {
      moveSelf:   createAudio(SOUND_URLS.moveSelf),
      moveCheck:  createAudio(SOUND_URLS.moveCheck),
      capture:    createAudio(SOUND_URLS.capture),
      castle:     createAudio(SOUND_URLS.castle),
      huffNotify: createAudio(SOUND_URLS.huffNotify),
      matchEnd:   createAudio(SOUND_URLS.matchEnd),
    };
  }

  const play = useCallback((name: SoundName) => {
    const audio = audioRef.current?.[name];
    if (!audio) return;
    // Reset to start if already playing
    audio.currentTime = 0;
    audio.play().catch(() => { /* browser autoplay policy */ });
  }, []);

  // Track previous values for diffing
  const prevRef = useRef<{
    winner: string | null;
    huffOffer: unknown;
    boardHash: string;
  }>({
    winner: null,
    huffOffer: null,
    boardHash: '',
  });

  useEffect(() => {
    // Subscribe to the store directly for reactive sound triggers
    const unsub = useGameStore.subscribe((state, prevState) => {
      const prev = prevRef.current;
      const { playerColor } = state;

      // ── Match end sound ──
      if (state.winner && !prevState.winner) {
        play('matchEnd');
        prevRef.current = { ...prev, winner: state.winner };
        return; // match end is the priority sound
      }

      // ── Huff notification sound ──
      if (state.huffOffer && !prevState.huffOffer) {
        play('huffNotify');
      }

      // ── Board change sounds ──
      const newHash = JSON.stringify(state.board);
      const oldHash = JSON.stringify(prevState.board);
      if (newHash !== oldHash && prevState.board[0]?.length === 8) {
        // Detect if pieces were captured (piece count decreased)
        let oldPieces = 0, newPieces = 0;
        let oldKings = 0, newKings = 0;
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            if (prevState.board[r][c] !== '') oldPieces++;
            if (state.board[r][c] !== '') newPieces++;
            if (prevState.board[r][c] === 'RK' || prevState.board[r][c] === 'BK') oldKings++;
            if (state.board[r][c] === 'RK' || state.board[r][c] === 'BK') newKings++;
          }
        }

        const wasCapture = newPieces < oldPieces;
        const wasPromotion = newKings > oldKings;

        if (wasCapture) {
          play('capture');
        } else if (wasPromotion) {
          play('castle');
        } else if (state.turn !== prevState.turn) {
          // No capture, no promotion — just a slide move
          // If the turn just switched AWAY from our color, WE moved
          if (prevState.turn === playerColor) {
            play('moveSelf');
          } else {
            play('moveCheck');
          }
        }
      }

      prevRef.current = {
        winner: state.winner,
        huffOffer: state.huffOffer,
        boardHash: newHash,
      };
    });

    return unsub;
  }, [play]);

  return { play };
}
