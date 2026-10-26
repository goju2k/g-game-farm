import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type InputFrame, type MouseButton, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { Position } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { Burning, CombatPlayer, SentinelMelee, SpellProjectile } from './combat-components.js';
import { parseCombatData } from './combat-data.js';

/** Skill combos in play (27_skill-combo-v1 §3, D-031) — the child's Lv2 fire set, in the cast lab. */

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
    step: (input: InputFrame = EMPTY_INPUT_FRAME) => engine.tick(STEP, input),
    steps: (n: number, input?: InputFrame) => {
      for (let i = 0; i < n; i++) t.step(input);
    },
    player: () => engine.world.get(playerId, CombatPlayer) as CombatPlayer,
    setPlayer: (change: Partial<CombatPlayer>) => engine.world.set(playerId, CombatPlayer, { ...t.player(), ...change }),
    pos: () => engine.world.get(playerId, Position) as Position,
    sentinel: () => engine.world.get(sentinelId, SentinelMelee) as SentinelMelee,
    sentinelId,
    sentinelPos: () => engine.world.get(sentinelId, Position) as Position,
    shots: () => [...engine.world.query([SpellProjectile] as const)].map(([, s]) => s),
  };
  engine.world.set(sentinelId, SentinelMelee, { ...t.sentinel(), state: 'wait', framesLeft: 9999 });
  return t;
}

const press = (button: MouseButton, at: { x: number; y: number }, held = true): InputFrame => ({
  ...EMPTY_INPUT_FRAME,
  mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: at, buttons: { held: new Set(held ? [button] : []), justPressed: new Set([button]), justReleased: new Set() } },
});
const key = (code: string): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set([code]), justPressed: new Set([code]), justReleased: new Set() } });
const aimAt = (at: { x: number; y: number }): InputFrame => ({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: at } });

describe('skill combo — child Lv2, fire', () => {
  it('a lone R is the quick pillar: 18f cast, radius 12, 3 damage — and the combo waits for its finisher', () => {
    const t = boot();
    t.step(press('right', t.sentinelPos(), false));
    expect(t.player().action).toMatchObject({ kind: 'casting', framesLeft: 18, pillar: { radius: 12, damage: 3 } });
    t.steps(18);
    expect(t.sentinel().hp).toBe(5);
    expect(t.player()).toMatchObject({ action: { kind: 'free' }, castCooldownF: 0, combo: { presses: ['R'] } });
  });

  it('L then L: the second shot is the focused fan — 3 shots of 1.5', () => {
    const t = boot();
    const aim = { x: t.pos().x + 60, y: t.pos().y };
    t.step(press('left', aim, false));
    t.steps(2, aimAt(aim));
    expect(t.shots()).toHaveLength(1);
    t.steps(combat.spells.quick.cooldownF + combat.combo.windowF - 4, aimAt(aim)); // late in the window, still in time
    t.step(press('left', aim, false));
    t.steps(2, aimAt(aim));
    const fan = t.shots().filter((s) => s.damage === 1.5);
    expect(fan).toHaveLength(3);
    expect(t.player().comboFlash?.bonus).toBe('focus');
    expect(t.player().combo?.presses).toEqual([]);
  });

  it('holding L is L, fan, L, fan…', () => {
    const t = boot();
    const aim = { x: t.pos().x + 60, y: t.pos().y - 40 };
    const counts: number[] = [];
    let before = 0;
    t.step(press('left', aim));
    for (let i = 0; i < combat.spells.quick.cooldownF * 4; i++) {
      t.step({ ...aimAt(aim), mouse: { ...aimAt(aim).mouse, buttons: { held: new Set(['left']), justPressed: new Set(), justReleased: new Set() } } });
      const now = t.engine.world.query([SpellProjectile] as const);
      const n = [...now].length;
      if (n > before) counts.push(n - before);
      before = n;
    }
    expect(counts.slice(0, 4)).toEqual([1, 3, 1, 3]);
  });

  it('R then L: the fan, then the switch dash slips 24px away with no dash cooldown', () => {
    const t = boot();
    t.step(press('right', { x: t.pos().x, y: t.pos().y - 30 }, false));
    t.steps(18);
    const aim = { x: t.pos().x + 60, y: t.pos().y };
    const x = t.pos().x;
    t.step(press('left', aim, false));
    t.steps(2, aimAt(aim));
    expect(t.player().action).toMatchObject({ kind: 'dash', phase: 'travel', auto: {} });
    t.steps(combat.combo.switchDash.travelF + 1, aimAt(aim));
    expect(x - t.pos().x).toBeCloseTo(24, 0); // back, away from the aim
    expect(t.player()).toMatchObject({ action: { kind: 'free' }, dashCooldownF: 0 });
  });

  it('R then R: the focused big pillar sets the target burning', () => {
    const t = boot();
    t.engine.world.set(t.sentinelId, SentinelMelee, { ...t.sentinel(), hp: 30 });
    t.step(press('right', t.sentinelPos(), false));
    t.steps(18);
    t.step(press('right', t.sentinelPos(), false));
    t.steps(36);
    expect(t.sentinel().hp).toBe(30 - 3 - 10.5);
    expect(t.engine.world.get(t.sentinelId, Burning)).toBeDefined();
    t.steps(combat.combo.finishPillar.burn.intervalF * combat.combo.finishPillar.burn.ticks);
    expect(t.sentinel().hp).toBe(30 - 3 - 10.5 - 3);
    expect(t.engine.world.get(t.sentinelId, Burning)).toBeUndefined();
  });

  it('the window: 0.4s after the move ends — a dash pauses it, waiting too long starts over', () => {
    const t = boot();
    t.step(press('right', { x: t.pos().x, y: t.pos().y - 30 }, false));
    t.steps(18);
    t.step(key('Space')); // dash
    t.steps(30);
    expect(t.player().combo?.presses).toEqual(['R']); // still holding after the dash
    t.steps(combat.combo.windowF);
    expect(t.player().combo?.presses).toEqual([]);
  });

  it('a parry success keeps the combo and makes the next cast instant; a missed parry breaks it', () => {
    const t = boot();
    t.setPlayer({ combo: { presses: ['L'], windowLeftF: 24, nextCastInstant: false } });
    // Parry a live attack.
    t.step(key('ShiftLeft'));
    t.steps(combat.parry.startupF);
    t.engine.world.set(t.sentinelId, Position, { x: t.pos().x + 16, y: t.pos().y - 9 });
    t.engine.world.set(t.sentinelId, SentinelMelee, { ...t.sentinel(), state: 'active', framesLeft: 6, attackSpent: false, dirX: -1, dirY: 0 });
    t.step();
    expect(t.player().combo).toMatchObject({ presses: ['L'], nextCastInstant: true });
    t.steps(combat.parry.hitstopF + 1); // the parry's hit-stop freezes everything first
    t.step(press('right', { x: t.pos().x, y: t.pos().y - 30 }, false));
    expect(t.player().action.kind).not.toBe('casting'); // the finisher went off at once
    expect(t.player().combo?.nextCastInstant).toBe(false);

    t.setPlayer({ combo: { presses: ['R'], windowLeftF: 24, nextCastInstant: false }, action: { kind: 'free' } });
    t.step(key('ShiftLeft'));
    t.steps(combat.parry.startupF + combat.parry.activeF + 1);
    expect(t.player().combo?.presses).toEqual([]);
  });
});
