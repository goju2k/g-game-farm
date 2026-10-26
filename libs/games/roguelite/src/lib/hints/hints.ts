import { createSnapshotStore, type SnapshotStore, type System } from '@g-game-farm/ribs';
import { CombatPlayer, CombatStats, SentinelAwakened, SentinelMelee } from '../combat/combat-components.js';
import type { CombatData } from '../combat/combat-data.js';
import { RoomEvents } from '../events/event-components.js';
import type { RogueliteSession } from '../session.js';

/**
 * First-use hints (D-035): a wordless picture — the key (keyboard) or the
 * real button pulsing (touch), plus a tiny looping illustration — shown the
 * first time a skill is needed, and retired for good once it's used.
 * Data (data/hints.json) says what each hint shows, when it comes up, and
 * what retires it; event scripts can show / hide any hint too (`hint`).
 */

/** Game situations a hint can come up on. */
export type HintShowWhen = 'sentinel-waking' | 'sentinel-cue';
/** What retires a hint for good. */
export type HintDoneWhen = 'dash' | 'parry' | 'parry-success' | 'quick-spell' | 'cast-spell';

export interface HintDef {
  /** Keyboard keys drawn (KeyboardEvent.code names). */
  readonly keys: readonly string[];
  /** The touch button that pulses (ui/touch-controls.tsx button id). */
  readonly touch: string;
  /** Which illustration (ui/hint-panel.tsx). */
  readonly art: string;
  readonly showWhen?: HintShowWhen;
  /** Only in this room (the first one where it's needed). */
  readonly room?: string;
  readonly doneWhen: HintDoneWhen;
  /** Once up, it stays until done (dash). Otherwise it shows while its situation lasts, plus holdMs (parry: each cue). */
  readonly sticky?: boolean;
  readonly holdMs?: number;
}

export interface HintView {
  readonly id: string;
  readonly def: HintDef;
}

export interface HintController {
  readonly view: SnapshotStore<HintView | undefined>;
  /** Event command: show hint `id` until it's done (or hidden). */
  show(id: string): void;
  hide(id: string): void;
  /** For the hint system: the command requests since last asked. */
  takeRequests(): { readonly show: readonly string[]; readonly hide: readonly string[] };
}

export function createHintController(): HintController {
  const view = createSnapshotStore<HintView | undefined>(undefined);
  let show: string[] = [];
  let hide: string[] = [];
  return {
    view,
    show: (id) => void show.push(id),
    hide: (id) => void hide.push(id),
    takeRequests() {
      const taken = { show, hide };
      show = [];
      hide = [];
      return taken;
    },
  };
}

const SHOW_WHEN: readonly string[] = ['sentinel-waking', 'sentinel-cue'];
const DONE_WHEN: readonly string[] = ['dash', 'parry', 'parry-success', 'quick-spell', 'cast-spell'];

/** Validates data/hints.json: { "hints": { id: HintDef } }. Bad entries are skipped. */
export function parseHints(json: unknown): Record<string, HintDef> {
  const raw = (json as { hints?: unknown })?.hints;
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, HintDef> = {};
  for (const [id, value] of Object.entries(raw)) {
    const h = value as Partial<HintDef>;
    if (!Array.isArray(h.keys) || typeof h.touch !== 'string' || typeof h.art !== 'string' || typeof h.doneWhen !== 'string' || !DONE_WHEN.includes(h.doneWhen)) continue;
    out[id] = {
      keys: h.keys.filter((k): k is string => typeof k === 'string'),
      touch: h.touch,
      art: h.art,
      doneWhen: h.doneWhen,
      ...(typeof h.showWhen === 'string' && SHOW_WHEN.includes(h.showWhen) ? { showWhen: h.showWhen } : {}),
      ...(typeof h.room === 'string' ? { room: h.room } : {}),
      ...(h.sticky === true ? { sticky: true } : {}),
      ...(typeof h.holdMs === 'number' ? { holdMs: h.holdMs } : {}),
    };
  }
  return out;
}

export async function loadHints(url: string): Promise<Record<string, HintDef>> {
  try {
    const response = await fetch(url);
    return response.ok ? parseHints(await response.json()) : {};
  } catch {
    return {};
  }
}

/** The progress flag a learned hint leaves (never shown again, saved with checkpoints). */
export const hintDoneFlag = (id: string) => `hint-done:${id}`;
/** Set the first time a hint shows: only a skill used after that retires it (a dash practised before Zone 4 doesn't). */
export const hintShownFlag = (id: string) => `hint-shown:${id}`;

/**
 * Decides the hint on screen each step: retires hints whose skill was just
 * used, raises them on their situation (in their room), keeps a sticky one
 * up until done, a passing one for holdMs after its situation ends.
 * Simulation, late (after combat and AI settled this step).
 */
export function createHintSystem(session: RogueliteSession, defs: () => Readonly<Record<string, HintDef>>, controller: HintController, data: CombatData): System {
  let current: string | undefined;
  let holdLeftMs = 0;
  let last: { dashing: boolean; parrying: boolean; parries: number; casts: number; quickWindup: number } | undefined;
  let lastRoom: string | undefined;
  const set = (id: string | undefined) => {
    if (id === current) return;
    current = id;
    if (id !== undefined) session.flags.add(hintShownFlag(id));
    const def = id !== undefined ? defs()[id] : undefined;
    controller.view.set(id !== undefined && def ? { id, def } : undefined);
  };
  return {
    name: 'roguelite:hints',
    order: 40,
    run: (ctx) => {
      const all = defs();
      const room = [...ctx.world.query([RoomEvents] as const)][0]?.[1].roomId;
      if (room !== lastRoom) {
        lastRoom = room;
        last = undefined;
        set(undefined);
      }
      // What the player did this step.
      const player = [...ctx.world.query([CombatPlayer] as const)][0]?.[1];
      const stats = [...ctx.world.query([CombatStats] as const)][0]?.[1];
      const now = {
        dashing: player?.action.kind === 'dash',
        parrying: player?.action.kind === 'parry',
        parries: stats?.parrySuccesses ?? 0,
        casts: stats?.castsStarted ?? 0,
        quickWindup: player?.quickWindupF ?? 0,
      };
      const did: Record<HintDoneWhen, boolean> = {
        dash: !!last && now.dashing && !last.dashing,
        parry: !!last && now.parrying && !last.parrying,
        'parry-success': !!last && now.parries > last.parries,
        'cast-spell': !!last && now.casts > last.casts,
        'quick-spell': !!last && now.quickWindup > 0 && last.quickWindup === 0,
      };
      last = now;
      for (const [id, def] of Object.entries(all)) {
        if (did[def.doneWhen] && session.flags.has(hintShownFlag(id)) && !session.flags.has(hintDoneFlag(id))) {
          session.flags.add(hintDoneFlag(id));
          if (current === id) set(undefined);
        }
      }

      const requests = controller.takeRequests();
      if (current !== undefined && requests.hide.includes(current)) set(undefined);
      for (const id of requests.show) if (all[id] && !session.flags.has(hintDoneFlag(id))) set(id);

      // Situations.
      const waking = [...ctx.world.query([SentinelAwakened] as const)].some(([, s]) => s.state === 'waking');
      const cue = [...ctx.world.query([SentinelMelee] as const)].some(([, s]) => s.state === 'windup' && s.framesLeft <= (s.cueF ?? data.enemies['sentinel-melee'].cueF));
      const situation: Record<HintShowWhen, boolean> = { 'sentinel-waking': waking, 'sentinel-cue': cue };
      for (const [id, def] of Object.entries(all)) {
        if (!def.showWhen || session.flags.has(hintDoneFlag(id)) || (def.room && def.room !== room)) continue;
        if (situation[def.showWhen]) {
          set(id);
          holdLeftMs = def.holdMs ?? 0;
        } else if (current === id && !def.sticky) {
          holdLeftMs -= ctx.deltaMs;
          if (holdLeftMs <= 0) set(undefined);
        }
      }
    },
  };
}
