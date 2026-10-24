import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, isCellSolid, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { Flags, Position } from '../components.js';
import { buildGrayboxRoom } from '../rooms/graybox-room.js';
import { createRogueliteSession } from '../session.js';
import { CombatPlayer, CombatStats, SentinelAwakened, SentinelMelee } from './combat-components.js';
import { parseCombatData } from './combat-data.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const STEP = 1000 / 60;

function boot(room: string) {
  const engine = createEngine();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat);
  engine.loadScene(room);
  const playerId = () => [...engine.world.query([CombatPlayer] as const)][0][0];
  return {
    engine,
    step: (input: InputFrame = EMPTY_INPUT_FRAME) => engine.tick(STEP, input),
    steps(n: number, input?: InputFrame) {
      for (let i = 0; i < n; i++) this.step(input);
    },
    player: () => engine.world.get(playerId(), CombatPlayer) as CombatPlayer,
    pos: () => engine.world.get(playerId(), Position) as Position,
    stats: () => [...engine.world.query([CombatStats] as const)][0][1],
    flags: () => [...engine.world.query([Flags] as const)][0][1].values,
  };
}

const press = (...codes: string[]): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(codes), justPressed: new Set(codes), justReleased: new Set() } });
const hold = (...codes: string[]): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(codes), justPressed: new Set(), justReleased: new Set() } });

describe('buildGrayboxRoom', () => {
  it('makes walls solid, places the entry at the cell bottom-center, merges X cells into one exit zone, and lists spawns', () => {
    const room = buildGrayboxRoom('t', ['#XX#', '#Ea#', '####']);
    expect(isCellSolid(room.tiles.collision, 0, 0)).toBe(true);
    expect(isCellSolid(room.tiles.collision, 1, 0)).toBe(false);
    expect(room.entryPoints).toEqual([{ id: 'start', position: { x: 24, y: 30 } }]);
    expect(room.exitZone).toEqual({ x: 16, y: 0, width: 32, height: 16 });
    expect(room.spawns).toEqual({ a: [{ x: 40, y: 24 }] });
  });

  it('rejects ragged rows and a missing entry', () => {
    expect(() => buildGrayboxRoom('t', ['##', '#'])).toThrow(/same length/);
    expect(() => buildGrayboxRoom('t', ['..'])).toThrow(/no E/);
  });
});

describe('zone 4 — awakened sentinels (spec §8-1)', () => {
  it('a sentinel wakes when the player walks near, chases, and a touch restarts the zone with it asleep again', () => {
    const t = boot('zone-4');
    const sentinels = () => [...t.engine.world.query([SentinelAwakened] as const)].map(([, s]) => s);
    expect(sentinels().every((s) => s.state === 'asleep')).toBe(true);
    // Walk right along the corridor toward the first one.
    let woke = false;
    for (let i = 0; i < 300 && t.stats().hitsTaken === 0; i++) {
      t.step(hold('KeyD'));
      if (sentinels().some((s) => s.state === 'waking' || s.state === 'chase')) woke = true;
    }
    expect(woke).toBe(true);
    expect(t.stats().hitsTaken).toBe(1);
    t.steps(combat.act1Respawn.fadeOutF + combat.act1Respawn.fadeInF + 2);
    expect(sentinels().every((s) => s.state === 'asleep')).toBe(true);
    expect(t.player().action.kind).toBe('free');
  });

  it('dashing through the first sentinel in the corridor takes no hit', () => {
    const t = boot('zone-4');
    const first = [...t.engine.world.query([SentinelAwakened, Position] as const)].map(([, , p]) => p).sort((a, b) => a.x - b.x)[0];
    // Walk until it is awake and close ahead, then dash through it.
    for (let i = 0; i < 300; i++) {
      t.step(hold('KeyD'));
      const [, s, p] = [...t.engine.world.query([SentinelAwakened, Position] as const)].find(([, , q]) => q.x === first.x || Math.abs(q.y - first.y) < 1) ?? [];
      if (s && p && s.state === 'chase' && p.x - t.pos().x < 40) break;
    }
    const xBefore = t.pos().x;
    t.step(press('KeyD', 'Space'));
    t.steps(combat.playerForms.ember.dash.chargeF + combat.playerForms.ember.dash.travelF, hold('KeyD'));
    expect(t.stats().hitsTaken).toBe(0);
    expect(t.pos().x).toBeGreaterThan(xBefore + 40);
  });
});

describe('zone 6 — first parry (spec §9)', () => {
  function untilCue(t: ReturnType<typeof boot>) {
    for (let i = 0; i < 900; i++) {
      const [, s] = [...t.engine.world.query([SentinelMelee] as const)][0];
      if (s.state === 'windup' && s.framesLeft <= (s.cueF ?? 0)) return s;
      t.step();
    }
    throw new Error('no cue');
  }

  it('uses the easy windup, and one parry stops the sentinel for good and opens the exit', () => {
    const t = boot('zone-6');
    const [, sentinel] = [...t.engine.world.query([SentinelMelee] as const)][0];
    expect(sentinel).toMatchObject({ windupF: combat.zones.zone6.windupF, cueF: combat.zones.zone6.cueF, parriesToStop: 1 });
    expect(t.flags()['cleared']).toBeUndefined();
    const cue = untilCue(t);
    t.steps(cue.framesLeft - 4);
    t.step(press('ShiftLeft'));
    t.steps(12);
    expect([...t.engine.world.query([SentinelMelee] as const)][0][1].state).toBe('dormant');
    t.step();
    expect(t.flags()['cleared']).toBe(true);
  });

  it('from the third try the cue quietly grows by 2f per try, up to 18f', () => {
    const t = boot('zone-6');
    const cues: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt++) {
      cues.push([...t.engine.world.query([SentinelMelee] as const)][0][1].cueF ?? -1);
      const before = t.stats().hitsTaken;
      for (let i = 0; i < 900 && t.stats().hitsTaken === before; i++) t.step();
      t.steps(combat.act1Respawn.fadeOutF + combat.act1Respawn.fadeInF + 2);
    }
    expect(cues).toEqual([12, 12, 14, 16, 18, 18]);
  });
});

describe('zone 7 — two sentinels, two parries each', () => {
  it('starts them out of step and keeps the exit locked until both stop', () => {
    const t = boot('zone-7');
    const sentinels = [...t.engine.world.query([SentinelMelee] as const)].map(([, s]) => s);
    expect(sentinels.map((s) => s.parriesToStop)).toEqual([2, 2]);
    expect(sentinels.map((s) => s.framesLeft)).toEqual(combat.zones.zone7.startDelaysF);
    t.steps(10);
    expect(t.flags()['cleared']).toBeUndefined();
  });
});
