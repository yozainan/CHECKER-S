import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from './store/useGameStore';
import { Board } from './components/Board';
import { motion, AnimatePresence } from 'framer-motion';
import { useSoundManager } from './hooks/useSoundManager';

/* ── Format seconds as MM:SS ── */
function fmt(s: number) {
  const m   = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

/* ──────────── LOBBY ──────────── */
const Lobby: React.FC = () => {
  const { joinRoom, findMatch, isMatchmaking, cancelMatchmaking } = useGameStore();

  // Read ?room=&color= from the invite link and pre-fill (or auto-join)
  const params     = new URLSearchParams(window.location.search);
  const paramRoom  = params.get('room')  ?? '';
  const paramColor = (params.get('color') ?? '') as 'R' | 'B' | '';

  const [room,  setRoom]  = useState(paramRoom  || 'arena-1');
  const [color, setColor] = useState<'R' | 'B'>(paramColor === 'B' ? 'B' : 'R');

  // Auto-join when valid invite params are present
  useEffect(() => {
    if (paramRoom && (paramColor === 'R' || paramColor === 'B')) {
      window.history.replaceState({}, '', window.location.pathname);
      joinRoom(paramRoom, paramColor);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app">
      <motion.div
        className="lobby"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="lobby-box"
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="lobby-logo">♟ DAMA</div>
          <div className="lobby-tagline">Modern Web Checkers</div>

          {isMatchmaking ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#ffd700', marginBottom: 16 }}>
                Searching for opponent...
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginBottom: 24 }}>
                (If no player found within 15s, you'll be matched against AI)
              </div>
              <button className="btn-exit" onClick={cancelMatchmaking}>Cancel</button>
            </div>
          ) : (
            <>
              <button
                className="btn-enter"
                style={{ marginBottom: 24, padding: '16px', fontSize: '1rem', background: 'linear-gradient(135deg, #10b981, #059669)' }}
                onClick={findMatch}
              >
                🌍 Find Online Match
              </button>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0 -32px 24px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#111', padding: '0 10px', fontSize: '0.7rem', color: '#666', letterSpacing: '0.1em' }}>
                  OR PLAY WITH FRIEND
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="field-label">Room ID</div>
                <input
                  className="field-input"
                  value={room}
                  onChange={e => setRoom(e.target.value)}
                  placeholder="arena-1"
                  spellCheck={false}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <div className="field-label">Choose Side</div>
                <div className="color-row">
                  <button type="button" className={`color-pick ${color === 'R' ? 'pick-red' : ''}`} onClick={() => setColor('R')}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: 'radial-gradient(circle at 35% 35%, #ff7070 0%, #b50000 100%)', boxShadow: '0 3px 0 #5a0000', display: 'inline-block' }} />
                    Red (P1)
                  </button>
                  <button type="button" className={`color-pick ${color === 'B' ? 'pick-blk' : ''}`} onClick={() => setColor('B')}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: 'radial-gradient(circle at 35% 35%, #888 0%, #111 100%)', boxShadow: '0 3px 0 #000', border: '1px solid #555', display: 'inline-block' }} />
                    Black (P2)
                  </button>
                </div>
              </div>

              <button
                className="btn-enter"
                onClick={() => room.trim() && joinRoom(room.trim(), color)}
              >
                ⚔ Enter Private Arena
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};

/* ──────────── HUFF NOTIFICATION ──────────── */
const HuffNotification: React.FC = () => {
  const { huffOffer, acceptHuff, dismissHuff } = useGameStore();
  const [secsLeft, setSecsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!huffOffer) { setSecsLeft(0); return; }
    const update = () => {
      const left = Math.max(0, Math.ceil((huffOffer.expiresAt - Date.now()) / 1000));
      setSecsLeft(left);
      if (left === 0) dismissHuff();
    };
    update();
    intervalRef.current = setInterval(update, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [huffOffer, dismissHuff]);

  if (!huffOffer) return null;

  return (
    <motion.div
      className="huff-notification"
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
    >
      <div className="huff-header">
        <span className="huff-icon">⚡</span>
        <span className="huff-title">Opponent missed a capture!</span>
        <span className="huff-timer">{secsLeft}s</span>
      </div>
      <div className="huff-desc">
        You may <strong>huff</strong> (remove) their piece as a penalty, or ignore it.
      </div>
      <div className="huff-actions">
        <button className="huff-btn-accept" onClick={acceptHuff}>
          💨 Huff the piece!
        </button>
        <button className="huff-btn-dismiss" onClick={dismissHuff}>
          Ignore
        </button>
      </div>
    </motion.div>
  );
};

/* ──────────── HUFF WARNING NOTIFICATION ──────────── */
const HuffWarningNotification: React.FC = () => {
  const { huffWarning } = useGameStore();
  const [secsLeft, setSecsLeft] = useState(0);

  useEffect(() => {
    if (!huffWarning) { setSecsLeft(0); return; }
    const update = () => {
      const left = Math.max(0, Math.ceil((huffWarning.expiresAt - Date.now()) / 1000));
      setSecsLeft(left);
    };
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [huffWarning]);

  if (!huffWarning) return null;

  return (
    <motion.div
      className="huff-notification"
      style={{ border: '1px solid #ff4444' }}
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
    >
      <div className="huff-header" style={{ color: '#ff4444' }}>
        <span className="huff-icon">⚠</span>
        <span className="huff-title">Your piece is in danger!</span>
        <span className="huff-timer">{secsLeft}s</span>
      </div>
      <div className="huff-desc">
        You missed a mandatory capture! Your opponent has the right to <strong>huff</strong> (remove) your piece.
      </div>
    </motion.div>
  );
};

/* ──────────── SETTINGS PANEL ──────────── */
interface SettingsPanelProps {
  onClose: () => void;
}
const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { huffEnabled, setHuffEnabled, timeLimit, changeTimeLimit } = useGameStore();

  return (
    <motion.div
      className="settings-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="settings-panel"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="settings-header">
          <span className="settings-title">⚙ Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section-label">RULES</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-name">Huff Rule</div>
            <div className="settings-row-desc">
              When enabled, if you skip a mandatory capture, your opponent may remove ("huff") that piece as a penalty.
            </div>
          </div>
          <button
            className={`settings-toggle ${huffEnabled ? 'toggle-on' : 'toggle-off'}`}
            onClick={() => setHuffEnabled(!huffEnabled)}
            aria-label={huffEnabled ? 'Disable Huff rule' : 'Enable Huff rule'}
          >
            <span className="toggle-thumb" />
          </button>
        </div>

        <div className="settings-row" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch', borderBottom: 'none' }}>
          <div className="settings-row-info">
            <div className="settings-row-name">Match Time Limit</div>
            <div className="settings-row-desc">
              Select the maximum time allowed for each player (chess clock).
            </div>
          </div>
          <select
            className="settings-select"
            value={timeLimit === null ? 'none' : String(timeLimit)}
            onChange={e => {
              const val = e.target.value;
              changeTimeLimit(val === 'none' ? null : Number(val));
            }}
          >
            <option value="none">None (Infinite/Classic)</option>
            <option value="60">1 Minute</option>
            <option value="180">3 Minutes</option>
            <option value="300">5 Minutes</option>
            <option value="600">10 Minutes</option>
            <option value="900">15 Minutes</option>
          </select>
        </div>

        <div className="settings-footer">
          Changes apply immediately to the current game.
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ──────────── GAME ──────────── */
const Game: React.FC = () => {
  const {
    turn, winner, playerColor, roomId,
    redPieces, blkPieces,
    capturedByRed, capturedByBlack,
    elapsed, paused, resetGame, disconnect,
    tickTimer, togglePause, error, huffOffer, huffWarning,
    timeLeftRed, timeLeftBlack, timeLimit,
    isPrivate, undoMove,
  } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Sound effects
  useSoundManager();

  // Timer tick
  useEffect(() => {
    const id = setInterval(tickTimer, 1000);
    return () => clearInterval(id);
  }, [tickTimer]);

  const myTurn = turn === playerColor;

  // Build invite URL for friend
  const oppColor  = playerColor === 'R' ? 'B' : 'R';
  const friendUrl = `${window.location.origin}?room=${encodeURIComponent(roomId)}&color=${oppColor}`;
  const inviteText = `Join my Checkers game!\n\nClick to join directly:\n${friendUrl}\n\n(Room: ${roomId} — play as ${oppColor === 'B' ? 'Black ⚫' : 'Red 🔴'})`;

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="app">
      {/* ── Left sidebar ── */}
      <nav className="sidebar">
        <button className="sidebar-btn" onClick={disconnect} title="Home">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
        </button>
        <button className="sidebar-btn" onClick={resetGame} title="Restart">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
          </svg>
        </button>
        {isPrivate && (
          <button className="sidebar-btn" onClick={undoMove} title="Undo Move" disabled={!!winner}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
        )}
        {/* Settings button */}
        <button className="sidebar-btn" onClick={() => setShowSettings(true)} title="Settings">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </nav>

      {/* ── Top-right quit ── */}
      <button
        className="sidebar-btn"
        style={{ position: 'fixed', top: 16, right: 16, zIndex: 20 }}
        onClick={disconnect}
        title="Quit"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>

      {/* ── Score panel ── */}
      <div className="score-panel">
        {/* Black captured count */}
        <div className="score-card">
          <div className="score-piece-dot blk-dot" />
          <div className="score-label">⚫</div>
          <div className="score-num">{capturedByBlack}</div>
          {capturedByBlack > 0 && (
            <div className="score-cap-dots">
              {Array.from({ length: Math.min(capturedByBlack, 12) }).map((_, i) => (
                <span key={i} className="score-mini-dot red-dot" />
              ))}
            </div>
          )}
          <div className="score-remaining">{redPieces} left</div>
          {timeLimit !== null && (
            <div className={`score-clock ${turn === 'B' ? 'clock-active' : ''}`}>
              ⏱️ {fmt(timeLeftBlack)}
            </div>
          )}
        </div>
        {/* Red captured count */}
        <div className="score-card">
          <div className="score-piece-dot red-dot" />
          <div className="score-label">🔴</div>
          <div className="score-num">{capturedByRed}</div>
          {capturedByRed > 0 && (
            <div className="score-cap-dots">
              {Array.from({ length: Math.min(capturedByRed, 12) }).map((_, i) => (
                <span key={i} className="score-mini-dot blk-dot" />
              ))}
            </div>
          )}
          <div className="score-remaining">{blkPieces} left</div>
          {timeLimit !== null && (
            <div className={`score-clock ${turn === 'R' ? 'clock-active' : ''}`}>
              ⏱️ {fmt(timeLeftRed)}
            </div>
          )}
        </div>
      </div>

      {/* ── Board ── */}
      <Board />

      {/* ── Huff notification ── */}
      <AnimatePresence>
        {huffOffer && <HuffNotification key="huff" />}
        {huffWarning && <HuffWarningNotification key="huff-warn" />}
      </AnimatePresence>

      {/* ── Settings panel ── */}
      <AnimatePresence>
        {showSettings && <SettingsPanel key="settings" onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      {/* ── Bottom bar ── */}
      <div className="bottom-bar">
        <div className="timer" style={{ pointerEvents: 'all' }}>
          <button className="timer-icon" onClick={togglePause} title={paused ? 'Resume' : 'Pause'}>
            {paused ? '▶' : '⏸'}
          </button>
          <span className="timer-display">{fmt(elapsed)}</span>
        </div>

        {/* Turn indicator */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,0,0,0.45)',
          border: `1px solid ${myTurn ? 'rgba(255,215,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 8, padding: '6px 14px',
          fontSize: '0.78rem', fontWeight: 700,
          color: myTurn ? '#ffd700' : 'rgba(255,255,255,0.5)',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'none',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: turn === 'R'
              ? 'radial-gradient(circle at 35% 35%, #ff7070, #b50000)'
              : 'radial-gradient(circle at 35% 35%, #888, #111)',
            boxShadow: turn === 'R' ? '0 0 8px rgba(255,50,50,0.7)' : 'none'
          }} />
          {myTurn ? 'Your Move' : (turn === 'R' ? 'Red' : 'Black') + "'s Turn"}
        </div>

        {/* Invite button */}
        <button
          onClick={copyInvite}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: copied ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.45)',
            border: `1px solid ${copied ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.15)'}`,
            borderRadius: 8, padding: '5px 12px',
            fontSize: '0.75rem', fontWeight: 600,
            color: copied ? '#10b981' : 'rgba(255,255,255,0.7)',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            backdropFilter: 'blur(8px)', transition: 'all 0.2s',
            pointerEvents: 'all',
          }}
        >
          {copied ? '✅ Copied!' : `🔗 Invite · Room: ${roomId}`}
        </button>
      </div>

      {/* ── Error toast ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            ⚠ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Victory overlay ── */}
      <AnimatePresence>
        {winner && (
          <motion.div
            className="v-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="v-box"
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            >
              <div className="v-crown">{winner === playerColor ? '👑' : '💀'}</div>
              <div className="v-title">{winner === playerColor ? 'Victory!' : 'Defeat'}</div>
              <div className="v-sub">
                <strong style={{ color: winner === 'R' ? '#ff8888' : '#aaa' }}>
                  {winner === 'R' ? 'Red' : 'Black'}
                </strong>{' '}player wins the match
              </div>
              <button className="btn-rematch" onClick={resetGame}>⚔ Play Again</button>
              <button className="btn-exit" onClick={disconnect}>Exit to Lobby</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ──────────── ROOT ──────────── */
const App: React.FC = () => {
  const { connected } = useGameStore();
  return (
    <AnimatePresence mode="wait">
      {connected ? (
        <motion.div key="game" style={{ width: '100%', height: '100%' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}>
          <Game />
        </motion.div>
      ) : (
        <motion.div key="lobby" style={{ width: '100%', height: '100%' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}>
          <Lobby />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default App;
