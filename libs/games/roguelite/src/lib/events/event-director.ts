import { overlaps, type EventCommand, type EventInstance, type EventRegistry, type System, type World } from '@g-game-farm/ribs';
import type { SoundQueue } from '../audio/sound-cues.js';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';
import { CombatPlayer } from '../combat/combat-components.js';
import type { CombatData } from '../combat/combat-data.js';
import { boxAt, boxCenter } from '../combat/combat-geometry.js';
import { readIntent } from '../combat/intent.js';
import { Flags, Position } from '../components.js';
import type { RogueliteSession } from '../session.js';
import type { DialogueController } from './dialogue-controller.js';
import { actorCenter, findActor, type EventContext, type RoomEventSpace } from './event-commands.js';
import { CameraDirector, InputLock, RoomEvents } from './event-components.js';

/**
 * Event scripts (event spec §2) — the data file the planning room writes:
 * per room, a list of events, each a trigger plus a command list.
 */
export type EventTrigger =
  | { readonly type: 'roomStart' }
  | { readonly type: 'enterArea'; readonly area: string }
  | { readonly type: 'interact'; readonly target: string }
  | { readonly type: 'flag'; readonly flag: string }
  | { readonly type: 'failCount'; readonly key: string; readonly n: number }
  | { readonly type: 'idle'; readonly ms: number };

export interface EventDefinition {
  readonly id: string;
  readonly trigger: EventTrigger;
  /** Default false: an event runs once and is remembered (checkpoint restarts don't replay it). */
  readonly repeat?: boolean;
  readonly do: readonly EventCommand[];
}

export interface EventScripts {
  readonly rooms: Readonly<Record<string, readonly EventDefinition[]>>;
}

const TRIGGERS = new Set(['roomStart', 'enterArea', 'interact', 'flag', 'failCount', 'idle']);
/** How close (px) the player's body must come to an actor for `interact`. */
const INTERACT_RANGE = 12;

/** Validates a loaded script file: shape, trigger types, and every command name (via the registry). Throws listing problems. */
export function parseEventScripts(json: unknown, registry: EventRegistry<EventContext>, label: string): EventScripts {
  const errors: string[] = [];
  const rooms = (json as { rooms?: unknown } | null)?.rooms;
  if (typeof rooms !== 'object' || rooms === null) {
    throw new Error(`${label}: needs a "rooms" object.`);
  }
  for (const [room, events] of Object.entries(rooms as Record<string, unknown>)) {
    if (!Array.isArray(events)) {
      errors.push(`rooms.${room}: a list of events`);
      continue;
    }
    for (const [i, event] of (events as EventDefinition[]).entries()) {
      const at = `rooms.${room}[${i}]${event?.id ? ` (${event.id})` : ''}`;
      if (typeof event?.id !== 'string') errors.push(`${at}: id`);
      if (!TRIGGERS.has(event?.trigger?.type)) errors.push(`${at}: trigger.type one of ${[...TRIGGERS].join('/')}`);
      if (!Array.isArray(event?.do)) {
        errors.push(`${at}: do (command list)`);
        continue;
      }
      try {
        registry.validate(event.do, at);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  if (errors.length > 0) throw new Error(`${label}: invalid event scripts\n  - ${errors.join('\n  - ')}`);
  return json as EventScripts;
}

export async function loadEventScripts(url: string, registry: EventRegistry<EventContext>): Promise<EventScripts> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return parseEventScripts(await response.json(), registry, url);
}

export interface EventDirectorDeps {
  readonly scripts: EventScripts;
  readonly registry: EventRegistry<EventContext>;
  readonly dialogue: DialogueController;
  readonly sound: SoundQueue;
  readonly combat: CombatData;
  readonly animAssets: Readonly<Record<string, LoadedAnimAsset>>;
  readonly session: RogueliteSession;
  /** Room id -> the music that should be playing there (sounds.json "rooms"). */
  readonly roomBgm?: Readonly<Record<string, string>>;
  /** Room id -> its named points/areas (from the room definitions). */
  readonly spaces: Readonly<Record<string, RoomEventSpace>>;
}

const EMPTY_SPACE: RoomEventSpace = { points: {}, areas: {} };

/**
 * Runs the current room's events: checks triggers each step, starts events,
 * advances running ones on simulation time (so a paused game pauses them),
 * handles "skip scene", and puts the camera and input back when the last
 * running event ends. Simulation phase, after combat.
 */
/** Does this command list (at any depth: parallel, if...) start a music track? */
export function startsBgm(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(startsBgm);
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['cmd'] === 'bgm' && typeof record['id'] === 'string') return true;
  return Object.values(record).some(startsBgm);
}

/**
 * Entering a room: switch to its default music (a no-op when it's already
 * playing) — so continuing from a checkpoint deep in Part 0 still has it.
 * Unless one of the room's not-yet-seen events starts music itself: that
 * scene's timing wins (the music begins on its cue).
 */
function applyRoomBgm(deps: EventDirectorDeps, roomId: string): void {
  const music = deps.roomBgm?.[roomId];
  if (!music) return;
  const scenePlaysIt = (deps.scripts.rooms[roomId] ?? []).some((def) => !deps.session.seenEvents.has(`${roomId}:${def.id}`) && startsBgm(def.do));
  if (!scenePlaysIt) deps.sound.bgm(music, ROOM_BGM_FADE_MS);
}

const ROOM_BGM_FADE_MS = 1500;

export function createEventDirectorSystem(deps: EventDirectorDeps): System {
  let running: { readonly def: EventDefinition; readonly instance: EventInstance<EventContext> }[] = [];
  let roomOfRunning = '';

  return {
    name: 'roguelite:events/director',
    order: 3,
    run: (ctx) => {
      const found = [...ctx.world.query([RoomEvents] as const)][0];
      if (!found) return;
      const [eventsId, roomEvents] = found;
      // A new room (scene), or the same room loaded again (restart / continue): anything running belonged to the old world.
      if (roomOfRunning !== roomEvents.roomId || !roomEvents.started) {
        running = [];
        roomOfRunning = roomEvents.roomId;
      }
      const space = deps.spaces[roomEvents.roomId] ?? EMPTY_SPACE;
      const eventCtx: EventContext = {
        world: ctx.world,
        room: space,
        dialogue: deps.dialogue,
        sound: deps.sound,
        combat: deps.combat,
        animAssets: deps.animAssets,
        session: deps.session,
        requestSceneChange: (room) => ctx.requestSceneChange(room),
      };

      // Idle time: any intent (move or press) resets it; a locked input doesn't count as idling.
      const intent = readIntent(ctx.input);
      const locked = [...ctx.world.query([InputLock] as const)][0]?.[1].locked ?? false;
      const active = intent.moveX !== 0 || intent.moveY !== 0 || intent.dash || intent.parry || intent.quickSpell || intent.castSpell;
      let idleMs = active || locked ? 0 : roomEvents.idleMs + ctx.deltaMs;

      // Triggers.
      const playerEntity = findActor(ctx.world, 'player');
      const player = playerEntity !== undefined ? ctx.world.get(playerEntity, CombatPlayer) : undefined;
      const playerPos = playerEntity !== undefined ? ctx.world.get(playerEntity, Position) : undefined;
      const body = player && playerPos ? boxAt(playerPos, deps.combat.playerForms[player.form].hurtbox) : undefined;
      const flags = [...ctx.world.query([Flags] as const)][0]?.[1].values ?? {};
      if (!roomEvents.started) applyRoomBgm(deps, roomEvents.roomId);
      for (const def of deps.scripts.rooms[roomEvents.roomId] ?? []) {
        const key = `${roomEvents.roomId}:${def.id}`;
        if (running.some((r) => r.def === def)) continue;
        if (!def.repeat && deps.session.seenEvents.has(key)) continue;
        const trigger = def.trigger;
        let fire = false;
        switch (trigger.type) {
          case 'roomStart':
            fire = !roomEvents.started;
            break;
          case 'enterArea': {
            const area = space.areas[trigger.area];
            if (!area) throw new Error(`event "${key}": room has no area "${trigger.area}".`);
            fire = !!body && overlaps(body, area);
            break;
          }
          case 'interact': {
            const target = findActor(ctx.world, trigger.target);
            const at = target !== undefined ? actorCenter(ctx.world, target) : undefined;
            const center = body ? boxCenter(body) : undefined;
            fire = !!at && !!center && Math.hypot(at.x - center.x, at.y - center.y) <= INTERACT_RANGE;
            break;
          }
          case 'flag':
            fire = flags[trigger.flag] === true;
            break;
          case 'failCount':
            fire = (roomEvents.failCounts[trigger.key] ?? 0) >= trigger.n;
            break;
          case 'idle':
            fire = idleMs >= trigger.ms;
            if (fire) idleMs = 0;
            break;
        }
        if (fire) {
          deps.session.seenEvents.add(key);
          running.push({ def, instance: deps.registry.start(def.do) });
        }
      }
      ctx.world.set(eventsId, RoomEvents, { ...roomEvents, started: true, idleMs });

      // Skip scene (long-press in the dialogue panel): only events that hold the input.
      if (deps.dialogue.takeSkip() && locked) {
        for (const r of running) r.instance.skip(eventCtx);
        deps.dialogue.hide();
      }

      const before = running.length;
      running = running.filter((r) => !r.instance.update(eventCtx, ctx.deltaMs));
      if (before > 0 && running.length === 0) {
        // Nothing scripted is running: the camera goes back to the player, input comes back.
        for (const [id, director] of ctx.world.query([CameraDirector] as const)) {
          if (director.mode !== 'follow' || director.target !== 'player') ctx.world.set(id, CameraDirector, { ...director, mode: 'follow', target: 'player' });
        }
        for (const [id, lock] of ctx.world.query([InputLock] as const)) {
          if (lock.locked) ctx.world.set(id, InputLock, { locked: false });
        }
        deps.dialogue.setSkippable(false);
      }
    },
  };
}

/** Bumps a room fail counter (event spec §2 onFailCount) — game systems call this when the player fails at something. */
export function countFailure(world: World, key: string): void {
  for (const [id, events] of world.query([RoomEvents] as const)) {
    world.set(id, RoomEvents, { ...events, failCounts: { ...events.failCounts, [key]: (events.failCounts[key] ?? 0) + 1 } });
  }
}
