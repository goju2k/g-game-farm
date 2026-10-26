import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type EntityId, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import { ROGUELITE_ANIM_ASSETS, type RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { CombatPlayer, SentinelMelee, SpellBurst, SpellProjectile } from '../combat/combat-components.js';
import { parseCombatData } from '../combat/combat-data.js';
import { Animator, LightEmitter, Position, SpriteRender } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { Fx, HitFlash } from './fx-components.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const assets: Record<string, LoadedAnimAsset> = Object.fromEntries(
  Object.entries(ROGUELITE_ANIM_ASSETS).map(([id, folder], i) => {
    const asset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, folder, `${id}.anim.json`), 'utf8')), id);
    const texture = (100 + i) as TextureHandle;
    return [id, { asset, texture, clips: clipsFromAnimAsset(asset, texture) }];
  }),
);
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const STEP = 1000 / 60;

function boot(room: string) {
  const engine = createEngine();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, assets, combat);
  engine.loadScene(room);
  const sentinelId = () => [...engine.world.query([SentinelMelee] as const)][0][0];
  return {
    engine,
    step: (input: InputFrame = EMPTY_INPUT_FRAME) => engine.tick(STEP, input),
    run(ms: number) {
      for (let t = 0; t < ms; t += STEP) this.step();
    },
    sentinelId,
    clipOf: (id: EntityId) => (engine.world.get(id, Animator) as Animator).current,
    fxCount: () => [...engine.world.query([Fx] as const)].length,
  };
}

describe('sentinel art follows the AI', () => {
  it('spawns with its sprite and walks through approach -> windup -> attack -> recover clips', () => {
    const t = boot('arena');
    const id = t.sentinelId();
    expect(t.engine.world.get(id, SpriteRender)?.texture).toBe(assets['sentinel-melee'].texture);
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 8; i++) {
      t.step();
      seen.add(t.clipOf(id));
    }
    expect([...seen]).toEqual(expect.arrayContaining(['idle', 'approach', 'windup', 'attack', 'recover']));
  });

  it('Zone 6 uses the slow windup; stopping it plays shutdown and bursts the seal shards', () => {
    const t = boot('zone-6');
    const id = t.sentinelId();
    for (let i = 0; i < 900 && (t.engine.world.get(id, SentinelMelee) as SentinelMelee).state !== 'windup'; i++) t.step();
    t.step();
    expect(t.clipOf(id)).toBe('windup-easy');
    const sentinel = t.engine.world.get(id, SentinelMelee) as SentinelMelee;
    t.engine.world.set(id, SentinelMelee, { ...sentinel, state: 'dormant', framesLeft: 0 });
    t.step();
    expect(t.clipOf(id)).toBe('shutdown');
    expect(t.fxCount()).toBe(1); // the shards
    t.run(1000);
    expect(t.fxCount()).toBe(0); // played out and removed itself
  });
});

describe('spell art', () => {
  it('the fireball flies rotated along its path, flashes and sparks on the hit, and plays its impact', () => {
    const t = boot('cast-lab');
    const id = t.sentinelId();
    t.engine.world.set(id, SentinelMelee, { ...(t.engine.world.get(id, SentinelMelee) as SentinelMelee), state: 'wait', framesLeft: 999 });
    const target = t.engine.world.get(id, Position) as Position;
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: target, buttons: { held: new Set(['left']), justPressed: new Set(['left']), justReleased: new Set() } } });
    t.step();
    t.step();
    const [[projectileId]] = [...t.engine.world.query([SpellProjectile] as const)];
    const sprite = t.engine.world.get(projectileId, SpriteRender) as SpriteRender;
    expect(sprite.texture).toBe(assets['fx-fireball'].texture);
    expect(sprite.rotation).toBeLessThan(-1); // flying up the screen
    let flashed = false;
    for (let i = 0; i < 60 && [...t.engine.world.query([SpellProjectile] as const)].length > 0; i++) {
      t.step();
      if (t.engine.world.get(id, HitFlash)) flashed = true;
    }
    expect(flashed).toBe(true);
    const clips = [...t.engine.world.query([Fx, Animator] as const)].map(([, , a]) => a.current);
    expect(clips).toEqual(expect.arrayContaining(['impact', 'hit']));
  });

  it('the big pillar (combo finisher R) raises its art: rise -> burn -> fade, then smoulders while its target burns; a warm light lives and dies with it (D-043)', () => {
    const t = boot('cast-lab');
    const [[playerId]] = [...t.engine.world.query([CombatPlayer] as const)];
    const at = t.engine.world.get(playerId, Position) as Position;
    t.engine.world.set(playerId, CombatPlayer, { ...(t.engine.world.get(playerId, CombatPlayer) as CombatPlayer), embers: 1, combo: { presses: ['L'], windowLeftF: 24, nextCastInstant: false } });
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: { x: at.x, y: at.y - 40 }, buttons: { held: new Set(['right']), justPressed: new Set(['right']), justReleased: new Set() } } });
    expect([...t.engine.world.query([SpellBurst] as const)]).toHaveLength(0);
    const clips: string[] = [];
    const light: Record<string, number> = {};
    for (let i = 0; i < 180; i++) {
      t.step();
      for (const [id, fx, a] of t.engine.world.query([Fx, Animator] as const)) {
        if (fx.steps[0].clip !== 'rise') continue;
        if (clips[clips.length - 1] !== a.current) clips.push(a.current);
        light[a.current] = t.engine.world.get(id, LightEmitter)?.radius ?? -1;
      }
    }
    expect(clips).toEqual(['rise', 'burn', 'fade', 'smolder']);
    expect(light['burn']).toBe(64); // full through the flames (combat.json pillarArt.big)
    expect(light['smolder']).toBeLessThan(light['fade']); // dying down with the fire
    t.run(3000);
    expect(t.fxCount()).toBe(0);
  });

  it('combo art: a lone R bursts the quick pillar; an L L fan flashes at the hand and its shots burst in the fan blast', () => {
    const t = boot('cast-lab');
    const [[playerId]] = [...t.engine.world.query([CombatPlayer] as const)];
    const at = t.engine.world.get(playerId, Position) as Position;
    const fxClips = () => [...t.engine.world.query([Fx, Animator] as const)].map(([, , a]) => a.current);
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: { x: at.x, y: at.y - 40 }, buttons: { held: new Set(['right']), justPressed: new Set(['right']), justReleased: new Set() } } });
    for (let i = 0; i < 18; i++) t.step();
    expect(fxClips()).toContain('burst');
    t.engine.world.set(playerId, CombatPlayer, { ...(t.engine.world.get(playerId, CombatPlayer) as CombatPlayer), combo: { presses: ['L'], windowLeftF: 24, nextCastInstant: false }, quickCooldownF: 0 });
    const aim = { x: at.x + 40, y: at.y - 9 };
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: aim, buttons: { held: new Set(), justPressed: new Set(['left']), justReleased: new Set() } } });
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: aim } });
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: aim } });
    expect(fxClips()).toEqual(expect.arrayContaining(['muzzle', 'ring'])); // the fan's flash + focus ring
    expect([...t.engine.world.query([SpellProjectile] as const)].filter(([, p]) => p.fanBlast)).toHaveLength(3);
  });

  it('the child plays its fire clip on a shot, then floats again', () => {
    const t = boot('cast-lab');
    const [[playerId]] = [...t.engine.world.query([CombatPlayer] as const)];
    const at = t.engine.world.get(playerId, Position) as Position;
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: { x: at.x + 50, y: at.y }, buttons: { held: new Set(['left']), justPressed: new Set(['left']), justReleased: new Set() } } });
    expect(t.clipOf(playerId)).toBe('fire');
    t.run(200);
    expect(t.clipOf(playerId)).toBe('float');
  });
});
