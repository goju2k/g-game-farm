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
  /** Child form only (undefined for the ember). */
  readonly hp?: number;
  readonly maxHp?: number;
  readonly embers: number;
  readonly maxEmbers: number;
  readonly castsStarted: number;
  readonly castsWithEmber: number;
  readonly castsAfterParry: number;
  readonly castsCancelled: number;
}

export const EMPTY_COMBAT_DEBUG: CombatDebugView = {
  active: false,
  action: '',
  parryAttempts: 0,
  parrySuccesses: 0,
  hitsTaken: 0,
  dashes: 0,
  sentinels: '',
  embers: 0,
  maxEmbers: 0,
  castsStarted: 0,
  castsWithEmber: 0,
  castsAfterParry: 0,
  castsCancelled: 0,
};

/** Health and the ember cap, for the HUD — passed in because the debug system doesn't otherwise know the combat data. */
export interface CombatDebugLimits {
  readonly maxHp: number;
  readonly maxEmbers: number;
}

/**
 * Publishes the combat playtest numbers (spec §11: parry success rate etc.)
 * for the React debug HUD. Only sets the store when something changed, so
 * React re-renders on events, not every frame.
 */
export function createCombatDebugSystem(store: SnapshotStore<CombatDebugView>, limits: CombatDebugLimits = { maxHp: 5, maxEmbers: 3 }): RenderSystem {
  let lastKey = '';
  return {
    name: 'roguelite:combat/debug-hud',
    run: (ctx) => {
      let view: CombatDebugView = EMPTY_COMBAT_DEBUG;
      for (const [, player] of ctx.world.query([CombatPlayer] as const)) {
        const a = player.action;
        const action = a.kind === 'dash' || a.kind === 'parry' ? `${a.kind}:${a.phase}` : a.kind === 'casting' ? `casting ${a.framesLeft}f` : a.kind;
        view = {
          ...view,
          active: true,
          action,
          embers: player.embers,
          maxEmbers: player.hp !== undefined ? limits.maxEmbers : 0,
          ...(player.hp !== undefined ? { hp: player.hp, maxHp: limits.maxHp } : {}),
        };
      }
      for (const [, stats] of ctx.world.query([CombatStats] as const)) {
        view = { ...view, ...stats };
      }
      const sentinels: string[] = [];
      for (const [, sentinel] of ctx.world.query([SentinelMelee] as const)) {
        const detail = sentinel.parriesToStop !== undefined ? ` ${sentinel.parriesTaken}/${sentinel.parriesToStop}` : sentinel.hp !== undefined ? ` hp${sentinel.hp}` : '';
        sentinels.push(sentinel.state + detail);
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
