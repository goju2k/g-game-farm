import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, createSnapshotStore, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset } from '../anim/anim-asset.js';
import { Animator, Position, SpriteRender } from '../components.js';
import { spriteDrawOrigin } from '../systems/render-sprites.js';
import { ANIM_LAB_RESTART_PAUSE_MS, ANIM_LAB_SCENE, animLabLayout, EMPTY_ANIM_LAB_STATE, registerAnimLab, type AnimLabState } from './anim-lab-scene.js';

const asset = parseAnimAsset(
  JSON.parse(readFileSync(resolve(__dirname, '../../../public/game/characters/player-child/player-child.anim.json'), 'utf8')),
  'player-child',
);

/** 1ms fixed steps, so tag times land exactly on the authored millisecond. */
function bootLab() {
  const engine = createEngine({ fixedDeltaMs: 1, maxSubStepsPerFrame: 1000 });
  const store = createSnapshotStore<AnimLabState>(EMPTY_ANIM_LAB_STATE);
  registerAnimLab(engine, { asset, clips: clipsFromAnimAsset(asset, 1 as TextureHandle), whitePixel: 2 as TextureHandle, store });
  engine.loadScene(ANIM_LAB_SCENE);
  return { engine, store };
}

/** Tag log entries for the as-authored (unflipped) row, oldest first. */
function unflipped(store: { getSnapshot(): AnimLabState }) {
  return store
    .getSnapshot()
    .log.filter((e) => !e.flipped)
    .reverse();
}

describe('anim lab', () => {
  it('fires frame-0 tags on the first tick (startPending)', () => {
    const { engine, store } = bootLab();
    engine.tick(1);
    const tags = unflipped(store).map((e) => e.tags.join());
    expect(tags).toEqual(['dash:charge', 'parry:flash', 'dash:travel']); // dash-quick (the combo's switch dash) travels from frame 0
    expect(store.getSnapshot().tagCounts).toEqual({ 'dash:charge': 2, 'parry:flash': 2, 'dash:travel': 2 });
  });

  it('fires dash tags at the authored times: travel after 83ms, recover after 250ms', () => {
    const { engine, store } = bootLab();
    const dash = () => unflipped(store).filter((e) => e.clip === 'player-child:dash');
    // Elapsed playback time = total ms ticked so far (the first 1ms tick also steps).
    engine.tick(1);
    engine.tick(82 - 1);
    expect(dash().some((e) => e.tags.includes('dash:travel'))).toBe(false);
    engine.tick(1);
    const travel = dash().find((e) => e.tags.includes('dash:travel'));
    expect(travel).toMatchObject({ clip: 'player-child:dash', frameIndex: 2 });

    engine.tick(249 - 83);
    expect(dash().some((e) => e.tags.includes('dash:recover'))).toBe(false);
    engine.tick(1);
    expect(dash().find((e) => e.tags.includes('dash:recover'))).toMatchObject({ frameIndex: 5 });
  });

  it('replays a one-shot clip after it finishes, firing its frame-0 tag again', () => {
    const { engine, store } = bootLab();
    const dashTotal = asset.clips['dash'].frames.reduce((sum, f) => sum + f.durationMs, 0);
    for (let ms = 0; ms < dashTotal + ANIM_LAB_RESTART_PAUSE_MS + 5; ms += 100) {
      engine.tick(100);
    }
    expect(store.getSnapshot().tagCounts['dash:charge']).toBe(4); // 2 rows x 2 starts
  });

  it('keeps both rows on the same anchor point when flipped', () => {
    const { engine } = bootLab();
    engine.tick(1);
    const layout = animLabLayout(asset);
    const actors = [...engine.world.query([Animator, Position, SpriteRender] as const)].filter(([, a]) => a.current === 'float');
    expect(actors).toHaveLength(2);
    for (const [, , position, sprite] of actors) {
      const row = sprite.flipX ? 1 : 0;
      expect(position).toEqual(layout.anchorAt(0, row));
      const drawn = spriteDrawOrigin(position, sprite);
      // The anchor pixel column, mirrored when flipped, must sit exactly at Position.
      const anchorColumn = sprite.flipX ? asset.frameSize[0] - asset.anchor[0] : asset.anchor[0];
      expect(drawn.x + anchorColumn).toBe(position.x);
      expect(drawn.y + asset.anchor[1]).toBe(position.y);
    }
  });
});
