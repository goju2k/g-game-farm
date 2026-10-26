import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type EntityId, type InputFrame, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import type { RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { CombatStats, SentinelAwakened, SentinelMelee } from '../combat/combat-components.js';
import { parseCombatData } from '../combat/combat-data.js';
import { createDialogueController } from '../events/dialogue-controller.js';
import { createGameEventRegistry, findActor } from '../events/event-commands.js';
import { Position } from '../components.js';
import { parseEventScripts } from '../events/event-director.js';
import { createRogueliteSession } from '../session.js';
import { createHintController, hintDoneFlag, parseHints } from './hints.js';

const publicDir = resolve(__dirname, '../../../public/game');
const combat = parseCombatData(JSON.parse(readFileSync(resolve(publicDir, 'data/combat.json'), 'utf8')), 'combat.json');
const hintDefs = parseHints(JSON.parse(readFileSync(resolve(publicDir, 'data/hints.json'), 'utf8')));
const childAsset = parseAnimAsset(JSON.parse(readFileSync(resolve(publicDir, 'characters/player-child/player-child.anim.json'), 'utf8')), 'player-child');
const child: LoadedAnimAsset = { asset: childAsset, texture: 50 as TextureHandle, clips: clipsFromAnimAsset(childAsset, 50 as TextureHandle) };
const textures = { player: 0, zag: 1, doltan: 2, ghost: 3, grass: 4, tiles: 6 } as unknown as Record<RogueliteAssetKey, TextureHandle>;
const STEP = 1000 / 60;

function boot(room: string, scripts: unknown = { rooms: {} }) {
  const engine = createEngine();
  const registry = createGameEventRegistry();
  const session = createRogueliteSession();
  const hints = createHintController();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, session, () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, { 'player-child': child }, combat, {
    scripts: parseEventScripts(scripts, registry, 'test.json'),
    registry,
    dialogue: createDialogueController(),
    hints: { controller: hints, defs: () => hintDefs },
  });
  engine.loadScene(room);
  return {
    engine,
    session,
    shown: () => hints.view.getSnapshot()?.id,
    step: (input: InputFrame = EMPTY_INPUT_FRAME) => engine.tick(STEP, input),
  };
}
const key = (code: string): InputFrame => ({ ...EMPTY_INPUT_FRAME, keyboard: { held: new Set([code]), justPressed: new Set([code]), justReleased: new Set() } });

describe('first-use hints (D-035)', () => {
  it('Zone 4: the dash hint comes up as a sentinel first wakes, stays until a dash, then never again', () => {
    const t = boot('zone-4');
    t.step();
    expect(t.shown()).toBeUndefined();
    // Walk up to the first sleeper: it wakes.
    const [[id]] = [...t.engine.world.query([SentinelAwakened] as const)];
    const at = t.engine.world.get(id, Position) as Position;
    t.engine.world.set(findActor(t.engine.world, 'player') as EntityId, Position, { x: at.x - 30, y: at.y + 8 });
    for (let i = 0; i < 10 && !t.shown(); i++) t.step();
    expect(t.shown()).toBe('dash');
    // Back off out of its reach (it returns to sleep), then wait.
    const start = { ...t.engine.world.get(findActor(t.engine.world, 'player') as EntityId, Position) as Position };
    t.engine.world.set(findActor(t.engine.world, 'player') as EntityId, Position, { x: 24, y: start.y });
    for (let i = 0; i < 60; i++) t.step();
    expect(t.shown()).toBe('dash'); // sticky
    t.step(key('Space'));
    for (let i = 0; i < 10; i++) t.step();
    expect(t.shown()).toBeUndefined();
    expect(t.session.flags.has(hintDoneFlag('dash'))).toBe(true);
    t.engine.world.set(id, SentinelAwakened, { ...(t.engine.world.get(id, SentinelAwakened) as SentinelAwakened), state: 'waking' });
    t.step();
    expect(t.shown()).toBeUndefined();
  });

  it('a dash before the hint ever showed doesn’t retire it', () => {
    const t = boot('zone-4');
    t.step();
    t.step(key('Space'));
    for (let i = 0; i < 30; i++) t.step();
    expect(t.session.flags.has(hintDoneFlag('dash'))).toBe(false);
  });

  it('Zone 6: the parry hint shows at each cue (and a little after) until a parry lands', () => {
    const t = boot('zone-6');
    t.step();
    const [[id, sentinel]] = [...t.engine.world.query([SentinelMelee] as const)];
    t.engine.world.set(id, SentinelMelee, { ...sentinel, state: 'windup', framesLeft: 2, windupF: 60, cueF: 12 });
    t.step();
    expect(t.shown()).toBe('parry');
    for (let i = 0; i < 90; i++) t.step();
    expect(t.shown()).toBeUndefined(); // gone after the cue + holdMs
    const [[statsId, stats]] = [...t.engine.world.query([CombatStats] as const)];
    t.engine.world.set(id, SentinelMelee, { ...(t.engine.world.get(id, SentinelMelee) as SentinelMelee), state: 'windup', framesLeft: 2 });
    t.step();
    expect(t.shown()).toBe('parry');
    t.engine.world.set(statsId, CombatStats, { ...stats, parrySuccesses: stats.parrySuccesses + 1 });
    t.step();
    expect(t.shown()).toBeUndefined();
    expect(t.session.flags.has(hintDoneFlag('parry'))).toBe(true);
  });

  it('a script shows any hint (the pillar)', () => {
    const t = boot('cast-lab', { rooms: { 'cast-lab': [{ id: 'h', trigger: { type: 'roomStart' }, do: [{ cmd: 'hint', id: 'pillar' }] }] } });
    t.step();
    t.step();
    expect(t.shown()).toBe('pillar');
  });
});
