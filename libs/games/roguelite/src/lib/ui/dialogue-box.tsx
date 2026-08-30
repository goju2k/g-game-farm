'use client';
import { useSnapshotStore, type SnapshotStore } from '@g-game-farm/ribs';
import type { DialogueState } from '../scenario/dialogue-state.js';

export interface DialogueBoxProps {
  readonly store: SnapshotStore<DialogueState>;
}

/**
 * Structurally the same overlay as monster-count-hud.tsx — a static-content
 * React DOM box reading game state via useSnapshotStore, not a per-frame
 * useState. Only rendered when the store says a line is showing.
 */
export function DialogueBox({ store }: DialogueBoxProps) {
  const { visible, text } = useSnapshotStore(store);
  if (!visible) {
    return null;
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: '10%',
        right: '10%',
        bottom: 40,
        padding: '10px 14px',
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        font: '14px monospace',
        pointerEvents: 'none',
      }}
    >
      <div>{text}</div>
      <div style={{ opacity: 0.6, marginTop: 6 }}>[E] continue</div>
    </div>
  );
}
