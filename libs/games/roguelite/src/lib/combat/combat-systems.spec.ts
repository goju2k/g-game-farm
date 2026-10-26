import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { Position } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { CombatPlayer, CombatStats, ScreenFade, SentinelMelee } from './combat-components.js';
import { parseCombatData } from './combat-data.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;

/** One engine step per tick(STEP) = exactly 1 spec frame. */
const STEP = 1000 / 60;

function bootArena() {
  const engine = createEngine();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat);
  engine.loadScene('arena');
  const [[playerId]] = [...engine.world.query([CombatPlayer] as const)];
  const [[sentinelId]] = [...engine.world.query([SentinelMelee] as const)];
  const step = (input: InputFrame = EMPTY_INPUT_FRAME) => engine.tick(STEP, input);
  const steps = (n: number, input?: InputFrame) => {
    for (let i = 0; i < n; i++) step(input);
  };
  const player = () => engine.world.get(playerId, CombatPlayer) as CombatPlayer;
  const pos = () => engine.world.get(playerId, Position) as Position;
  const sentinel = () => engine.world.get(sentinelId, SentinelMelee) as SentinelMelee;
  const stats = () => [...engine.world.query([CombatStats] as const)][0][1];
  return { engine, playerId, sentinelId, step, steps, player, pos, sentinel, stats };
}

function press(...codes: string[]): InputFrame {
  return { ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(codes), justPressed: new Set(codes), justReleased: new Set() } };
}
function hold(...codes: string[]): InputFrame {
  return { ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(codes), justPressed: new Set(), justReleased: new Set() } };
}

describe('combat: ember dash (spec §2)', () => {
  it('waits 5f, travels the dash distance (D-035: 56px) over 10f, recovers 6f, then 18f cooldown', () => {
    const t = bootArena();
    t.steps(2);
    const startX = t.pos().x;
    t.step(press('KeyA', 'Space')); // dash left; press step = first charge frame
    expect(t.player().action).toMatchObject({ kind: 'dash', phase: 'charge', framesLeft: 5 });
    t.steps(4, hold('KeyA'));
    expect(t.pos().x).toBe(startX); // charge: no movement
    t.step(hold('KeyA'));
    expect(t.player().action).toMatchObject({ phase: 'travel', framesLeft: 10 });
    t.steps(10, hold('KeyA'));
    expect(t.pos().x).toBeCloseTo(startX - combat.playerForms.ember.dash.distance, 5);
    expect(t.player().action).toMatchObject({ phase: 'recover', framesLeft: 6 });
    t.steps(6);
    expect(t.player().action.kind).toBe('free');
    expect(t.player().dashCooldownF).toBe(18);
    t.step(press('Space'));
    expect(t.player().action.kind).toBe('free'); // still cooling down — the press is buffered
    expect(t.player().buffer).toMatchObject({ action: 'dash' });
  });

  it('runs a buffered dash the moment cooldown allows (6f buffer)', () => {
    const t = bootArena();
    t.steps(2);
    t.step(press('Space'));
    t.steps(4 + 1 + 10 + 6 + 12); // through recover and most of the cooldown
    t.step(press('Space')); // cooldown has 5f left, within the 6f buffer
    t.steps(5);
    expect(t.player().action).toMatchObject({ kind: 'dash', phase: 'charge' });
  });
});

describe('combat: parry vs melee sentinel (spec §3, §8-2)', () => {
  /** Lets the sentinel walk up and start a windup, then returns how many frames until its active window. */
  function untilWindup(t: ReturnType<typeof bootArena>) {
    for (let i = 0; i < 600 && t.sentinel().state !== 'windup'; i++) t.step();
    expect(t.sentinel().state).toBe('windup');
    return t.sentinel().framesLeft;
  }

  it('a parry whose 10f window covers the attack succeeds: stun 60f, hit-stop 6f, player free, counted', () => {
    const t = bootArena();
    const toActive = untilWindup(t);
    // Press so the window (startup 2f, then 10f) opens 2f before the attack's 6 active frames.
    t.steps(toActive - 4);
    t.step(press('ShiftLeft'));
    for (let i = 0; i < 12 && t.sentinel().state !== 'stunned'; i++) t.step();
    expect(t.sentinel()).toMatchObject({ state: 'stunned', parriesTaken: 1 });
    expect(t.player().action.kind).toBe('free');
    expect(t.stats()).toMatchObject({ parryAttempts: 1, parrySuccesses: 1, hitsTaken: 0 });
    // Hit-stop: the sentinel's stun timer doesn't move for 6 steps.
    const stun = t.sentinel().framesLeft;
    t.steps(6);
    expect(t.sentinel().framesLeft).toBe(stun);
    t.step();
    expect(t.sentinel().framesLeft).toBe(stun - 1);
  });

  it('an unparried attack hits: Act 1 soft restart fades out, returns to the entrance, fades back in', () => {
    const t = bootArena();
    const entrance = { ...t.pos() };
    const toActive = untilWindup(t);
    t.steps(toActive + 1);
    expect(t.stats().hitsTaken).toBe(1);
    expect(t.player().action.kind).toBe('respawning');
    expect([...t.engine.world.query([ScreenFade] as const)][0][1]).toMatchObject({ phase: 'out' });
    t.steps(combat.act1Respawn.fadeOutF + combat.act1Respawn.fadeInF + 2);
    expect(t.player().action.kind).toBe('free');
    expect(t.pos()).toEqual(entrance);
    expect([...t.engine.world.query([ScreenFade] as const)]).toHaveLength(0);
  });

  it('dash travel passes through the attack (invulnerable)', () => {
    const t = bootArena();
    const toActive = untilWindup(t);
    // Charge 5f, then the 10f travel must cover the 6 active frames.
    t.steps(toActive - 6);
    t.step(press('Space', 'KeyD'));
    t.steps(12, hold('KeyD'));
    expect(t.stats().hitsTaken).toBe(0);
  });
});
