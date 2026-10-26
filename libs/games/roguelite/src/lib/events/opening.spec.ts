import { readFileSync } from 'node:fs';
import { CrackedWall } from '../world/world-components.js';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type EntityId, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { CombatPlayer } from '../combat/combat-components.js';
import { parseCombatData } from '../combat/combat-data.js';
import { Flags, LightEmitter, Position } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { createDialogueController } from './dialogue-controller.js';
import { createGameEventRegistry, findActor } from './event-commands.js';
import { CameraDirector, Companion, EventFade, InputLock, Vine } from './event-components.js';
import { parseEventScripts } from './event-director.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const openingJson = JSON.parse(readFileSync(resolve(publicDir, 'data/events/opening.json'), 'utf8'));
const STEP = 1000 / 60;

function boot(room: string, { reader = true }: { reader?: boolean } = {}) {
  const engine = createEngine();
  const registry = createGameEventRegistry();
  const scripts = parseEventScripts(openingJson, registry, 'opening.json');
  const dialogue = createDialogueController();
  const session = createRogueliteSession();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, session, () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat, { scripts, registry, dialogue });
  engine.loadScene(room);
  const said: string[] = [];
  const t = {
    engine,
    dialogue,
    session,
    said,
    step(input: InputFrame = EMPTY_INPUT_FRAME) {
      engine.tick(STEP, input);
      const line = dialogue.view.getSnapshot().line;
      if (line && said[said.length - 1] !== `${line.seq}:${line.text}`) said.push(`${line.seq}:${line.text}`);
      if (reader && line) dialogue.complete(line.seq); // a reader who taps through every line
    },
    run(ms: number, input?: InputFrame) {
      for (let elapsed = 0; elapsed < ms; elapsed += STEP) t.step(input);
    },
    player: () => engine.world.get(findActor(engine.world, 'player') as EntityId, CombatPlayer) as CombatPlayer,
    pos: () => engine.world.get(findActor(engine.world, 'player') as EntityId, Position) as Position,
    locked: () => [...engine.world.query([InputLock] as const)][0]?.[1].locked ?? false,
    flags: () => [...engine.world.query([Flags] as const)][0]?.[1].values ?? {},
    scene: () => engine.getActiveSceneName(),
    teleport(at: { x: number; y: number }) {
      engine.world.set(findActor(engine.world, 'player') as EntityId, Position, at);
    },
  };
  return t;
}
const lines = (said: readonly string[]) => said.map((s) => s.slice(s.indexOf(':') + 1));
const hold = (...codes: string[]): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(codes), justPressed: new Set(), justReleased: new Set() } });

describe('event scripts file', () => {
  it('opening.json validates against the registered commands', () => {
    expect(() => parseEventScripts(openingJson, createGameEventRegistry(), 'opening.json')).not.toThrow();
  });
  it('rejects unknown commands and triggers, listing them', () => {
    const bad = { rooms: { x: [{ id: 'a', trigger: { type: 'whenever' }, do: [{ cmd: 'dance' }] }] } };
    expect(() => parseEventScripts(bad, createGameEventRegistry(), 'bad.json')).toThrow(/trigger\.type[\s\S]*unknown event commands: dance/);
  });
});

describe('scene A — wake', () => {
  it('starts locked in total darkness with no ember, blinks it on, then hands control over', () => {
    const t = boot('opening-wake');
    t.step();
    const ember = findActor(t.engine.world, 'ember') as EntityId;
    expect(t.locked()).toBe(true);
    expect(t.engine.world.get(ember, LightEmitter)?.radius).toBe(0);
    t.run(6000);
    expect(t.locked()).toBe(false);
    expect(t.engine.world.get(ember, LightEmitter)?.radius).toBe(28);
  });

  it('a once-only event is remembered: re-entering the room does not replay it', () => {
    const t = boot('opening-wake');
    t.run(6000);
    t.engine.loadScene('opening-wake');
    t.run(100);
    expect(t.locked()).toBe(false);
  });
});

describe('scene B — far glimmer', () => {
  it('appears at the corridor midpoint (camera drawn toward it, then back) and fades when approached', () => {
    const t = boot('opening-glimmer');
    t.step();
    const y = t.pos().y;
    t.teleport({ x: 11 * 16 + 8, y });
    t.run(100);
    expect(findActor(t.engine.world, 'far-glimmer')).toBeDefined();
    t.run(3000);
    expect([...t.engine.world.query([CameraDirector] as const)][0][1]).toMatchObject({ mode: 'follow', target: 'player' });
    t.teleport({ x: 19 * 16 + 8, y }); // n: where the corridor forks (31 §1)
    t.run(500);
    expect(findActor(t.engine.world, 'far-glimmer')).toBeUndefined();
  });
});

describe('scenes C+D — vista and form change', () => {
  it('the hall reveal pans the camera up to t and back, then the artifact turns the ember into the child; the wall falls and the way north leads to Part 1', () => {
    const t = boot('opening-vista');
    t.run(100);
    expect(findActor(t.engine.world, 'artifact')).toBeDefined();
    t.run(400, hold('KeyW')); // walk up into the corridor exit trigger
    for (let i = 0; i < 400 && !t.locked(); i++) t.step(hold('KeyW'));
    expect(t.locked()).toBe(true);
    t.run(4800); // 0.8s walk-in + 0.4s + the 3.5s pan, inside the 2s hold at the top
    const director = [...t.engine.world.query([CameraDirector] as const)][0][1];
    expect(director.mode).toBe('fixed');
    expect(director.y).toBeLessThan(10 * 16); // looking at the top of the hall
    t.run(6000);
    expect(t.locked()).toBe(false);

    // Walk to the artifact (straight up the middle).
    const artifact = t.engine.world.get(findActor(t.engine.world, 'artifact') as EntityId, Position) as Position;
    t.teleport({ x: artifact.x, y: artifact.y + 20 });
    for (let i = 0; i < 60 * 20 && t.player().form === 'ember'; i++) t.step(hold('KeyW'));
    expect(t.player().form).toBe('child');
    // D-040: control comes back right here; then the wall above falls, and the way north leads to the first meeting.
    for (let i = 0; i < 60 * 20 && t.locked(); i++) t.step();
    expect(t.locked()).toBe(false);
    expect(t.scene()).toBe('opening-vista');
    const wall = () => [...t.engine.world.query([CrackedWall] as const)][0]?.[1];
    for (let i = 0; i < 60 * 10 && !wall()?.broken; i++) t.step();
    expect(wall()?.broken).toBe(true);
    for (let i = 0; i < 60 * 10 && t.scene() === 'opening-vista'; i++) t.step(hold('KeyW'));
    expect(t.scene()).toBe('part1-meet');
  });
});

describe('scene E — first meeting', () => {
  /** Runs until the first-meeting scene has handed control back (the flag is its last step). */
  const untilJoined = (t: ReturnType<typeof boot>) => {
    for (let i = 0; i < 60 * 120 && !t.flags()['companion-joined']; i++) t.step();
    t.run(100);
  };

  it('plays the whole conversation from data, then the companion follows and the flag is set', () => {
    const t = boot('part1-meet');
    untilJoined(t);
    expect(lines(t.said)).toEqual([
      '찾았다!',
      '와, 진짜다. 진짜 움직여!',
      '아, 미안 미안. 놀랐어? 나도 놀랐어.',
      '아까 그 파란 불, 너 맞지? 저 아래서 깜빡이던 거.',
      '…맞구나. 끄덕였지? 방금 끄덕였지?',
      '좋아. 끄덕인 걸로 할게.',
      '근데 넌 이름이 뭐야?',
      '모르는구나.',
      '괜찮아. 나도 내 이름 몰라.{pause:400} 진짜로.',
      '그럼 내가 지어 줄게!',
      '반짝이는데, 뭔지 모르겠고, 작고…{pause:300} 어디서 떨어져 나온 것 같아.',
      "그래! 넌 '알 수 없는 조각'이야.",
      '{pause:300}나처럼.',
      '왜, 멋있잖아.',
      '자, 가자! 여기 엄청 넓어. 아래보다 훨씬!',
      '왜인지는 모르겠는데…{pause:400} 너랑 같이 가야 할 것 같아.',
    ]);
    expect(t.flags()['companion-joined']).toBe(true);
    expect(t.locked()).toBe(false);
    const companion = [...t.engine.world.query([Companion] as const)][0][1];
    expect(companion.following).toBe(true);
    expect([...t.engine.world.query([EventFade] as const)]).toHaveLength(0);
  });

  it('a long-press skip runs the scene to its end state at once', () => {
    const t = boot('part1-meet', { reader: false });
    t.run(3000);
    expect(t.locked()).toBe(true);
    t.dialogue.requestSkip();
    t.step();
    expect(t.locked()).toBe(false);
    expect(t.flags()['companion-joined']).toBe(true);
    expect(t.dialogue.view.getSnapshot().line).toBeUndefined();
  });

  it('E-2: bumping the vines three times brings the hint; a quick spell burns them', () => {
    const t = boot('part1-meet');
    untilJoined(t);
    const vine = [...t.engine.world.query([Vine] as const)][0][1];
    for (let bump = 0; bump < 3; bump++) {
      t.teleport({ x: vine.box.x - 8, y: vine.box.y + 14 });
      t.run(300, hold('KeyD'));
      t.run(100);
    }
    expect(lines(t.said)).toContain('그 손에 있는 거, 불이지? 저기에 대 봐!');
    const aim = { x: vine.box.x + 8, y: vine.box.y + 8 };
    t.teleport({ x: vine.box.x - 30, y: vine.box.y + 14 });
    t.step({ ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: aim, buttons: { held: new Set(['left']), justPressed: new Set(['left']), justReleased: new Set() } } });
    t.run(2000);
    expect(t.flags()['vine-burned']).toBe(true);
    expect([...t.engine.world.query([Vine] as const)]).toHaveLength(0);
    expect(lines(t.said)).toContain('우와! 봤어? 네가 했어!');
  });

  it('E-2: twenty idle seconds bring the tease, once', () => {
    const t = boot('part1-meet');
    untilJoined(t);
    const before = t.said.length;
    t.run(19000);
    expect(t.said.length).toBe(before);
    t.run(2000);
    expect(lines(t.said.slice(before))).toEqual(['…자? 설마 자는 거야?']);
    t.run(25000);
    expect(lines(t.said.slice(before))).toEqual(['…자? 설마 자는 거야?']); // once
  });
});
