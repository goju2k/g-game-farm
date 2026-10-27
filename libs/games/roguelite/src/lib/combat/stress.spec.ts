import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { Position } from '../components.js';
import { STRESS_ROOM_COUNT } from '../rooms/part0-zones.js';
import { createRogueliteSession } from '../session.js';
import { CombatPlayer, SentinelAwakened, SentinelMelee } from './combat-components.js';
import { parseCombatData } from './combat-data.js';
import { spawnSentinelMelee } from './spawn-combat-player.js';

/**
 * The stress room (D-044: sweeping crowds): the room boots with its crowd,
 * and — with STRESS=1 — a timing table of whole engine ticks (simulation +
 * render systems against the null renderer) at 25 / 50 / 100 sentinels,
 * the player firing into the middle of them.
 */
const publicDir = resolve(__dirname, '../../../public/game');
const load = (path: string) => JSON.parse(readFileSync(resolve(publicDir, path), 'utf8'));
const combat = parseCombatData(load('data/combat.json'), 'combat.json');
const anim = (id: string, folder: string, texture: number): LoadedAnimAsset => {
  const asset = parseAnimAsset(load(`${folder}/${id}/${id}.anim.json`), id);
  return { asset, texture: texture as TextureHandle, clips: clipsFromAnimAsset(asset, texture as TextureHandle) };
};
const animAssets = {
  'player-child': anim('player-child', 'characters', 50),
  'sentinel-melee': anim('sentinel-melee', 'characters', 51),
  'sentinel-awakened': anim('sentinel-awakened', 'characters', 52),
  'fx-fireball': anim('fx-fireball', 'fx', 53),
  'fx-hit': anim('fx-hit', 'fx', 54),
};
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const STEP = 1000 / 60;

function boot() {
  const engine = createEngine();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), Math.random, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, animAssets, combat);
  engine.loadScene('stress');
  return engine;
}

const enemies = (engine: ReturnType<typeof boot>) => [...engine.world.query([SentinelMelee] as const)].length + [...engine.world.query([SentinelAwakened] as const)].length;

/** Trims or grows the crowd to `n` (extra melee sentinels on spare floor). */
function crowdOf(engine: ReturnType<typeof boot>, n: number): void {
  const ids = [...[...engine.world.query([SentinelMelee] as const)].map(([id]) => id), ...[...engine.world.query([SentinelAwakened] as const)].map(([id]) => id)];
  ids.slice(n).forEach((id) => engine.world.destroyEntity(id));
  for (let i = ids.length; i < n; i++) spawnSentinelMelee(engine.world, { x: 40 + (i % 20) * 32, y: 300 + Math.floor(i / 20) * 24 }, { hp: combat.enemies['sentinel-melee'].hp, reviveF: combat.castLab.sentinelReviveF });
}

describe('stress room (D-044)', () => {
  it('boots with its whole crowd, the child among them', () => {
    const engine = boot();
    expect(enemies(engine)).toBe(STRESS_ROOM_COUNT);
    expect([...engine.world.query([CombatPlayer] as const)]).toHaveLength(1);
    for (let i = 0; i < 120; i++) engine.tick(STEP, EMPTY_INPUT_FRAME);
  });

  it.skipIf(!process.env['STRESS'])('frame time with 25 / 50 / 100 sentinels (STRESS=1)', () => {
    const rows: string[] = [];
    for (const n of [25, 50, 100]) {
      const engine = boot();
      crowdOf(engine, n);
      const [[playerId]] = [...engine.world.query([CombatPlayer] as const)];
      const center = { x: 22 * 16, y: 8 * 16 };
      engine.world.set(playerId, Position, { x: center.x, y: center.y + 60 });
      // Hold fire (left) at the crowd's middle, strafing left and right.
      const frame = (i: number): InputFrame => ({
        ...EMPTY_INPUT_FRAME,
        keyboard: { held: new Set([Math.floor(i / 90) % 2 ? 'KeyA' : 'KeyD']), justPressed: new Set(), justReleased: new Set() },
        mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: center, buttons: { held: new Set(['left']), justPressed: new Set(i % 30 === 0 ? ['left'] : []), justReleased: new Set() } },
      });
      for (let i = 0; i < 120; i++) engine.tick(STEP, frame(i)); // warm up (JIT)
      const times: number[] = [];
      for (let i = 0; i < 600; i++) {
        const t0 = performance.now();
        engine.tick(STEP, frame(i));
        times.push(performance.now() - t0);
      }
      const states: Record<string, number> = {};
      for (const [, m] of engine.world.query([SentinelMelee] as const)) states['m:' + m.state] = (states['m:' + m.state] ?? 0) + 1;
      for (const [, a] of engine.world.query([SentinelAwakened] as const)) states['a:' + a.state] = (states['a:' + a.state] ?? 0) + 1;
      rows.push(`     states after the run: ${JSON.stringify(states)}`);
      times.sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      rows.push(`${String(n).padStart(4)} enemies | avg ${avg.toFixed(3)} ms | p95 ${times[Math.floor(times.length * 0.95)].toFixed(3)} ms | max ${times[times.length - 1].toFixed(3)} ms`);
    }
    console.log(`\nstress room — one engine tick (sim + render systems, null renderer), 600 ticks after warm-up:\n${rows.join('\n')}`);
  });
});
