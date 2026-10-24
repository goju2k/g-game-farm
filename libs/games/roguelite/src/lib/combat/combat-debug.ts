import type { RenderSystem, SnapshotStore } from '@g-game-farm/ribs';
import { CombatPlayer, CombatStats, SentinelMelee } from './combat-components.js';

/** What the playtest HUD shows — plain values, so an unchanged frame is an identical snapshot. */
export interface CombatDebugView {
  readonly active: boolean;
  readonly action: string;
  readonly parryAttempts: number;
  readonly parrySuccesses: number;
  readonly hitsTaken: number;
  readonly dashes: number;
  readonly sentinels: string;
}

export const EMPTY_COMBAT_DEBUG: CombatDebugView = { active: false, action: '', parryAttempts: 0, parrySuccesses: 0, hitsTaken: 0, dashes: 0, sentinels: '' };

/**
 * Publishes the combat playtest numbers (spec §11: parry success rate etc.)
 * for the React debug HUD. Only sets the store when something changed, so
 * React re-renders on events, not every frame.
 */
export function createCombatDebugSystem(store: SnapshotStore<CombatDebugView>): RenderSystem {
  let lastKey = '';
  return {
    name: 'roguelite:combat/debug-hud',
    run: (ctx) => {
      let view: CombatDebugView = EMPTY_COMBAT_DEBUG;
      for (const [, player] of ctx.world.query([CombatPlayer] as const)) {
        const a = player.action;
        const action = a.kind === 'free' ? 'free' : a.kind === 'respawning' ? 'respawning' : `${a.kind}:${a.phase}`;
        view = { ...view, active: true, action };
      }
      for (const [, stats] of ctx.world.query([CombatStats] as const)) {
        view = { ...view, ...stats };
      }
      const sentinels: string[] = [];
      for (const [, sentinel] of ctx.world.query([SentinelMelee] as const)) {
        sentinels.push(sentinel.parriesToStop !== undefined ? `${sentinel.state} ${sentinel.parriesTaken}/${sentinel.parriesToStop}` : sentinel.state);
      }
      view = { ...view, sentinels: sentinels.join(' · ') };
      const key = JSON.stringify(view);
      if (key !== lastKey) {
        lastKey = key;
        store.set(view);
      }
    },
  };
}
