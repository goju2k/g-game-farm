'use client';
import { useSnapshotStore, type SnapshotStore } from '@g-game-farm/ribs';
import type { CombatDebugView } from '../combat/combat-debug.js';

/** Playtest overlay (combat spec §11): parry success rate and friends. Only shown in rooms with the combat player. */
export function CombatDebugHud({ store }: { readonly store: SnapshotStore<CombatDebugView> }) {
  const view = useSnapshotStore(store);
  if (!view.active) {
    return null;
  }
  const rate = view.parryAttempts > 0 ? Math.round((100 * view.parrySuccesses) / view.parryAttempts) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        padding: '4px 8px',
        background: 'rgba(0,0,0,0.6)',
        color: '#cbdbfc',
        font: '12px/1.5 monospace',
        pointerEvents: 'none',
        textAlign: 'right',
      }}
    >
      <div>
        패링 {view.parrySuccesses}/{view.parryAttempts} ({rate}%)
      </div>
      <div>
        피격 {view.hitsTaken} · 대시 {view.dashes}
      </div>
      <div style={{ color: '#8899aa' }}>{view.action}</div>
      <div style={{ color: '#8899aa' }}>{view.sentinels}</div>
      <div style={{ color: '#667' }}>WASD 이동 · Space 대시 · Shift 패링</div>
    </div>
  );
}
