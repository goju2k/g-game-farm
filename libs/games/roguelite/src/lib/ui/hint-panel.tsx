'use client';
import { useSnapshotStore } from '@g-game-farm/ribs';
import type { CSSProperties, ReactNode } from 'react';
import type { HintController } from '../hints/hints.js';

export interface HintPanelProps {
  readonly controller: HintController;
  readonly gameBox: { readonly left: number; readonly top: number | string; readonly width: number; readonly height: number };
  /** The touch controls are in use: the key isn't drawn (the real button pulses instead). */
  readonly touch: boolean;
}

const INK = '#cbdbfc';

/** How each key is drawn on its cap. */
const KEY_LABELS: Readonly<Record<string, string>> = {
  Space: '␣',
  ShiftLeft: '⇧',
  ShiftRight: '⇧',
  KeyE: 'E',
  MouseLeft: '◐',
  MouseRight: '◑',
};

/**
 * A first-use hint (D-035): no words — a key cap (keyboard) and a tiny
 * looping picture of the move, at the bottom middle of the game. Graybox
 * pictures until the asset room's (dash: the ember passing through a
 * sentinel; parry: the white outline, then the guard).
 */
export function HintPanel({ controller, gameBox, touch }: HintPanelProps) {
  const hint = useSnapshotStore(controller.view);
  if (!hint) return null;
  const box: CSSProperties = {
    position: 'absolute',
    left: gameBox.left + gameBox.width / 2,
    top: typeof gameBox.top === 'number' ? gameBox.top + gameBox.height - 14 : `calc(${gameBox.top} + ${gameBox.height - 14}px)`,
    transform: 'translate(-50%, -100%)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    background: 'rgba(5,4,10,0.72)',
    border: '1px solid rgba(203,219,252,0.35)',
    borderRadius: 6,
    pointerEvents: 'none',
    animation: 'hint-in 0.25s ease-out both',
  };
  return (
    <div style={box} aria-hidden>
      <style>{KEYFRAMES}</style>
      {!touch && hint.def.keys.map((key) => <KeyCap key={key}>{KEY_LABELS[key] ?? key.replace(/^Key/, '')}</KeyCap>)}
      <Picture art={hint.def.art} />
    </div>
  );
}

function KeyCap({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        minWidth: 26,
        height: 24,
        padding: '0 6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid #9fb6e8',
        borderBottomWidth: 4,
        borderRadius: 5,
        color: INK,
        font: "14px 'Galmuri11', monospace",
        animation: 'hint-press 1.2s ease-in-out infinite',
      }}
    >
      {children}
    </span>
  );
}

/** A 48x24 looping illustration of the move. */
function Picture({ art }: { art: string }) {
  const stage: CSSProperties = { position: 'relative', width: 48, height: 24, overflow: 'hidden' };
  const sentinel: CSSProperties = { position: 'absolute', left: 22, top: 4, width: 10, height: 16, background: '#6b7385' };
  if (art === 'dash') {
    return (
      <div style={stage}>
        <div style={sentinel} />
        <div style={{ position: 'absolute', top: 10, width: 5, height: 5, borderRadius: 3, background: '#bfeaff', boxShadow: '0 0 6px #6fb8f2', animation: 'hint-dash 1.4s steps(6) infinite' }} />
      </div>
    );
  }
  if (art === 'parry') {
    return (
      <div style={stage}>
        <div style={{ ...sentinel, left: 30, outline: '2px solid #fff', animation: 'hint-cue 1.4s steps(1) infinite' }} />
        <div style={{ position: 'absolute', left: 8, top: 10, width: 5, height: 5, borderRadius: 3, background: '#bfeaff' }} />
        <div style={{ position: 'absolute', left: 15, top: 5, width: 3, height: 14, background: '#fbf236', animation: 'hint-guard 1.4s steps(1) infinite' }} />
      </div>
    );
  }
  // Anything else: the fire pillar rising.
  return (
    <div style={stage}>
      <div style={{ position: 'absolute', left: 19, bottom: 2, width: 10, background: '#df7126', animation: 'hint-pillar 1.4s steps(5) infinite' }} />
    </div>
  );
}

const KEYFRAMES = `
@keyframes hint-in { from { opacity: 0; transform: translate(-50%, -80%) } to { opacity: 1; transform: translate(-50%, -100%) } }
@keyframes hint-press { 0%, 60%, 100% { transform: translateY(0) } 70%, 90% { transform: translateY(2px) } }
@keyframes hint-dash { 0% { left: 2px } 100% { left: 42px } }
@keyframes hint-cue { 0%, 40% { outline-color: transparent } 50%, 100% { outline-color: #fff } }
@keyframes hint-guard { 0%, 55% { opacity: 0 } 60%, 90% { opacity: 1 } 100% { opacity: 0 } }
@keyframes hint-pillar { 0% { height: 0 } 80% { height: 20px } 100% { height: 0 } }
`;
