'use client';
import { useSnapshotStore, type SnapshotStore } from '@g-game-farm/ribs';

export interface MonsterCountHudProps {
  readonly store: SnapshotStore<number>;
}

/**
 * The first real "game state -> React UI" case validating the
 * SnapshotStore mechanism end to end: this reads infrequently-changing
 * state (a monster count, updated only when a kill happens) via
 * useSnapshotStore, not per-frame useState — matching this project's
 * no-per-frame-useState rule for anything that isn't a static overlay.
 */
export function MonsterCountHud({ store }: MonsterCountHudProps) {
  const count = useSnapshotStore(store);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '6px 10px',
        background: 'rgba(0,0,0,0.55)',
        color: '#fff',
        font: '13px monospace',
        pointerEvents: 'none',
      }}
    >
      remaining monsters: {count}
    </div>
  );
}
