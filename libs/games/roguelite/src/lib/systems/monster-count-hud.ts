import type { RenderSystem, SnapshotStore } from '@g-game-farm/ribs';
import { Chaser } from '../components.js';

/**
 * Publishes the live count of Chaser-tagged (monster) entities every render
 * phase. applyHitDamageSystem (postSimulation) destroys a killed monster's
 * whole entity before this ever runs in the same tick, so a monster that
 * died this frame is already excluded — no extra sync needed. The store's
 * own Object.is gate means this only actually triggers a React re-render
 * when the count changes, not on every tick.
 */
export function createMonsterCountSystem(store: SnapshotStore<number>): RenderSystem {
  return {
    name: 'roguelite:monster-count-hud',
    run: (ctx) => {
      const count = [...ctx.world.query([Chaser] as const)].length;
      store.set(count);
    },
  };
}
