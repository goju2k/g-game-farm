import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, createVirtualControls, EMPTY_INPUT_FRAME, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { Position } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { quantizeStick } from '../ui/touch-controls.js';
import { CombatPlayer, SentinelMelee } from './combat-components.js';
import { combatDataForDevice, parseCombatData } from './combat-data.js';
import { readIntent, VIRTUAL } from './intent.js';
import { autoAim, createTouchAimSource } from './touch-feed.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;

describe('quantizeStick (touch spec §2)', () => {
  it('ignores the 15% dead zone and snaps to 8 directions', () => {
    expect(quantizeStick(5, 0, 56)).toEqual({ x: 0, y: 0 }); // < 8.4px
    expect(quantizeStick(30, 2, 56)).toEqual({ x: 1, y: 0 });
    expect(quantizeStick(20, 20, 56)).toEqual({ x: 1, y: 1 });
    expect(quantizeStick(-3, -40, 56)).toEqual({ x: 0, y: -1 });
    expect(quantizeStick(-30, 14, 56)).toEqual({ x: -1, y: 1 }); // ~155° -> 135°... rounds to the nearer octant
  });
});

describe('autoAim (touch spec §2)', () => {
  it('picks the nearest enemy in range, else a point ahead in the facing direction', () => {
    const source = createTouchAimSource();
    source.player = { x: 0, y: 0, facingX: -1, facingY: 0 };
    source.enemies.push({ x: 100, y: 0 }, { x: 0, y: 60 }, { x: 300, y: 0 });
    expect(autoAim(source, 128, 128)).toEqual({ x: 0, y: 60 });
    expect(autoAim(source, 40, 48)).toEqual({ x: -48, y: 0 });
  });
});

describe('readIntent: same intent from keyboard or touch (touch spec §0)', () => {
  const touchFrame = (setup: (v: ReturnType<typeof createVirtualControls>) => void): InputFrame => {
    const controls = createVirtualControls();
    controls.setAxis(VIRTUAL.touch, 1);
    setup(controls);
    return { ...EMPTY_INPUT_FRAME, virtual: controls.poll() };
  };

  it('reads the stick, the buttons and the touch aim', () => {
    const intent = readIntent(
      touchFrame((v) => {
        v.setAxis(VIRTUAL.moveX, -1);
        v.setAxis(VIRTUAL.moveY, 1);
        v.press(VIRTUAL.parry);
        v.setAim({ x: 10, y: 20 });
        v.press(VIRTUAL.castSpell);
        v.release(VIRTUAL.castSpell);
      }),
    );
    expect(intent).toMatchObject({ moveX: -1, moveY: 1, parry: true, castSpell: true, aim: { x: 10, y: 20 }, touch: true });
  });

  it('a held key wins over a centered stick', () => {
    const frame = touchFrame(() => undefined);
    const withKey: InputFrame = { ...frame, keyboard: { held: new Set(['KeyD']), justPressed: new Set(), justReleased: new Set() } };
    expect(readIntent(withKey)).toMatchObject({ moveX: 1, moveY: 0 });
  });
});

describe('inputOverrides.touch (touch spec §4)', () => {
  it('only changes input-feel numbers, and only for touch', () => {
    const tuned = { ...combat, inputOverrides: { touch: { parry: { activeF: 12 }, inputBufferF: 8 } } };
    expect(combatDataForDevice(tuned, true)).toMatchObject({ inputBufferF: 8, parry: { activeF: 12, startupF: combat.parry.startupF } });
    expect(combatDataForDevice(tuned, false)).toBe(tuned);
    expect(combatDataForDevice(combat, true)).toBe(combat); // shipped default: empty overrides
  });
});

describe('touch end to end', () => {
  function boot(room: string) {
    const engine = createEngine();
    registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat);
    engine.loadScene(room);
    const controls = createVirtualControls();
    controls.setAxis(VIRTUAL.touch, 1);
    const step = () => engine.tick(1000 / 60, { ...EMPTY_INPUT_FRAME, virtual: controls.poll() });
    return { engine, controls, step };
  }

  it('a touch parry tap during the window stops the Zone 6 sentinel, same as Shift', () => {
    const t = boot('zone-6');
    const sentinel = () => [...t.engine.world.query([SentinelMelee] as const)][0][1];
    for (let i = 0; i < 900 && !(sentinel().state === 'windup' && sentinel().framesLeft <= (sentinel().cueF ?? 0)); i++) t.step();
    for (let i = sentinel().framesLeft - 4; i > 0; i--) t.step();
    t.controls.press(VIRTUAL.parry);
    t.controls.release(VIRTUAL.parry); // a tap shorter than a frame
    for (let i = 0; i < 12; i++) t.step();
    expect(sentinel().state).toBe('dormant');
  });

  it('a touch cast aims where the controls put it and fixes the aim at release', () => {
    const t = boot('cast-lab');
    const [[playerId, player]] = [...t.engine.world.query([CombatPlayer] as const)];
    const pos = t.engine.world.get(playerId, Position) as Position;
    t.controls.setAim({ x: pos.x + 40, y: pos.y - 30 });
    t.controls.press(VIRTUAL.castSpell);
    t.controls.release(VIRTUAL.castSpell);
    t.step();
    const action = (t.engine.world.get(playerId, CombatPlayer) as CombatPlayer).action;
    expect(player.form).toBe('child');
    expect(action).toMatchObject({ kind: 'casting', aimX: pos.x + 40, aimY: pos.y - 30 });
  });
});
