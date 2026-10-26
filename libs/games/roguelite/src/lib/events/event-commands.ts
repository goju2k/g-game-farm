import { createEventRegistry, type AABB, type CommandTask, type ComponentType, type EntityId, type EventCommand, type EventRegistry, type Rgb, type World } from '@g-game-farm/ribs';
import type { HintController } from '../hints/hints.js';
import type { SoundQueue } from '../audio/sound-cues.js';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';
import { playClip, startAnimator } from '../anim/play-clip.js';
import { fxAsset, spriteFor } from '../fx/fx.js';
import { CombatPlayer, ScreenShake } from '../combat/combat-components.js';
import type { CombatData } from '../combat/combat-data.js';
import { spawnCombatPlayerEntity } from '../combat/spawn-combat-player.js';
import { Animator, Flags, LightEmitter, Position, RoomLighting, SpriteRender } from '../components.js';
import { COLD_LIGHT, WARM_LIGHT } from '../lighting/dungeon-lighting.js';
import type { RogueliteSession } from '../session.js';
import { spriteDrawOrigin } from '../systems/render-sprites.js';
import type { DialogueController } from './dialogue-controller.js';
import { AmbientOverride, CameraDirector, Companion, Emote, EventActor, EventFade, GlowDot, Hidden, Highlight, InputLock, LightPulse, PropMarker, ScriptedClip } from './event-components.js';
import type { RecordController } from '../records/record-controller.js';
import { grantSkill, setRoomLock } from '../world/world-systems.js';

/** Named places in the current room that scripts refer to (from the room definition's markers). */
export interface RoomEventSpace {
  readonly points: Readonly<Record<string, Readonly<{ x: number; y: number }>>>;
  readonly areas: Readonly<Record<string, AABB>>;
}

/** What every event command gets, rebuilt each simulation step. */
export interface EventContext {
  readonly world: World;
  readonly room: RoomEventSpace;
  readonly dialogue: DialogueController;
  /** Sounds go here (played by the render side) — never straight to the audio engine. */
  readonly sound: SoundQueue;
  readonly combat: CombatData;
  readonly animAssets: Readonly<Record<string, LoadedAnimAsset>>;
  readonly session: RogueliteSession;
  readonly requestSceneChange: (room: string) => void;
  /** The record panel (record command). */
  readonly records: RecordController;
  /** First-use hints (hint command). */
  readonly hints: HintController;
}

const STEP_MS = 1000 / 60;
/** The companion's light (planning P-015: gold-white) — tint for L·(1+k·L). */
export const GOLD_LIGHT: Rgb = [0.25, 0.15, -0.1];
/** #fff1c8 — the companion is pale gold-white (planning P-015), not the hand flame's yellow. */
const GOLD_DOT: Rgb = [1, 0xf1 / 255, 0xc8 / 255];
const EMBER_DOT: Rgb = [0.75, 0.92, 1];
const COMPANION_RADII = [8, 12, 16, 20];
/** The companion sprite's body (9x9) is centered at about y 7 of its 16px frame (asset room). */
const COMPANION_BODY_CENTER_Y = 7;

// ---------- lookups ----------

const PLAYER_IDS = new Set(['player', 'ember']);

export function findActor(world: World, id: string): EntityId | undefined {
  if (PLAYER_IDS.has(id) || id === 'player.handFlame') {
    for (const [entity] of world.query([CombatPlayer] as const)) return entity;
    return undefined;
  }
  for (const [entity, actor] of world.query([EventActor] as const)) {
    if (actor.id === id) return entity;
  }
  return undefined;
}

/** An actor's visual center: for a sprite with an origin, the middle of what's drawn; otherwise its Position. */
export function actorCenter(world: World, entity: EntityId): { x: number; y: number } | undefined {
  const position = world.get(entity, Position);
  if (!position) return undefined;
  const sprite = world.get(entity, SpriteRender);
  if (!sprite) return { x: position.x, y: position.y };
  const drawn = spriteDrawOrigin(position, sprite);
  return { x: drawn.x + sprite.width / 2, y: drawn.y + sprite.height / 2 };
}

type PointSpec = string | { readonly x: number; readonly y: number } | { readonly dx?: number; readonly dy?: number; readonly of?: string };

/** Resolves a script point: a room point name, an actor id, absolute {x,y}, or {dx,dy[,of]} relative to `from` (or to actor `of`). */
export function resolvePoint(ctx: EventContext, spec: unknown, from?: { x: number; y: number }): { x: number; y: number } {
  if (typeof spec === 'string') {
    const named = ctx.room.points[spec];
    if (named) return { x: named.x, y: named.y };
    const actor = findActor(ctx.world, spec);
    const center = actor !== undefined ? actorCenter(ctx.world, actor) : undefined;
    if (center) return center;
    throw new Error(`event: no point or actor "${spec}" in this room.`);
  }
  const p = spec as PointSpec & Record<string, unknown>;
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y };
  const base = typeof p.of === 'string' ? resolvePoint(ctx, p.of) : from;
  if (!base) throw new Error(`event: relative point ${JSON.stringify(spec)} needs a start.`);
  return { x: base.x + ((p.dx as number | undefined) ?? 0), y: base.y + ((p.dy as number | undefined) ?? 0) };
}

function singletonOf<T>(world: World, type: ComponentType<T>): [EntityId, T] | undefined {
  for (const [entity, value] of world.query([type] as const)) return [entity, value];
  return undefined;
}

function num(command: EventCommand, name: string, fallback?: number): number {
  const value = command[name];
  if (typeof value === 'number') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`event command "${command.cmd}": "${name}" must be a number.`);
}

function str(command: EventCommand, name: string, fallback?: string): string {
  const value = command[name];
  if (typeof value === 'string') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`event command "${command.cmd}": "${name}" must be a string.`);
}

/** A task that eases a number from `from` to `to` over ms, writing it with `apply` (smoothstep when eased). */
function tween(ms: number, from: number, to: number, apply: (value: number) => void, eased = false): CommandTask<EventContext> | void {
  if (ms <= 0) {
    apply(to);
    return;
  }
  let t = 0;
  return {
    update: (_ctx, dt) => {
      t = Math.min(ms, t + dt);
      const k = t / ms;
      apply(from + (to - from) * (eased ? k * k * (3 - 2 * k) : k));
      return t >= ms;
    },
    finish: () => apply(to),
  };
}

function waitTask(ms: number): CommandTask<EventContext> {
  let t = 0;
  return { update: (_ctx, dt) => (t += dt) >= ms };
}

// ---------- the vocabulary ----------

function setLocked(ctx: EventContext, locked: boolean): void {
  const lock = singletonOf(ctx.world, InputLock);
  if (lock) ctx.world.set(lock[0], InputLock, { locked });
  else ctx.world.set(ctx.world.createEntity(), InputLock, { locked });
  ctx.dialogue.setSkippable(locked);
}

function lightTarget(ctx: EventContext, id: string): EntityId | undefined {
  return findActor(ctx.world, id);
}

/** The ember *is* its light (opening scene A): its sprite fades in and out with the light radius. */
function applyEmberVisibility(world: World, entity: EntityId, radius: number): void {
  const player = world.get(entity, CombatPlayer);
  const sprite = world.get(entity, SpriteRender);
  if (!player || player.form !== 'ember' || !sprite) return;
  const alpha = Math.max(0, Math.min(1, radius / 8));
  world.set(entity, SpriteRender, { ...sprite, tint: [1, 1, 1, alpha] });
}

function colorTint(color: string): { tint: Rgb; dot: Rgb } {
  if (color === 'gold') return { tint: GOLD_LIGHT, dot: GOLD_DOT };
  return { tint: COLD_LIGHT, dot: EMBER_DOT };
}

/** Points along a circle around `center`, starting at `from`'s angle, sweeping `turns` (negative = the other way). */
function orbitPoints(center: { x: number; y: number }, from: { x: number; y: number }, radius: number, turns: number): { x: number; y: number }[] {
  const start = Math.atan2(from.y - center.y, from.x - center.x);
  const steps = Math.max(4, Math.ceil(Math.abs(turns) * 16));
  return Array.from({ length: steps }, (_, i) => {
    const a = start + ((i + 1) / steps) * turns * Math.PI * 2;
    return { x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius };
  });
}

export function createGameEventRegistry(): EventRegistry<EventContext> {
  return createEventRegistry<EventContext>()
    .register('lockInput', (_c, ctx) => setLocked(ctx, true))
    .register('unlockInput', (_c, ctx) => setLocked(ctx, false))
    .register('record', (c, ctx) => {
      // The stone record panel; the game waits (and is paused) until it's closed.
      const seq = ctx.records.show(str(c, 'id'));
      return { update: (x) => x.records.isClosed(seq), finish: (x) => x.records.close(seq) };
    })
    .register('hint', (c, ctx) => {
      // { "cmd": "hint", "id": "pillar" } shows it until its skill is used; "hide": true takes it down.
      if (c['hide'] === true) ctx.hints.hide(str(c, 'id'));
      else ctx.hints.show(str(c, 'id'));
    })
    .register('unlockSkill', (c, ctx) => grantSkill(ctx.world, ctx.session, str(c, 'skill', 'pillar')))
    .register('lockRoom', (_c, ctx) => setRoomLock(ctx.world, true))
    .register('unlockRoom', (_c, ctx) => setRoomLock(ctx.world, false))
    .register('setFlag', (c, ctx) => {
      // "progress": true — kept for the whole run (session.flags), not just this room.
      if (c['progress'] === true && typeof c['flag'] === 'string') ctx.session.flags.add(c['flag']);
      for (const [entity, flags] of ctx.world.query([Flags] as const)) {
        ctx.world.set(entity, Flags, { values: { ...flags.values, [str(c, 'flag')]: c['value'] !== false } });
      }
    })
    .register('if', (c, ctx, tools) => {
      const flags = singletonOf(ctx.world, Flags)?.[1].values ?? {};
      const branch = (flags[str(c, 'flag')] ? c['then'] : c['else']) as readonly EventCommand[] | undefined;
      return branch && branch.length > 0 ? tools.sequence(branch) : undefined;
    })
    .register('fade', (c, ctx) => {
      const out = str(c, 'to') === 'out';
      const color = str(c, 'color', 'black') === 'white' ? 'white' : 'black';
      const existing = singletonOf(ctx.world, EventFade);
      const entity = existing?.[0] ?? ctx.world.createEntity();
      const from = existing?.[1].alpha ?? (out ? 0 : 1);
      return tween(num(c, 'ms', 0), from, out ? 1 : 0, (alpha) => {
        if (!out && alpha <= 0) ctx.world.destroyEntity(entity);
        else ctx.world.set(entity, EventFade, { color, alpha });
      });
    })
    .register('camera.pan', (c, ctx) => {
      const director = singletonOf(ctx.world, CameraDirector);
      if (!director) return;
      const [entity, start] = director;
      let target: { x: number; y: number };
      if (typeof c['toward'] === 'string') {
        const toward = resolvePoint(ctx, c['toward']);
        const dx = toward.x - start.x;
        const dy = toward.y - start.y;
        const length = Math.hypot(dx, dy) || 1;
        const px = num(c, 'px');
        target = { x: start.x + (dx / length) * px, y: start.y + (dy / length) * px };
      } else {
        target = resolvePoint(ctx, c['to']);
      }
      const ms = num(c, 'ms', 0);
      const eased = c['ease'] !== 'linear';
      let t = 0;
      const apply = (k: number) => {
        const e = eased ? k * k * (3 - 2 * k) : k;
        ctx.world.set(entity, CameraDirector, { mode: 'fixed', target: start.target, x: start.x + (target.x - start.x) * e, y: start.y + (target.y - start.y) * e });
      };
      if (ms <= 0) {
        apply(1);
        return;
      }
      return {
        update: (_x, dt) => {
          t = Math.min(ms, t + dt);
          apply(t / ms);
          return t >= ms;
        },
        finish: () => apply(1),
      };
    })
    .register('camera.follow', (c, ctx) => {
      const director = singletonOf(ctx.world, CameraDirector);
      if (director) ctx.world.set(director[0], CameraDirector, { ...director[1], mode: 'follow', target: str(c, 'target', 'player') });
    })
    .register('camera.shake', (c, ctx) => {
      const shake = singletonOf(ctx.world, ScreenShake);
      const framesLeft = Math.round(num(c, 'ms') / STEP_MS);
      if (shake) ctx.world.set(shake[0], ScreenShake, { framesLeft, px: num(c, 'px') });
    })
    .register('light.ambient', (c, ctx) => {
      const existing = singletonOf(ctx.world, AmbientOverride);
      const base = singletonOf(ctx.world, RoomLighting)?.[1].settings.ambient[0] ?? 0.3;
      const entity = existing?.[0] ?? ctx.world.createEntity();
      const from = existing?.[1].level ?? base;
      return tween(num(c, 'ms', 0), from, num(c, 'to'), (level) => ctx.world.set(entity, AmbientOverride, { level }));
    })
    .register('light.tween', (c, ctx) => {
      const entity = lightTarget(ctx, str(c, 'target'));
      const light = entity !== undefined ? ctx.world.get(entity, LightEmitter) : undefined;
      if (entity === undefined || !light) return;
      ctx.world.remove(entity, LightPulse); // an event takes over this light's radius
      return tween(num(c, 'ms', 0), light.radius, num(c, 'radius'), (radius) => {
        const current = ctx.world.get(entity, LightEmitter);
        if (current) ctx.world.set(entity, LightEmitter, { ...current, radius });
        applyEmberVisibility(ctx.world, entity, radius);
      });
    })
    .register('light.spawn', (c, ctx) => {
      const at = resolvePoint(ctx, c['at']);
      const { tint, dot } = colorTint(str(c, 'color', 'cold'));
      const entity = ctx.world.createEntity();
      ctx.world.set(entity, Position, at);
      ctx.world.set(entity, EventActor, { id: str(c, 'id') });
      ctx.world.set(entity, LightEmitter, { offsetX: 0, offsetY: 0, radius: num(c, 'radius', 8), tint });
      ctx.world.set(entity, GlowDot, { size: 2, color: dot });
    })
    .register('light.remove', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      if (entity !== undefined) ctx.world.destroyEntity(entity);
    })
    .register('spawn', (c, ctx) => {
      const kind = str(c, 'kind');
      const entity = ctx.world.createEntity();
      ctx.world.set(entity, Position, resolvePoint(ctx, c['at']));
      ctx.world.set(entity, EventActor, { id: str(c, 'id', kind) });
      if (kind === 'companion') {
        makeCompanion(ctx.world, entity, false);
      } else if (kind === 'prop') {
        // A scripted prop (D-037): "sprite" = an anim asset id, "clip" (default its first), "layer": "overlay" to draw over the lit world,
        // "light": { "radius", "color": "warm" | "cold" }, "flip": true to mirror. anim / move / despawn work on it like any actor.
        const art = fxAsset(ctx.world, str(c, 'sprite', ''));
        const clip = typeof c['clip'] === 'string' ? c['clip'] : art ? Object.keys(art.clips)[0] : undefined;
        if (art && clip && art.clips[clip]) {
          const overlay = c['layer'] === 'overlay';
          ctx.world.set(entity, SpriteRender, { ...spriteFor(art, clip, c['flip'] === true ? { flipX: true } : {}), ...(overlay ? { layer: 'overlay' } : {}) });
          ctx.world.set(entity, Animator, startAnimator(art.clips, clip));
        } else {
          ctx.world.set(entity, PropMarker, { size: 6 });
        }
        const light = c['light'] as { radius?: unknown; color?: unknown } | undefined;
        if (light && typeof light.radius === 'number') {
          ctx.world.set(entity, LightEmitter, { offsetX: 0, offsetY: -6, radius: light.radius, tint: light.color === 'warm' ? WARM_LIGHT : COLD_LIGHT });
        }
      } else if (kind === 'artifact') {
        // "art": which artifact (default: the spark of being). Its anim has idle / acquire (acquire:absorb = hand over to the form change).
        const art = fxAsset(ctx.world, str(c, 'art', 'artifact-spark-of-being'));
        // "at" is where the artifact stands; its glow sits ~10px up the pedestal.
        const glowY = art ? -10 : 0;
        ctx.world.set(entity, LightEmitter, { offsetX: 0, offsetY: glowY, radius: 16, tint: COLD_LIGHT });
        ctx.world.set(entity, LightPulse, { base: 16, amplitude: 4, periodMs: 1600, phaseMs: 0 });
        if (art) {
          ctx.world.set(entity, SpriteRender, spriteFor(art, 'idle'));
          ctx.world.set(entity, Animator, startAnimator(art.clips, 'idle'));
        } else {
          ctx.world.set(entity, GlowDot, { size: 4, color: EMBER_DOT });
        }
      } else {
        throw new Error(`event spawn: unknown kind "${kind}".`);
      }
    })
    .register('despawn', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      if (entity !== undefined) ctx.world.destroyEntity(entity);
    })
    .register('move', (c, ctx) => {
      const id = str(c, 'id');
      const entity = findActor(ctx.world, id);
      if (entity === undefined) return;
      const speed = num(c, 'speed'); // px per second
      // Resolve the whole path up front, each relative point from the previous one.
      const points: { x: number; y: number }[] = [];
      let cursor = { ...(ctx.world.get(entity, Position) as Position) };
      for (const step of (c['path'] as unknown[]) ?? []) {
        const s = step as Record<string, unknown>;
        if (typeof s === 'object' && s !== null && typeof s['orbit'] === 'string') {
          const center = resolvePoint(ctx, s['orbit']);
          const ring = orbitPoints(center, cursor, (s['radius'] as number | undefined) ?? 24, (s['turns'] as number | undefined) ?? 1);
          points.push(...ring);
          cursor = ring[ring.length - 1];
        } else {
          cursor = resolvePoint(ctx, step, cursor);
          points.push(cursor);
        }
      }
      let index = 0;
      const place = (p: { x: number; y: number }, dirX: number) => {
        ctx.world.set(entity, Position, { x: p.x, y: p.y });
        const player = ctx.world.get(entity, CombatPlayer);
        if (player && dirX !== 0) ctx.world.set(entity, CombatPlayer, { ...player, facingX: Math.sign(dirX), facingY: 0 });
      };
      return {
        update: (_x, dt) => {
          let budget = (speed * dt) / 1000;
          while (index < points.length && budget > 0) {
            const pos = ctx.world.get(entity, Position) as Position;
            const target = points[index];
            const dx = target.x - pos.x;
            const dy = target.y - pos.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= budget) {
              place(target, dx);
              budget -= distance;
              index++;
            } else {
              place({ x: pos.x + (dx / distance) * budget, y: pos.y + (dy / distance) * budget }, dx);
              budget = 0;
            }
          }
          return index >= points.length;
        },
        finish: () => {
          if (points.length > 0) place(points[points.length - 1], 0);
        },
      };
    })
    .register('anim', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      const animator = entity !== undefined ? ctx.world.get(entity, Animator) : undefined;
      if (entity === undefined || !animator || !(str(c, 'clip') in animator.clips)) return;
      playClip(ctx.world, entity, str(c, 'clip'));
      // On the player, the combat look would take it straight back: keep it until it ends ("hold": until the next anim).
      if (ctx.world.get(entity, CombatPlayer)) ctx.world.set(entity, ScriptedClip, { clip: str(c, 'clip'), hold: c['hold'] === true });
    })
    .register('hide', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      if (entity !== undefined) ctx.world.set(entity, Hidden, { hidden: true });
    })
    .register('show', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      if (entity !== undefined) ctx.world.remove(entity, Hidden);
    })
    .register('highlight', (c, ctx) => {
      // White fills the screen from its edges (in), stays (hold), clears (out). Waits through in + hold: swap things under the white.
      const inMs = num(c, 'in', 250);
      const holdMs = num(c, 'hold', 300);
      const outMs = num(c, 'out', 600);
      const existing = singletonOf(ctx.world, Highlight);
      ctx.world.set(existing?.[0] ?? ctx.world.createEntity(), Highlight, { inMs, holdMs, outMs, elapsedMs: 0 });
      return waitTask(inMs + holdMs);
    })
    .register('face', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      if (entity === undefined) return;
      const me = actorCenter(ctx.world, entity);
      const toward = resolvePoint(ctx, c['toward']);
      if (!me) return;
      const dirX = Math.sign(toward.x - me.x) || 1;
      const player = ctx.world.get(entity, CombatPlayer);
      if (player) ctx.world.set(entity, CombatPlayer, { ...player, facingX: dirX, facingY: 0 });
      const sprite = ctx.world.get(entity, SpriteRender);
      if (sprite) ctx.world.set(entity, SpriteRender, { ...sprite, flipX: dirX < 0 });
    })
    .register('setBrightness', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      const companion = entity !== undefined ? ctx.world.get(entity, Companion) : undefined;
      if (entity === undefined || !companion) return;
      setCompanionBrightness(ctx.world, entity, num(c, 'level'));
    })
    .register('follow', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      const companion = entity !== undefined ? ctx.world.get(entity, Companion) : undefined;
      if (entity !== undefined && companion) ctx.world.set(entity, Companion, { ...companion, following: c['on'] !== false });
      if (c['on'] !== false && companion) ctx.session.flags.add(COMPANION_JOINED_FLAG);
    })
    .register('setForm', (c, ctx) => {
      const form = str(c, 'form') === 'child' ? 'child' : 'ember';
      const old = findActor(ctx.world, 'player');
      if (old === undefined) return;
      const position = ctx.world.get(old, Position) as Position;
      const previous = ctx.world.get(old, CombatPlayer);
      const hidden = ctx.world.get(old, Hidden) !== undefined;
      ctx.world.destroyEntity(old);
      const player = spawnCombatPlayerEntity(ctx.world, form, position, { combat: ctx.combat, animAssets: ctx.animAssets, session: ctx.session }, 'event setForm');
      if (hidden) ctx.world.set(player, Hidden, { hidden: true }); // stays hidden until `show`
      // "intro": an entrance clip on the new form (held until it ends).
      const intro = typeof c['intro'] === 'string' ? c['intro'] : undefined;
      const animator = ctx.world.get(player, Animator);
      if (intro && animator && intro in animator.clips) {
        playClip(ctx.world, player, intro);
        ctx.world.set(player, ScriptedClip, { clip: intro, hold: false });
      }
      ctx.sound.sfx('form-change');
      const fresh = ctx.world.get(player, CombatPlayer);
      if (fresh && previous) ctx.world.set(player, CombatPlayer, { ...fresh, facingX: previous.facingX, facingY: previous.facingY });
    })
    .register('emote', (c, ctx) => {
      const entity = findActor(ctx.world, str(c, 'id'));
      if (entity === undefined) return;
      const icon = str(c, 'icon');
      const ms = num(c, 'ms', 900);
      const totalF = Math.max(1, Math.round(ms / STEP_MS));
      ctx.world.set(entity, Emote, { icon: icon === '!' ? 'exclaim' : icon === '?' ? 'question' : 'ellipsis', framesLeft: totalF, totalF });
      ctx.sound.sfx('emote');
      return waitTask(ms);
    })
    .register('say', (c, ctx) => {
      const speaker = str(c, 'speaker');
      const locked = singletonOf(ctx.world, InputLock)?.[1].locked ?? false;
      const auto = typeof c['auto'] === 'number' ? (c['auto'] as number) : undefined;
      const seq = ctx.dialogue.show({ speaker, text: str(c, 'text'), locked, ...(auto !== undefined ? { autoMs: auto } : {}) });
      return {
        update: (x) => {
          for (let n = x.dialogue.takeDims(seq); n > 0; n--) {
            const entity = findActor(x.world, speaker);
            const companion = entity !== undefined ? x.world.get(entity, Companion) : undefined;
            if (entity !== undefined && companion) setCompanionBrightness(x.world, entity, companion.brightness - 1);
          }
          if (!x.dialogue.isComplete(seq)) return false;
          x.dialogue.hide();
          return true;
        },
        finish: (x) => x.dialogue.hide(),
      };
    })
    .register('goRoom', (c, ctx) => {
      ctx.session.pendingEntryId = typeof c['entry'] === 'string' ? c['entry'] : undefined;
      ctx.requestSceneChange(str(c, 'room'));
    })
    .register('sfx', (c, ctx) => {
      ctx.sound.sfx(str(c, 'id'), typeof c['volume'] === 'number' ? c['volume'] : undefined);
    })
    .register('bgm', (c, ctx) => {
      // "id": null (or omitted) fades the music out.
      ctx.sound.bgm(typeof c['id'] === 'string' ? c['id'] : undefined, typeof c['fadeMs'] === 'number' ? c['fadeMs'] : undefined);
    });
}

/** Normal (planning: 2 = calm, 3 = excited, {dim} = one step down) — every spawn starts here; scripts raise it. */
export const COMPANION_DEFAULT_BRIGHTNESS = 2;

/** Set once the companion follows the player (the `follow` command): from then on it comes along into every room (progress flag). */
export const COMPANION_JOINED_FLAG = 'companion-joined';

/** Turns `entity` (with Position) into the companion: its light, and its sprite (a glow dot without the art). */
function makeCompanion(world: World, entity: EntityId, following: boolean): void {
  const brightness = COMPANION_DEFAULT_BRIGHTNESS;
  world.set(entity, Companion, { brightness, following });
  world.set(entity, LightEmitter, { offsetX: 0, offsetY: 0, radius: COMPANION_RADII[brightness], tint: GOLD_LIGHT });
  const art = fxAsset(world, 'companion');
  if (art) {
    // Position stays the light's center: the body is drawn around it, not standing on it.
    const clip = companionClip(brightness);
    world.set(entity, SpriteRender, { ...spriteFor(art, clip), originY: COMPANION_BODY_CENTER_Y });
    world.set(entity, Animator, startAnimator(art.clips, clip));
  } else {
    world.set(entity, GlowDot, { size: 4, color: GOLD_DOT });
  }
}

/** A room starting after the companion joined: it's already there beside the player, following. */
export function spawnFollowingCompanion(world: World, near: Readonly<{ x: number; y: number }>): EntityId {
  const entity = world.createEntity();
  world.set(entity, Position, { x: near.x - 12, y: near.y - 8 });
  world.set(entity, EventActor, { id: 'companion' });
  makeCompanion(world, entity, true);
  return entity;
}

/** The companion's idle clip for a brightness level (0..3): dim, dim, normal, bright. */
export function companionClip(brightness: number): string {
  return brightness >= 3 ? 'idle-bright' : brightness >= 2 ? 'idle' : 'idle-dim';
}

export function setCompanionBrightness(world: World, entity: EntityId, level: number): void {
  const companion = world.get(entity, Companion);
  if (!companion) return;
  const brightness = Math.max(0, Math.min(COMPANION_RADII.length - 1, Math.round(level)));
  world.set(entity, Companion, { ...companion, brightness });
  const light = world.get(entity, LightEmitter);
  if (light) world.set(entity, LightEmitter, { ...light, radius: COMPANION_RADII[brightness] });
}
