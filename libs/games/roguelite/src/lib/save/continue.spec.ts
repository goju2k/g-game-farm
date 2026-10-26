import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { createSoundQueue } from '../audio/sound-cues.js';
import { registerRoguelite } from '../bootstrap.js';
import { parseCombatData } from '../combat/combat-data.js';
import { createDialogueController } from '../events/dialogue-controller.js';
import { createGameEventRegistry } from '../events/event-commands.js';
import { parseEventScripts } from '../events/event-director.js';
import { createRogueliteSession } from '../session.js';
import type { Checkpoint } from './save-game.js';
import { restoreCheckpoint } from './save-game.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const openingJson = JSON.parse(readFileSync(resolve(publicDir, 'data/events/opening.json'), 'utf8'));
const STEP = 1000 / 60;

function boot(scriptsJson: unknown = openingJson, registry = createGameEventRegistry(), roomBgm: Record<string, string> = {}) {
  const engine = createEngine();
  const scripts = parseEventScripts(scriptsJson, registry, 'test.json');
  const dialogue = createDialogueController();
  const session = createRogueliteSession();
  const sound = createSoundQueue();
  const checkpoints: Checkpoint[] = [];
  session.onCheckpoint = (cp) => checkpoints.push(cp);
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, session, () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat, { scripts, registry, dialogue, sound, roomBgm });
  return { engine, session, sound, checkpoints, dialogue, step: () => engine.tick(STEP, EMPTY_INPUT_FRAME) };
}

describe('continue (Q5)', () => {
  it('a story room checkpoints as it starts, with the events seen before entering', () => {
    const t = boot();
    t.engine.loadScene('opening-wake');
    expect(t.checkpoints).toEqual([{ room: 'opening-wake', entry: expect.any(String), form: 'ember', seenEvents: [] }]);
    for (let i = 0; i < 30; i++) t.step();
    expect(t.session.seenEvents.size).toBeGreaterThan(0); // the wake scene started
    // The next room's checkpoint carries it.
    t.engine.requestSceneChange('zone-4');
    t.step();
    expect(t.checkpoints.at(-1)?.room).toBe('zone-4');
    expect(t.checkpoints.at(-1)?.seenEvents).toContain('opening-wake:wake');
  });

  it('restoring a checkpoint and loading the same room again restarts its events cleanly', () => {
    const t = boot();
    t.engine.loadScene('opening-wake');
    const saved = t.checkpoints[0];
    for (let i = 0; i < 60; i++) t.step();
    const seenAfter = [...t.session.seenEvents];
    expect(seenAfter.length).toBeGreaterThan(0);
    // "Continue" from the room-start checkpoint: the scene's once-only events play again from the top.
    t.engine.requestSceneChange(restoreCheckpoint(t.session, saved));
    t.step();
    expect(t.engine.getActiveSceneName()).toBe('opening-wake');
    for (let i = 0; i < 60; i++) t.step();
    expect([...t.session.seenEvents]).toEqual(seenAfter);
  });
});

describe('sound commands', () => {
  it('event sfx/bgm commands queue cues for the render side', () => {
    const registry = createGameEventRegistry();
    const json = {
      rooms: {
        'opening-wake': [
            {
              id: 'noise',
              trigger: { type: 'roomStart' },
              do: [
                { cmd: 'bgm', id: 'part0-drone', fadeMs: 1200 },
                { cmd: 'sfx', id: 'door-open' },
                { cmd: 'bgm', id: null },
              ],
            },
        ],
      },
    };
    const t = boot(json, registry);
    t.engine.loadScene('opening-wake');
    t.step();
    expect(t.sound.drain()).toEqual([
      { kind: 'bgm', id: 'part0-drone', fadeMs: 1200 },
      { kind: 'sfx', id: 'door-open' },
      { kind: 'bgm', id: undefined },
    ]);
    expect(t.sound.drain()).toEqual([]);
  });
});


describe('room music', () => {
  const ROOM_BGM = { 'opening-wake': 'bgm-part0', 'zone-6': 'bgm-part0' };
  const bgms = (cues: ReturnType<ReturnType<typeof createSoundQueue>['drain']>) => cues.flatMap((c) => (c.kind === 'bgm' ? [c.id] : []));

  it('continuing into a room plays its default music', () => {
    const t = boot(openingJson, createGameEventRegistry(), ROOM_BGM);
    t.engine.loadScene('zone-6');
    t.step();
    expect(bgms(t.sound.drain())).toEqual(['bgm-part0']);
  });

  it('a room whose unseen scene starts music waits for that cue; once seen, the default applies', () => {
    const t = boot(openingJson, createGameEventRegistry(), ROOM_BGM);
    t.engine.loadScene('opening-wake');
    t.step();
    expect(bgms(t.sound.drain())).toEqual([]); // the wake scene brings the music in itself, after the dark
    for (let i = 0; i < 120; i++) t.step();
    expect(bgms(t.sound.drain())).toEqual(['bgm-part0']);
    t.engine.requestSceneChange('opening-wake'); // wake already seen
    t.step();
    expect(bgms(t.sound.drain())).toEqual(['bgm-part0']);
  });
});
