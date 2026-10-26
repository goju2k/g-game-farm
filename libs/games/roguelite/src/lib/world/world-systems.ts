import { COLLISION_EMPTY, COLLISION_SOLID, createCollisionGrid, overlaps, type AABB, type EntityId, type System, type World } from '@g-game-farm/ribs';
import { LIGHT_MOTION } from '../lighting/light-motion.js';
import { CombatPlayer, SpellProjectile } from '../combat/combat-components.js';
import { VIRTUAL } from '../combat/intent.js';
import { playClip, startAnimator } from '../anim/play-clip.js';
import { Animator, Flags, LightEmitter, Position, RoomTileLayout, SpriteRender, TileLight } from '../components.js';
import { msUntilTag } from '../events/event-art.js';
import { fxAsset, spriteFor } from '../fx/fx.js';
import { actorCenter, findActor } from '../events/event-commands.js';
import { EventActor, InputLock } from '../events/event-components.js';
import { COLD_LIGHT, WARM_LIGHT } from '../lighting/dungeon-lighting.js';
import { ROOM_TILE_SIZE } from '../rooms/tile-layout.js';
import type { RecordController } from '../records/record-controller.js';
import type { RogueliteSession } from '../session.js';
import { Brazier, BrazierPedestal, CrackedWall, Examinable, ExamineState, RoomLock, SealDoor, SkillPickup, Trace, WarmTrail, type CellSpan } from './world-components.js';

/** The examine key (31 §0: E). The touch controls press the virtual button of the same name. */
export const EXAMINE_KEY = 'KeyE';
export const VIRTUAL_EXAMINE = VIRTUAL.examine;
/** Examine reach (31 §0: 24px from the player). */
export const EXAMINE_RANGE = 24;
/** A lit brazier's light. */
const BRAZIER_LIGHT = { radius: 44, offsetY: -8 };
const PEDESTAL_LIGHT = 20;
const TRAIL_SPEED = 90; // px/s
const TRAIL_RADIUS = 16;
/** Things standing in a cell stand on its bottom (markers give the cell center). */
const CELL_FOOT = 7;

// ---------- grid ----------

/** Marks cells solid or open in the room's collision grid. */
export function setCells(world: World, cells: CellSpan['cells'], solid: boolean): void {
  for (const [id, layout] of world.query([RoomTileLayout] as const)) {
    const grid = layout.collision;
    const next = Array.from(grid.cells);
    for (const cell of cells) next[cell.row * grid.columns + cell.column] = solid ? COLLISION_SOLID : COLLISION_EMPTY;
    world.set(id, RoomTileLayout, { ...layout, collision: createCollisionGrid({ ...grid, cells: next }) });
  }
}

/** The cells under a marker's cell centers, and their bounding box. */
export function spanOf(points: readonly { x: number; y: number }[]): CellSpan {
  const cells = points.map((p) => ({ column: Math.floor(p.x / ROOM_TILE_SIZE), row: Math.floor(p.y / ROOM_TILE_SIZE) }));
  const minC = Math.min(...cells.map((c) => c.column));
  const minR = Math.min(...cells.map((c) => c.row));
  const maxC = Math.max(...cells.map((c) => c.column));
  const maxR = Math.max(...cells.map((c) => c.row));
  return { cells, box: { x: minC * ROOM_TILE_SIZE, y: minR * ROOM_TILE_SIZE, width: (maxC - minC + 1) * ROOM_TILE_SIZE, height: (maxR - minR + 1) * ROOM_TILE_SIZE } };
}

function setRoomFlag(world: World, flag: string): void {
  for (const [id, flags] of world.query([Flags] as const)) if (!flags.values[flag]) world.set(id, Flags, { values: { ...flags.values, [flag]: true } });
}

// ---------- art (asset room #34: prop-*) ----------

/** Gives `entity` its prop art at `clip` if the asset is loaded; graybox otherwise. */
function withArt(world: World, entity: EntityId, asset: string, clip: string): void {
  const art = fxAsset(world, asset);
  if (!art?.clips[clip]) return;
  world.set(entity, SpriteRender, spriteFor(art, clip));
  world.set(entity, Animator, startAnimator(art.clips, clip));
}

/** One-shot clips that hand over to a resting one when they finish. */
const THEN: Readonly<Record<string, string>> = { ignite: 'lit', open: 'opened', collapse: 'rubble', taken: 'empty' };

function play(world: World, entity: EntityId, clip: string): void {
  const animator = world.get(entity, Animator);
  if (animator && clip in animator.clips) playClip(world, entity, clip);
}

/** How long until the way opens in a door / wall clip (0 without art). */
function msToPassable(world: World, entity: EntityId, clip: string, tag: string): number {
  return msUntilTag(world.get(entity, Animator)?.clips[clip], tag);
}

/** A cell-span object stands on the bottom middle of its cells. */
function footOf(span: CellSpan): { x: number; y: number } {
  return { x: span.box.x + span.box.width / 2, y: span.box.y + span.box.height };
}

// ---------- spawning (rooms' populate) ----------

/** A trace to examine: `id` is its event actor id (its `interact` events), `art` an anim asset id (graybox slab without one). */
export function spawnTrace(world: World, at: { x: number; y: number }, id: string, art?: string, record?: string): EntityId {
  const entity = world.createEntity();
  world.set(entity, Position, { x: at.x, y: at.y });
  world.set(entity, EventActor, { id });
  world.set(entity, Examinable, { range: EXAMINE_RANGE, halfWidth: 8, height: 16 });
  world.set(entity, Trace, { ...(art ? { art } : {}), ...(record ? { record } : {}) });
  return entity;
}

/** A cold brazier (Position = its base); lighting it sets `flag` and sends a warm trail along `trail` (back toward the hub). */
export function spawnBrazier(world: World, at: { x: number; y: number }, flag: string, session: RogueliteSession, trail: readonly { x: number; y: number }[] = []): EntityId {
  const entity = world.createEntity();
  const lit = session.flags.has(flag);
  world.set(entity, Position, { x: at.x, y: at.y + CELL_FOOT });
  world.set(entity, Brazier, { flag, lit, ...(trail.length > 0 ? { trail } : {}) });
  world.set(entity, LightEmitter, { offsetX: 0, offsetY: BRAZIER_LIGHT.offsetY, radius: lit ? BRAZIER_LIGHT.radius : 0, tint: WARM_LIGHT, motion: LIGHT_MOTION.brazier });
  withArt(world, entity, 'prop-brazier', lit ? 'lit' : 'off');
  return entity;
}

/** The hub's pedestal for one brazier: alight once its flag is set. */
export function spawnPedestal(world: World, at: { x: number; y: number }, flag: string, session: RogueliteSession): EntityId {
  const entity = world.createEntity();
  const lit = session.flags.has(flag);
  world.set(entity, Position, { x: at.x, y: at.y + CELL_FOOT });
  world.set(entity, BrazierPedestal, { flag, lit });
  world.set(entity, LightEmitter, { offsetX: 0, offsetY: -12, radius: lit ? PEDESTAL_LIGHT : 0, tint: WARM_LIGHT, motion: LIGHT_MOTION.socket });
  withArt(world, entity, 'prop-brazier-socket', lit ? 'lit' : 'empty');
  return entity;
}

/** A seal door over the marker cells; already open if its flags are all set. */
export function spawnSealDoor(world: World, points: readonly { x: number; y: number }[], flags: readonly string[], session: RogueliteSession): EntityId {
  const span = spanOf(points);
  const open = flags.every((f) => session.flags.has(f));
  const entity = world.createEntity();
  world.set(entity, Position, footOf(span));
  world.set(entity, SealDoor, { ...span, flags, open });
  world.set(entity, LightEmitter, { offsetX: 0, offsetY: -20, radius: open ? 0 : 22, tint: COLD_LIGHT, motion: LIGHT_MOTION.sealGlyph });
  withArt(world, entity, 'prop-seal-door', open ? 'opened' : 'closed');
  if (!open) setCells(world, span.cells, true);
  return entity;
}

/** A cracked wall over the marker cells; already broken if its flag is set. */
export function spawnCrackedWall(
  world: World,
  points: readonly { x: number; y: number }[],
  flag: string,
  session: RogueliteSession,
  options: { readonly id?: string; readonly eventOnly?: boolean } = {},
): EntityId {
  const span = spanOf(points);
  const broken = session.flags.has(flag);
  const entity = world.createEntity();
  world.set(entity, Position, footOf(span));
  world.set(entity, CrackedWall, { ...span, flag, broken, ...(options.eventOnly ? { eventOnly: true } : {}) });
  if (options.id) world.set(entity, EventActor, { id: options.id });
  // 2-tile and 3-tile drawings (asset room #41); another width stretches the nearest.
  const tiles = span.box.width / ROOM_TILE_SIZE;
  const wide = tiles >= 3 && fxAsset(world, 'prop-cracked-wall-wide') !== undefined;
  withArt(world, entity, wide ? 'prop-cracked-wall-wide' : 'prop-cracked-wall', broken ? 'rubble' : 'idle');
  const drawn = wide ? 3 : 2;
  const sprite = world.get(entity, SpriteRender);
  if (sprite && tiles !== drawn) world.set(entity, SpriteRender, { ...sprite, width: sprite.width * (tiles / drawn), originX: (sprite.originX ?? 0) * (tiles / drawn) });
  if (!broken) setCells(world, span.cells, true);
  return entity;
}

/**
 * A seal crystal on a top wall (D-039/D-040): hung on the upper face row above
 * the floor marker under that wall, a cold breathing light.
 */
export function spawnWallCrystal(world: World, markerCenter: { x: number; y: number }): EntityId {
  const entity = world.createEntity();
  // The marker's cell is under the lower face; the crystal sits at the bottom of the upper face, two cells up.
  const at = { x: markerCenter.x, y: markerCenter.y - ROOM_TILE_SIZE / 2 - ROOM_TILE_SIZE };
  world.set(entity, Position, at);
  withArt(world, entity, 'prop-wall-crystal', 'loop');
  // Hung on the face: sorts with the face's floor line (one tile below it), just in front of the face.
  const sprite = world.get(entity, SpriteRender);
  if (sprite) world.set(entity, SpriteRender, { ...sprite, depthOffset: ROOM_TILE_SIZE + 0.25 });
  world.set(entity, TileLight, { x: at.x, y: at.y - 6, tint: COLD_LIGHT, radii: [30], motion: LIGHT_MOTION.crystal });
  return entity;
}

/** A skill on its pedestal (examine to take it); gone if already taken. */
export function spawnSkillPickup(world: World, at: { x: number; y: number }, id: string, skill: string, session: RogueliteSession): EntityId {
  const entity = world.createEntity();
  world.set(entity, Position, { x: at.x, y: at.y + CELL_FOOT });
  world.set(entity, EventActor, { id });
  world.set(entity, SkillPickup, { skill, taken: session.skills.has(skill) });
  withArt(world, entity, 'prop-skill-pedestal', session.skills.has(skill) ? 'empty' : 'idle');
  if (!session.skills.has(skill)) world.set(entity, Examinable, { range: EXAMINE_RANGE, halfWidth: 8, height: 16 });
  world.set(entity, LightEmitter, { offsetX: 0, offsetY: -12, radius: session.skills.has(skill) ? 0 : 18, tint: WARM_LIGHT });
  return entity;
}

// ---------- fire touching things (called by the spells) ----------

/** A pillar went off at `at`: braziers in reach catch; a big (finisher) pillar also breaks cracked walls it touches. */
export function igniteArea(world: World, at: { x: number; y: number }, radius: number, big: boolean): void {
  for (const [id, brazier, position] of world.query([Brazier, Position] as const)) {
    if (!brazier.lit && Math.hypot(position.x - at.x, position.y - 6 - at.y) <= radius + 6) world.set(id, Brazier, { ...brazier, ignited: true });
  }
  if (!big) return;
  for (const [id, wall] of world.query([CrackedWall] as const)) {
    if (wall.eventOnly) continue;
    const nearestX = Math.max(wall.box.x, Math.min(at.x, wall.box.x + wall.box.width));
    const nearestY = Math.max(wall.box.y, Math.min(at.y, wall.box.y + wall.box.height));
    if (!wall.broken && Math.hypot(at.x - nearestX, at.y - nearestY) <= radius) world.set(id, CrackedWall, { ...wall, struck: true });
  }
}

/** The skill a player may use: before the shrine, no pillar (31 §2). */
export function grantSkill(world: World, session: RogueliteSession, skill: string): void {
  session.skills.add(skill);
  if (skill === 'pillar') for (const [id, player] of world.query([CombatPlayer] as const)) world.set(id, CombatPlayer, { ...player, canCast: true });
}

// ---------- systems ----------

function boxOf(position: { x: number; y: number }, examinable: Examinable): AABB {
  return { x: position.x - examinable.halfWidth, y: position.y - examinable.height, width: examinable.halfWidth * 2, height: examinable.height };
}

/**
 * Examine (31 §0): the nearest examinable within reach is "near" (its
 * shimmer shows); E, a tap (the touch controls' examine button) or a click on
 * it examines it. A click examine keeps the quick spell off until the button
 * is released. Simulation, before the player's combat.
 */
export function createExamineSystem(session: RogueliteSession, records?: RecordController): System {
  return {
    name: 'roguelite:world/examine',
    order: -0.5,
    run: (ctx) => {
      const state = [...ctx.world.query([ExamineState] as const)][0];
      const stateId = state?.[0] ?? ctx.world.createEntity();
      const holding = (state?.[1].holdingClick ?? false) && ctx.input.mouse.buttons.held.has('left');
      const player = findActor(ctx.world, 'player');
      const center = player !== undefined ? actorCenter(ctx.world, player) : undefined;
      const locked = [...ctx.world.query([InputLock] as const)][0]?.[1].locked ?? false;
      let near: EntityId | undefined;
      let best = Infinity;
      if (center && !locked) {
        for (const [id, examinable, position] of ctx.world.query([Examinable, Position] as const)) {
          const box = boxOf(position, examinable);
          const dx = Math.max(box.x - center.x, 0, center.x - (box.x + box.width));
          const dy = Math.max(box.y - center.y, 0, center.y - (box.y + box.height));
          const distance = Math.hypot(dx, dy);
          if (distance <= examinable.range && distance < best) {
            best = distance;
            near = id;
          }
        }
      }
      let examined: string | undefined;
      let clicked = false;
      if (near !== undefined) {
        const target = near;
        const examinable = ctx.world.get(target, Examinable) as Examinable;
        const position = ctx.world.get(target, Position) as Position;
        const mouse = ctx.input.mouse.worldPosition;
        clicked = ctx.input.mouse.buttons.justPressed.has('left') && mouse !== undefined && contains(inflate(boxOf(position, examinable), 6), mouse);
        if (clicked || ctx.input.keyboard.justPressed.has(EXAMINE_KEY) || ctx.input.virtual.buttons.justPressed.has(VIRTUAL_EXAMINE)) {
          examined = ctx.world.get(target, EventActor)?.id;
          // A trace with a record opens it (the game pauses while it's open); its interact events run after.
          const record = ctx.world.get(target, Trace)?.record;
          if (record) records?.show(record);
          const pickup = ctx.world.get(target, SkillPickup);
          if (pickup && !pickup.taken) {
            grantSkill(ctx.world, session, pickup.skill);
            ctx.world.set(target, SkillPickup, { ...pickup, taken: true });
            play(ctx.world, target, 'taken');
            ctx.world.remove(target, Examinable);
            const light = ctx.world.get(target, LightEmitter);
            if (light) ctx.world.set(target, LightEmitter, { ...light, radius: 0 });
          }
        }
      }
      ctx.world.set(stateId, ExamineState, { ...(near !== undefined ? { near } : {}), ...(examined !== undefined ? { examined } : {}), holdingClick: clicked || holding });
    },
  };
}

function contains(box: AABB, point: { x: number; y: number }): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

function inflate(box: AABB, by: number): AABB {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 };
}

/**
 * Fire on braziers, big pillars on cracked walls, doors opening on progress,
 * pedestals following their flags, warm trails travelling. Simulation, just
 * before the spell projectiles move (a shot stopping on a brazier still lights it).
 */
export function createWorldObjectsSystem(session: RogueliteSession): System {
  return {
    name: 'roguelite:world/objects',
    order: 0.66,
    run: (ctx) => {
      // Quick shots touching a cold brazier light it (and stop there).
      for (const [id, brazier, position] of ctx.world.query([Brazier, Position] as const)) {
        if (brazier.lit) continue;
        const box = { x: position.x - 8, y: position.y - 22, width: 16, height: 22 };
        const hit = [...ctx.world.query([SpellProjectile, Position] as const)].find(([, shot, p]) => overlaps({ x: p.x - shot.size / 2, y: p.y - shot.size / 2, width: shot.size, height: shot.size }, box));
        if (hit) {
          ctx.world.destroyEntity(hit[0]);
          ctx.world.set(id, Brazier, { ...brazier, ignited: true });
        }
      }
      for (const [id, brazier, position] of ctx.world.query([Brazier, Position] as const)) {
        if (!brazier.ignited || brazier.lit) continue;
        ctx.world.set(id, Brazier, { ...brazier, ignited: false, lit: true });
        session.flags.add(brazier.flag);
        setRoomFlag(ctx.world, brazier.flag);
        const light = ctx.world.get(id, LightEmitter);
        if (light) ctx.world.set(id, LightEmitter, { ...light, radius: BRAZIER_LIGHT.radius });
        play(ctx.world, id, 'ignite');
        const path = brazier.trail ?? [];
        if (path.length > 0) {
          const trail = ctx.world.createEntity();
          ctx.world.set(trail, Position, { x: position.x, y: position.y - 8 });
          ctx.world.set(trail, WarmTrail, { path: [{ x: position.x, y: position.y - 8 }, ...path], speed: TRAIL_SPEED, travelled: 0 });
          ctx.world.set(trail, LightEmitter, { offsetX: 0, offsetY: 0, radius: TRAIL_RADIUS, tint: WARM_LIGHT });
        }
      }

      // A big pillar on the cracked wall: it collapses (flag now), the way opens at collapse:passable.
      for (const [id, wall] of ctx.world.query([CrackedWall] as const)) {
        if (wall.struck && !wall.broken) {
          ctx.world.set(id, CrackedWall, { ...wall, broken: true, struck: false, collapsingMs: 0 });
          session.flags.add(wall.flag);
          setRoomFlag(ctx.world, wall.flag);
          play(ctx.world, id, 'collapse');
          continue;
        }
        if (wall.collapsingMs === undefined) continue;
        const ms = wall.collapsingMs + ctx.deltaMs;
        if (ms >= msToPassable(ctx.world, id, 'collapse', 'collapse:passable')) {
          setCells(ctx.world, wall.cells, false);
          ctx.world.set(id, CrackedWall, { flag: wall.flag, cells: wall.cells, box: wall.box, broken: true });
        } else {
          ctx.world.set(id, CrackedWall, { ...wall, collapsingMs: ms });
        }
      }

      // Its flags all set: the seal door opens (the glyph splits), passable at open:passable.
      for (const [id, door] of ctx.world.query([SealDoor] as const)) {
        if (door.open) continue;
        if (door.openingMs === undefined) {
          if (!door.flags.every((f) => session.flags.has(f))) continue;
          ctx.world.set(id, SealDoor, { ...door, openingMs: 0 });
          play(ctx.world, id, 'open');
          continue;
        }
        const ms = door.openingMs + ctx.deltaMs;
        if (ms >= msToPassable(ctx.world, id, 'open', 'open:passable')) {
          setCells(ctx.world, door.cells, false);
          ctx.world.set(id, SealDoor, { flags: door.flags, cells: door.cells, box: door.box, open: true });
          const light = ctx.world.get(id, LightEmitter);
          if (light) ctx.world.set(id, LightEmitter, { ...light, radius: 0 });
        } else {
          ctx.world.set(id, SealDoor, { ...door, openingMs: ms });
        }
      }

      for (const [id, pedestal] of ctx.world.query([BrazierPedestal] as const)) {
        const lit = session.flags.has(pedestal.flag);
        if (lit === pedestal.lit) continue;
        ctx.world.set(id, BrazierPedestal, { ...pedestal, lit });
        const light = ctx.world.get(id, LightEmitter);
        if (light) ctx.world.set(id, LightEmitter, { ...light, radius: lit ? PEDESTAL_LIGHT : 0 });
        if (lit) play(ctx.world, id, 'ignite');
      }

      // One-shot prop clips settle into their resting ones (ignite -> lit, open -> opened...).
      for (const [id, animator] of ctx.world.query([Animator] as const)) {
        const next = THEN[animator.current];
        if (next && animator.state.finished && next in animator.clips && (ctx.world.get(id, Brazier) || ctx.world.get(id, BrazierPedestal) || ctx.world.get(id, SealDoor) || ctx.world.get(id, CrackedWall) || ctx.world.get(id, SkillPickup))) {
          playClip(ctx.world, id, next);
        }
      }

      for (const [id, trail] of ctx.world.query([WarmTrail] as const)) {
        const travelled = trail.travelled + (trail.speed * ctx.deltaMs) / 1000;
        const at = pointAlong(trail.path, travelled);
        if (!at) {
          ctx.world.destroyEntity(id);
          continue;
        }
        ctx.world.set(id, WarmTrail, { ...trail, travelled });
        ctx.world.set(id, Position, at);
      }
    },
  };
}

function pointAlong(path: readonly { x: number; y: number }[], distance: number): { x: number; y: number } | undefined {
  let left = distance;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length) return { x: a.x + ((b.x - a.x) * left) / (length || 1), y: a.y + ((b.y - a.y) * left) / (length || 1) };
    left -= length;
  }
  return undefined;
}

/** The `collapse` command: bring down a cracked wall by its actor id (event-only walls included). */
export function collapseWall(world: World, actorId: string): void {
  for (const [id, wall] of world.query([CrackedWall] as const)) {
    if (world.get(id, EventActor)?.id === actorId && !wall.broken) world.set(id, CrackedWall, { ...wall, struck: true });
  }
}

/** lockRoom / unlockRoom: the arena's exits hold shut while locked. */
export function setRoomLock(world: World, locked: boolean): void {
  const found = [...world.query([RoomLock] as const)][0];
  world.set(found?.[0] ?? world.createEntity(), RoomLock, { locked });
}

/** Whether this examinable was examined this step (event director's `interact` trigger). */
export function examinedThisStep(world: World, actorId: string): boolean {
  return [...world.query([ExamineState] as const)][0]?.[1].examined === actorId;
}

/** Whether an actor is examine-only (interact needs E / click / tap) rather than walk-into. */
export function isExamineOnly(world: World, actorId: string): boolean {
  const entity = findActor(world, actorId);
  return entity !== undefined && (world.get(entity, Examinable) !== undefined || world.get(entity, Trace) !== undefined || world.get(entity, SkillPickup) !== undefined);
}
