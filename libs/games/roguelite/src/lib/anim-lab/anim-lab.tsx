'use client';
import { createSnapshotStore, createWhitePixelTexture, GameCanvas, useSnapshotStore, type SnapshotStore } from '@g-game-farm/ribs';
import { useMemo, useState } from 'react';
import { loadAnimAsset, type AnimAsset } from '../anim/anim-asset.js';
import { ANIM_LAB_LAYER, ANIM_LAB_SCENE, EMPTY_ANIM_LAB_STATE, registerAnimLab, type AnimLabState } from './anim-lab-scene.js';

/** Same asset base as RogueliteGame — anim assets live under public/game/characters/<id>/. */
const CHARACTERS_BASE_URL = '/game/characters/';

export interface AnimLabProps {
  /** Asset id — loads /game/characters/<id>/<id>.anim.json. */
  readonly assetId: string;
}

/** Dev tool: plays every clip of one anim asset (as authored + flipped) and logs its frame tags. See anim-lab-scene.ts. */
export function AnimLab({ assetId }: AnimLabProps) {
  const store = useMemo(() => createSnapshotStore<AnimLabState>(EMPTY_ANIM_LAB_STATE), []);
  const [asset, setAsset] = useState<AnimAsset | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  if (error) {
    return <pre style={{ color: '#f88', background: '#200', padding: 12, margin: 0, whiteSpace: 'pre-wrap', font: '13px monospace' }}>{error}</pre>;
  }

  return (
    <GameCanvas
      layers={[{ id: ANIM_LAB_LAYER, pixelSnap: true }]}
      showDevHud
      setup={async (api, renderer) => {
        try {
          const loaded = await loadAnimAsset(renderer, `${CHARACTERS_BASE_URL}${assetId}/${assetId}.anim.json`);
          registerAnimLab(api, { asset: loaded.asset, clips: loaded.clips, whitePixel: createWhitePixelTexture(renderer), store });
          setAsset(loaded.asset);
          return ANIM_LAB_SCENE;
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          throw e;
        }
      }}
    >
      {asset && <AnimLabPanel asset={asset} store={store} />}
    </GameCanvas>
  );
}

function AnimLabPanel({ asset, store }: { readonly asset: AnimAsset; readonly store: SnapshotStore<AnimLabState> }) {
  const { log, tagCounts } = useSnapshotStore(store);
  const clipSummary = Object.entries(asset.clips).map(([name, clip]) => {
    const totalMs = clip.frames.reduce((sum, f) => sum + f.durationMs, 0);
    return `${name} ${clip.loop ? 'loop' : '1회'} ${clip.frames.length}f ${totalMs}ms`;
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: '45%',
        overflow: 'hidden',
        padding: '6px 10px',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        font: '12px/1.5 monospace',
        pointerEvents: 'none',
      }}
    >
      <div>
        {asset.id} · frame {asset.frameSize.join('x')} · anchor {asset.anchor.join(',')} · {asset.source ?? 'source ?'}
      </div>
      <div style={{ color: '#aaa' }}>윗줄 = 원본(오른쪽), 아랫줄 = 반전 · 빨간 선 = 기준점 · {clipSummary.join(' / ')}</div>
      <div style={{ color: '#8f8' }}>
        {Object.entries(tagCounts)
          .map(([tag, n]) => `${tag} ×${n}`)
          .join('  ') || '태그 대기 중…'}
      </div>
      {log.map((e) => (
        <div key={e.seq} style={{ color: e.flipped ? '#9cf' : '#fff' }}>
          #{e.tick} {e.clip} f{e.frameIndex} {e.tags.join(',')}
          {e.flipped ? ' (반전)' : ''}
        </div>
      ))}
    </div>
  );
}
