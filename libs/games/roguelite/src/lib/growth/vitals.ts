import type { RenderSystem, SnapshotStore } from '@g-game-farm/ribs';
import { CombatPlayer } from '../combat/combat-components.js';
import { PlayerStats } from './growth-components.js';

/**
 * What the health bar shows (doc 45 §5: a bar and the number): health,
 * the shield over it, and embers. `visible` only for a form that has health
 * (the ember of Act 1 has none, D-003).
 */
export interface PlayerVitals {
  readonly visible: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly shield: number;
  readonly maxShield: number;
  readonly embers: number;
  readonly maxEmbers: number;
}

export const EMPTY_VITALS: PlayerVitals = { visible: false, hp: 0, maxHp: 0, shield: 0, maxShield: 0, embers: 0, maxEmbers: 0 };

/** Publishes the player's vitals when they change (render phase; the store only notifies on a real change). */
export function createVitalsSystem(store: SnapshotStore<PlayerVitals>, maxEmbers: number): RenderSystem {
  return {
    name: 'roguelite:vitals',
    run: (ctx) => {
      let next = EMPTY_VITALS;
      for (const [id, player] of ctx.world.query([CombatPlayer] as const)) {
        if (player.hp === undefined) continue;
        const grown = ctx.world.get(id, PlayerStats);
        next = {
          visible: true,
          hp: Math.ceil(player.hp),
          maxHp: grown?.maxHp ?? player.hp,
          shield: Math.ceil(player.shield ?? 0),
          maxShield: grown?.maxShield ?? 0,
          embers: player.embers,
          maxEmbers,
        };
      }
      const prev = store.getSnapshot();
      if (
        prev.visible !== next.visible ||
        prev.hp !== next.hp ||
        prev.maxHp !== next.maxHp ||
        prev.shield !== next.shield ||
        prev.maxShield !== next.maxShield ||
        prev.embers !== next.embers ||
        prev.maxEmbers !== next.maxEmbers
      ) {
        store.set(next);
      }
    },
  };
}
