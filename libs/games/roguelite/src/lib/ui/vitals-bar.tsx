'use client';
import { useSnapshotStore, type SnapshotStore } from '@g-game-farm/ribs';
import type { PlayerVitals } from '../growth/vitals.js';

const FONT = "'Galmuri11', monospace";
const BAR_WIDTH = 132;

/**
 * The health bar (doc 45 §5: a bar and the number), top-left clear of the
 * notch: health in red, the shield laid over it in pale blue, embers as
 * dots underneath. Changes rarely, so it's DOM, fed by the vitals store.
 */
export function VitalsBar({ store }: { store: SnapshotStore<PlayerVitals> }) {
  const v = useSnapshotStore(store);
  if (!v.visible || v.maxHp <= 0) return null;
  const share = (n: number, of: number) => `${Math.max(0, Math.min(1, of > 0 ? n / of : 0)) * 100}%`;
  return (
    <div
      aria-label="체력"
      style={{
        position: 'absolute',
        left: 'calc(env(safe-area-inset-left, 0px) + 10px)',
        top: 'calc(env(safe-area-inset-top, 0px) + 10px)',
        pointerEvents: 'none',
        userSelect: 'none',
        font: `12px/1 ${FONT}`,
        color: '#ffe9e2',
        textShadow: '0 1px 0 #0b0910',
      }}
    >
      <div style={{ position: 'relative', width: BAR_WIDTH, height: 10, background: '#241e2c', border: '1px solid #0e0b12', boxShadow: '0 0 0 1px rgba(203,219,252,0.18)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: share(v.hp, v.maxHp), background: 'linear-gradient(#e85d5f, #ac3232)' }} />
        {v.maxShield > 0 && v.shield > 0 && (
          <div style={{ position: 'absolute', left: 0, top: 0, height: 3, width: share(v.shield, v.maxShield), background: '#cbdbfc' }} />
        )}
      </div>
      <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>
          {v.hp} / {v.maxHp}
          {v.maxShield > 0 ? <span style={{ color: '#cbdbfc' }}> +{v.shield}</span> : null}
        </span>
        {v.maxEmbers > 0 && (
          <span aria-label="잔불" style={{ display: 'flex', gap: 3 }}>
            {Array.from({ length: v.maxEmbers }, (_, i) => (
              <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: i < v.embers ? '#bfeaff' : 'transparent', border: '1px solid #6fb8f2', boxShadow: i < v.embers ? '0 0 4px #6fb8f2' : 'none' }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
