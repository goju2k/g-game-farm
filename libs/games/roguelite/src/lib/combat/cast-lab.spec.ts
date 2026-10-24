import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type InputFrame, type MouseButton, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { Animator, LightEmitter, Position } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { CombatPlayer, CombatStats, SentinelMelee, SpellBurst, SpellProjectile } from './combat-components.js';
import { parseCombatData } from './combat-data.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const STEP = 1000 / 60;

function boot() {
  const engine = createEngine();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat);
  engine.loadScene('cast-lab');
  const [[playerId]] = [...engine.world.query([CombatPlayer] as const)];
  const [[sentinelId]] = [...engine.world.query([SentinelMelee] as const)];
  const t = {
    engine,
    playerId,
    sentinelId,
    step: (input: InputFrame = EMPTY_INPUT_FRAME) => engine.tick(STEP, input),
    steps: (n: number, input?: InputFrame) => {
      for (let i = 0; i < n; i++) t.step(input);
    },
    player: () => engine.world.get(playerId, CombatPlayer) as CombatPlayer,
    setPlayer: (change: Partial<CombatPlayer>) => engine.world.set(playerId, CombatPlayer, { ...t.player(), ...change }),
    pos: () => engine.world.get(playerId, Position) as Position,
    sentinel: () => engine.world.get(sentinelId, SentinelMelee) as SentinelMelee,
    setSentinel: (change: Partial<SentinelMelee>) => engine.world.set(sentinelId, SentinelMelee, { ...t.sentinel(), ...change }),
    sentinelPos: () => engine.world.get(sentinelId, Position) as Position,
    stats: () => [...engine.world.query([CombatStats] as const)][0][1],
  };
  // Keep the sentinel out of the way unless a test puts it to work.
  t.setSentinel({ state: 'dormant' });
  return t;
}

function click(button: MouseButton, at: { x: number; y: number }): InputFrame {
  return { ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: at, buttons: { held: new Set([button]), justPressed: new Set([button]), justReleased: new Set() } } };
}

/** Places the sentinel just right of the player and makes its attack live this step. */
function strikeNow(t: ReturnType<typeof boot>) {
  t.engine.world.set(t.sentinelId, Position, { x: t.pos().x + 16, y: t.pos().y - 9 });
  t.setSentinel({ state: 'active', framesLeft: 6, attackSpent: false, dirX: -1, dirY: 0 });
}

describe('cast lab — child form setup', () => {
  it('spawns the child with 5 health, no embers, and the warm 55px hand flame', () => {
    const t = boot();
    expect(t.player()).toMatchObject({ form: 'child', hp: 5, embers: 0 });
    expect(t.engine.world.get(t.playerId, LightEmitter)?.radius).toBe(55);
  });
});

describe('embers (spec §4)', () => {
  it('a parry adds one ember, capped at 3', () => {
    const t = boot();
    for (let i = 0; i < 4; i++) {
      t.setPlayer({ action: { kind: 'parry', phase: 'active', framesLeft: 10 } });
      strikeNow(t);
      t.step();
      t.steps(7); // hit-stop
    }
    expect(t.player().embers).toBe(3);
  });
});

describe('cast spell "불기둥" (spec §5)', () => {
  it('without embers: rooted for 36f, the hand flame swells to 70px, then 5 damage at the aim', () => {
    const t = boot();
    t.setSentinel({ state: 'wait', framesLeft: 999 });
    const aim = { ...t.sentinelPos() };
    const start = { ...t.pos() };
    t.step(click('right', aim));
    expect(t.player().action).toMatchObject({ kind: 'casting', framesLeft: 36 });
    expect(t.engine.world.get(t.playerId, LightEmitter)?.radius).toBe(70);
    t.steps(35, { ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(['KeyD']), justPressed: new Set(), justReleased: new Set() } });
    expect(t.pos()).toEqual(start); // can't move while casting
    expect(t.sentinel().hp).toBe(8);
    t.step();
    expect(t.sentinel().hp).toBe(3);
    expect([...t.engine.world.query([SpellBurst] as const)]).toHaveLength(1);
    expect(t.player()).toMatchObject({ action: { kind: 'free' }, castCooldownF: 90 });
  });

  it('with an ember: spends it and goes off instantly', () => {
    const t = boot();
    t.setSentinel({ state: 'wait', framesLeft: 999 });
    t.setPlayer({ embers: 2 });
    t.step(click('right', t.sentinelPos()));
    expect(t.player()).toMatchObject({ embers: 1, action: { kind: 'free' } });
    expect(t.sentinel().hp).toBe(3);
    expect(t.stats()).toMatchObject({ castsStarted: 1, castsWithEmber: 1 });
  });

  it('pulls a far aim in to 96px', () => {
    const t = boot();
    t.step(click('right', { x: t.pos().x + 500, y: t.pos().y }));
    const action = t.player().action;
    expect(action.kind).toBe('casting');
    if (action.kind === 'casting') expect(action.aimX - t.pos().x).toBeCloseTo(96, 0);
  });

  it('a hit cancels the cast with no refund: -1 health, -1 ember, knockback, then 60f invulnerable', () => {
    const t = boot();
    t.setPlayer({ embers: 1 });
    t.setSentinel({ state: 'wait', framesLeft: 999 });
    // With an ember the cast would be instant, so start one the slow way first: no embers, then give one back mid-cast.
    t.setPlayer({ embers: 0 });
    t.step(click('right', { x: t.pos().x, y: t.pos().y - 40 }));
    t.setPlayer({ embers: 1 });
    const x = t.pos().x;
    strikeNow(t);
    t.step();
    expect(t.player()).toMatchObject({ hp: 4, embers: 0, action: { kind: 'free' }, invulnerableF: 60 });
    expect(t.pos().x).toBeLessThan(x); // knocked away from the sentinel on its right
    expect(t.stats()).toMatchObject({ hitsTaken: 1, castsCancelled: 1 });
    strikeNow(t);
    t.step();
    expect(t.player().hp).toBe(4); // invulnerable
  });

  it('at 0 health: back to the checkpoint with full health and no embers', () => {
    const t = boot();
    t.setPlayer({ hp: 1, embers: 2 });
    strikeNow(t);
    t.step();
    expect(t.player().action.kind).toBe('respawning');
    t.steps(combat.act1Respawn.fadeOutF + combat.act1Respawn.fadeInF + 2);
    expect(t.player()).toMatchObject({ hp: 5, embers: 0, action: { kind: 'free' } });
  });
});

describe('quick spell "불꽃탄" (spec §5)', () => {
  it('flies at 180px/s, deals 1 damage on the first sentinel it touches, 24f cooldown, castable while moving', () => {
    const t = boot();
    t.setSentinel({ state: 'wait', framesLeft: 999 });
    const target = t.sentinelPos();
    const fire: InputFrame = { ...click('left', target), keyboard: { held: new Set(['KeyD']), justPressed: new Set(), justReleased: new Set() } };
    t.step(fire);
    expect([...t.engine.world.query([SpellProjectile] as const)]).toHaveLength(1);
    expect(t.player()).toMatchObject({ quickCooldownF: 24, action: { kind: 'free' } });
    t.steps(60);
    expect(t.sentinel().hp).toBe(7);
    expect([...t.engine.world.query([SpellProjectile] as const)]).toHaveLength(0);
  });
});

describe('test-room sentinel', () => {
  it('is defeated at 0 health and comes back at its post with full health after 120f', () => {
    const t = boot();
    t.setSentinel({ state: 'wait', framesLeft: 999, hp: 5 });
    t.step(click('right', t.sentinelPos()));
    t.steps(36);
    expect(t.sentinel()).toMatchObject({ state: 'defeated', hp: 0 });
    t.steps(combat.castLab.sentinelReviveF);
    expect(t.sentinel()).toMatchObject({ state: 'wait', hp: 8 });
  });
});

describe('child dash (planning D-021: instant)', () => {
  it('starts travelling after 5f and the art jumps to the dash:travel frame then', () => {
    const t = boot();
    const press: InputFrame = { ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(['KeyD', 'Space']), justPressed: new Set(['Space']), justReleased: new Set<string>() } };
    const hold: InputFrame = { ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(['KeyD']), justPressed: new Set<string>(), justReleased: new Set<string>() } };
    t.step(press);
    expect(t.player().action).toMatchObject({ kind: 'dash', phase: 'charge', framesLeft: 5 });
    t.steps(5, hold);
    expect(t.player().action).toMatchObject({ phase: 'travel' });
    const animator = t.engine.world.get(t.playerId, Animator);
    const travelFrame = childAsset.clips['dash'].frames.findIndex((f) => f.tags?.includes('dash:travel'));
    expect(animator).toMatchObject({ current: 'dash', state: { frameIndex: travelFrame } });
  });
});
