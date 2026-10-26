import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type EntityId, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite, ROGUELITE_ROOM_IDS } from '../bootstrap.js';
import { CombatPlayer, SentinelMelee, SpellProjectile } from '../combat/combat-components.js';
import { parseCombatData } from '../combat/combat-data.js';
import { Flags, Position, RoomTileLayout } from '../components.js';
import { createDialogueController } from '../events/dialogue-controller.js';
import { createGameEventRegistry, findActor } from '../events/event-commands.js';
import { Vine } from '../events/event-components.js';
import { parseEventScripts } from '../events/event-director.js';
import { createRecordController } from '../records/record-controller.js';
import { DEMO_ACTORS, DEMO_FLAGS, DEMO_ROOMS } from '../rooms/demo-rooms.js';
import { createRogueliteSession } from '../session.js';
import { Brazier, BrazierPedestal, CrackedWall, RoomLock, SealDoor } from './world-components.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const STEP = 1000 / 60;

function boot(room: string, scripts: unknown = { rooms: {} }) {
  const engine = createEngine();
  const registry = createGameEventRegistry();
  const session = createRogueliteSession();
  const records = createRecordController();
  records.setRecords({ 'rec-scar': { text: '그것이 깨어나면 먼저 작아진다.', readable: false } });
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, session, () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat, {
    scripts: parseEventScripts(scripts, registry, 'test.json'),
    registry,
    dialogue: createDialogueController(),
    records,
  });
  engine.loadScene(room);
  const t = {
    engine,
    session,
    records,
    step: (input: InputFrame = EMPTY_INPUT_FRAME) => engine.tick(STEP, input),
    steps: (n: number, input?: InputFrame) => {
      for (let i = 0; i < n; i++) t.step(input);
    },
    player: () => engine.world.get(findActor(engine.world, 'player') as EntityId, CombatPlayer) as CombatPlayer,
    pos: () => engine.world.get(findActor(engine.world, 'player') as EntityId, Position) as Position,
    teleport: (at: { x: number; y: number }) => engine.world.set(findActor(engine.world, 'player') as EntityId, Position, at),
    solid: (column: number, row: number) => {
      const [[, layout]] = [...engine.world.query([RoomTileLayout] as const)];
      return layout.collision.cells[row * layout.collision.columns + column] !== 0;
    },
    one: <T,>(type: Parameters<typeof engine.world.query>[0][0]) => [...engine.world.query([type] as const)][0] as unknown as [EntityId, T],
  };
  return t;
}

const key = (code: string): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set([code]), justPressed: new Set([code]), justReleased: new Set() } });
const click = (button: 'left' | 'right', at: { x: number; y: number }, held = false): InputFrame => ({
  ...EMPTY_INPUT_FRAME,
  mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: at, buttons: { held: new Set(held ? [button] : []), justPressed: new Set([button]), justReleased: new Set() } },
});

describe('demo floor map (31 §1-2)', () => {
  it('every exit leads to a real room and one of its entry points', () => {
    for (const room of DEMO_ROOMS) {
      for (const exit of room.exits) {
        expect(ROGUELITE_ROOM_IDS, `${room.id} -> ${exit.targetRoomId}`).toContain(exit.targetRoomId);
        const target = DEMO_ROOMS.find((r) => r.id === exit.targetRoomId);
        if (target) expect(target.entryPoints.map((e) => e.id), `${room.id} -> ${exit.targetRoomId}:${exit.targetEntryId}`).toContain(exit.targetEntryId);
      }
    }
  });

  it('every room loads', () => {
    for (const room of DEMO_ROOMS) {
      const t = boot(room.id);
      t.steps(2);
      expect(t.engine.getActiveSceneName()).toBe(room.id);
    }
  });

  it('checkpoints only where the design puts them', () => {
    const saves = DEMO_ROOMS.filter((r) => r.checkpoint !== false).map((r) => r.id);
    expect(saves).toEqual(['hub', 'shrine', 'room-3', 'ante']);
  });
});

describe('examine (31 §0)', () => {
  it('near a trace: E opens its record and fires its interact events; the record holds the event until closed', () => {
    const t = boot('scar', { rooms: { scar: [{ id: 'look', trigger: { type: 'interact', target: DEMO_ACTORS.scar }, do: [{ cmd: 'setFlag', flag: 'looked' }] }] } });
    t.step();
    const trace = t.engine.world.get(findActor(t.engine.world, DEMO_ACTORS.scar) as EntityId, Position) as Position;
    t.step(key('KeyE'));
    expect(t.records.view.getSnapshot().open).toBeUndefined(); // too far
    t.teleport({ x: trace.x, y: trace.y + 20 });
    t.step();
    t.step(key('KeyE'));
    expect(t.records.view.getSnapshot().open).toMatchObject({ id: 'rec-scar', readable: false });
    t.step();
    expect([...t.engine.world.query([Flags] as const)][0][1].values['looked']).toBe(true);
  });

  it('a click on the trace examines it instead of firing a quick shot', () => {
    const t = boot('mural');
    t.step();
    const trace = t.engine.world.get(findActor(t.engine.world, DEMO_ACTORS.mural) as EntityId, Position) as Position;
    t.teleport({ x: trace.x, y: trace.y + 20 });
    t.step();
    t.step(click('left', { x: trace.x, y: trace.y - 6 }, true));
    t.steps(3, { ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: trace, buttons: { held: new Set(['left']), justPressed: new Set(), justReleased: new Set() } } });
    expect([...t.engine.world.query([SpellProjectile] as const)]).toHaveLength(0);
  });
});

describe('braziers, pedestals, the seal door (31 §2)', () => {
  it('a quick shot lights the brazier and sets its progress flag', () => {
    const t = boot('brazier-w');
    t.step();
    const [, brazier] = t.one<Brazier>(Brazier);
    expect(brazier.lit).toBe(false);
    const [[id]] = [...t.engine.world.query([Brazier] as const)];
    const at = t.engine.world.get(id, Position) as Position;
    t.teleport({ x: at.x + 32, y: at.y }); // inside the room, right of it
    t.step(click('left', { x: at.x, y: at.y - 6 }));
    t.steps(30);
    expect(t.engine.world.get(id, Brazier)?.lit).toBe(true);
    expect(t.session.flags.has(DEMO_FLAGS.brazierWest)).toBe(true);
  });

  it('the hub: pedestals light with their braziers, and the seal door opens when both are lit', () => {
    const t = boot('hub');
    t.step();
    const [doorId, door] = t.one<SealDoor>(SealDoor);
    const cell = door.cells[0];
    expect(t.solid(cell.column, cell.row)).toBe(true);
    t.session.flags.add(DEMO_FLAGS.brazierWest);
    t.step();
    expect([...t.engine.world.query([BrazierPedestal] as const)].map(([, p]) => p.lit)).toEqual([true, false]);
    expect(t.engine.world.get(doorId, SealDoor)?.open).toBe(false);
    t.session.flags.add(DEMO_FLAGS.brazierNorth);
    t.step();
    expect(t.engine.world.get(doorId, SealDoor)?.open).toBe(true);
    expect(t.solid(cell.column, cell.row)).toBe(false);
  });

  it('the vine door needs three hits', () => {
    const t = boot('hub');
    t.step();
    const [vineId, vine] = t.one<Vine>(Vine);
    const shoot = () => {
      const shot = t.engine.world.createEntity();
      t.engine.world.set(shot, Position, { x: vine.box.x + 8, y: vine.box.y + vine.box.height + 1 });
      t.engine.world.set(shot, SpellProjectile, { vx: 0, vy: 0, remainingPx: 10, damage: 1, size: 4 });
      t.step();
    };
    shoot();
    shoot();
    expect(t.engine.world.get(vineId, Vine)?.hitsLeft).toBe(1); // singed twice, still standing
    shoot();
    expect(t.engine.world.get(vineId, Vine)).toBeUndefined(); // burnt (headless: no burn art to wait for)
    expect(t.session.flags.has(DEMO_FLAGS.vineHub)).toBe(true);
  });
});

describe('the pillar is found at the shrine (31 §2)', () => {
  it('before the shrine R does nothing; examining the pedestal unlocks it', () => {
    const t = boot('shrine');
    t.step();
    expect(t.player().canCast).toBe(false);
    t.step(click('right', { x: t.pos().x, y: t.pos().y - 30 }));
    expect(t.player().action.kind).not.toBe('casting');
    const pedestal = t.engine.world.get(findActor(t.engine.world, DEMO_ACTORS.pedestal) as EntityId, Position) as Position;
    t.teleport({ x: pedestal.x, y: pedestal.y + 20 });
    t.step();
    t.step(key('KeyE'));
    expect(t.session.skills.has('pillar')).toBe(true);
    expect(t.player().canCast).toBe(true);
    t.steps(10);
    t.step(click('right', { x: t.pos().x, y: t.pos().y + 30 }));
    expect(t.player().action.kind).toBe('casting');
  });
});

describe('room-3: the arena and the cracked wall (31 §2)', () => {
  it('only the big pillar (finisher R) breaks the cracked wall, and it stays broken', () => {
    const t = boot('room-3');
    t.session.skills.add('pillar');
    t.step();
    const [wallId, wall] = t.one<CrackedWall>(CrackedWall);
    const target = { x: wall.box.x + wall.box.width / 2, y: wall.box.y - 8 };
    t.teleport({ x: target.x, y: target.y - 40 });
    t.engine.world.set(findActor(t.engine.world, 'player') as EntityId, CombatPlayer, { ...t.player(), canCast: true });
    t.step(click('right', target)); // a lone R: the quick pillar
    t.steps(20);
    expect(t.engine.world.get(wallId, CrackedWall)?.broken).toBe(false);
    t.engine.world.set(findActor(t.engine.world, 'player') as EntityId, CombatPlayer, { ...t.player(), combo: { presses: ['R'], windowLeftF: 24, nextCastInstant: false }, embers: 1 });
    t.step(click('right', target)); // R R: the big pillar (an ember: at once)
    t.step();
    expect(t.engine.world.get(wallId, CrackedWall)?.broken).toBe(true);
    expect(t.session.flags.has(DEMO_FLAGS.crack)).toBe(true);
  });

  it('lockRoom holds the exits shut; beating the melee sentinels sets "cleared"', () => {
    const t = boot('room-3', { rooms: { 'room-3': [{ id: 'arena', trigger: { type: 'roomStart' }, do: [{ cmd: 'lockRoom' }] }] } });
    t.step();
    expect(t.one<RoomLock>(RoomLock)[1].locked).toBe(true);
    // Walk into the way back west: nothing happens while locked.
    t.teleport({ x: 8, y: 5 * 16 + 14 });
    t.steps(3);
    expect(t.engine.getActiveSceneName()).toBe('room-3');
    for (const [id, sentinel] of t.engine.world.query([SentinelMelee] as const)) t.engine.world.set(id, SentinelMelee, { ...sentinel, hp: 0, state: 'defeated' });
    t.step();
    expect([...t.engine.world.query([Flags] as const)][0][1].values['cleared']).toBe(true);
  });
});
