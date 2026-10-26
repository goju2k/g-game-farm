import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { parseCombatData } from '../combat/combat-data.js';
import { createRogueliteSession } from '../session.js';
import { createSoundQueue, type SoundCue } from './sound-cues.js';
import { createSoundDirectorSystem } from './sound-director.js';
import { parseSoundManifest } from './sound-manifest.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const manifest = parseSoundManifest(JSON.parse(readFileSync(resolve(publicDir, 'data/sounds.json'), 'utf8')));
const STEP = 1000 / 60;

function boot(room: string) {
  const engine = createEngine();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat);
  const sound = createSoundQueue();
  engine.registerSystems({ simulation: [createSoundDirectorSystem(sound, manifest.tags)] });
  engine.loadScene(room);
  const heard: SoundCue[] = [];
  return {
    heard,
    step(input: InputFrame = EMPTY_INPUT_FRAME) {
      engine.tick(STEP, input);
      heard.push(...sound.drain());
    },
    sfx: () => heard.flatMap((c) => (c.kind === 'sfx' ? [c.id] : [])),
  };
}

const keys = (...codes: string[]): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(codes), justPressed: new Set(codes), justReleased: new Set() } });
const hold = (...codes: string[]): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(codes), justPressed: new Set(), justReleased: new Set() } });

describe('sound director', () => {
  it('a dash scatters as it leaves and gathers as it lands (ember form: no tagged art)', () => {
    const t = boot('zone-4');
    t.step();
    t.step(keys('Space', 'KeyD'));
    for (let i = 0; i < 40; i++) t.step(hold('KeyD'));
    const heard = t.sfx();
    expect(heard).toContain('dash-scatter');
    expect(heard.indexOf('dash-gather')).toBeGreaterThan(heard.indexOf('dash-scatter'));
  });

  it('a parry into nothing: the try, then the miss', () => {
    const t = boot('zone-4');
    t.step();
    t.step(keys('ShiftLeft'));
    for (let i = 0; i < 40; i++) t.step();
    expect(t.sfx()).toEqual(expect.arrayContaining(['parry-try', 'parry-fail']));
    expect(t.sfx()).not.toContain('parry-success');
  });

  it('moving hums (one loop on), stopping fades it (one loop off)', () => {
    const t = boot('zone-4');
    t.step();
    for (let i = 0; i < 20; i++) t.step(hold('KeyD'));
    for (let i = 0; i < 10; i++) t.step();
    const loops = t.heard.filter((c) => c.kind === 'loop');
    expect(loops).toEqual([
      { kind: 'loop', id: 'move-hum', on: true },
      { kind: 'loop', id: 'move-hum', on: false },
    ]);
  });
});
