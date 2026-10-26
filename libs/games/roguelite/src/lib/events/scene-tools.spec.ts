import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type EntityId, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import { ROGUELITE_ANIM_ASSETS, type RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { parseCombatData } from '../combat/combat-data.js';
import { Animator, Position, SpriteRender } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { createDialogueController } from './dialogue-controller.js';
import { createGameEventRegistry, findActor } from './event-commands.js';
import { Exposure, Hidden, Highlight, PropMarker, Tint } from './event-components.js';
import { parseEventScripts } from './event-director.js';
import { CrackedWall } from '../world/world-components.js';
import { igniteArea } from '../world/world-systems.js';
import { openingVista } from '../rooms/opening-rooms.js';

/** The form-change scene's tools (D-037): props, hide/show, highlight, held clips, setForm intro. */

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

function play(room: string, commands: unknown[]) {
  const engine = createEngine();
  const registry = createGameEventRegistry();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, assets, combat, {
    scripts: parseEventScripts({ rooms: { [room]: [{ id: 's', trigger: { type: 'roomStart' }, do: commands }] } }, registry, 'test.json'),
    registry,
    dialogue: createDialogueController(),
  });
  engine.loadScene(room);
  return {
    engine,
    run: (ms: number) => {
      for (let t = 0; t < ms; t += STEP) engine.tick(STEP, EMPTY_INPUT_FRAME);
    },
    actor: (id: string) => findActor(engine.world, id) as EntityId,
  };
}

describe('scene tools (D-037)', () => {
  it('a prop is spawned with its art and clip, takes anim and move; without art it is a marker', () => {
    const t = play('opening-vista', [
      { cmd: 'spawn', kind: 'prop', id: 'staff', sprite: 'vine', clip: 'idle', at: 'A', light: { radius: 8, color: 'cold' } },
      { cmd: 'spawn', kind: 'prop', id: 'robe', sprite: 'no-such-art', at: 'A' },
      { cmd: 'wait', ms: 100 },
      { cmd: 'anim', id: 'staff', clip: 'burn' },
      { cmd: 'move', id: 'staff', path: [{ dx: 32 }], speed: 160 },
    ]);
    t.run(50);
    const staff = t.actor('staff');
    expect(t.engine.world.get(staff, SpriteRender)?.texture).toBe(assets['vine'].texture);
    expect(t.engine.world.get(t.actor('robe'), PropMarker)).toBeDefined();
    const x = (t.engine.world.get(staff, Position) as Position).x;
    t.run(400);
    expect((t.engine.world.get(staff, Animator) as Animator).current).toBe('burn');
    expect((t.engine.world.get(staff, Position) as Position).x).toBeCloseTo(x + 32, 0);
  });

  it('hide / show the player; setForm keeps it hidden and plays its intro clip, which the combat look leaves alone', () => {
    const t = play('opening-vista', [{ cmd: 'hide', id: 'player' }, { cmd: 'setForm', form: 'child', intro: 'fire' }, { cmd: 'wait', ms: 100 }, { cmd: 'show', id: 'player' }]);
    t.run(20);
    const player = t.actor('player');
    expect(t.engine.world.get(player, Hidden)).toBeDefined();
    expect((t.engine.world.get(player, Animator) as Animator).current).toBe('fire');
    t.run(200);
    expect(t.engine.world.get(player, Hidden)).toBeUndefined();
    t.run(500);
    expect((t.engine.world.get(player, Animator) as Animator).current).toBe('float'); // back once the intro ended
  });

  it('a held anim on the player stays until the next one', () => {
    const t = play('cast-lab', [{ cmd: 'anim', id: 'player', clip: 'parry', hold: true }]);
    t.run(1500);
    expect((t.engine.world.get(t.actor('player'), Animator) as Animator).current).toBe('parry');
  });

  it('highlight: fills, holds (the script waits that long), clears, then is gone', () => {
    const t = play('opening-vista', [{ cmd: 'highlight', in: 250, hold: 300, out: 600 }, { cmd: 'spawn', kind: 'prop', id: 'after', sprite: 'none', at: 'A' }]);
    t.run(400);
    expect([...t.engine.world.query([Highlight] as const)]).toHaveLength(1);
    expect(findActor(t.engine.world, 'after')).toBeUndefined(); // still under the white
    t.run(250);
    expect(findActor(t.engine.world, 'after')).toBeDefined();
    t.run(700);
    expect([...t.engine.world.query([Highlight] as const)]).toHaveLength(0);
  });
});

describe('place (D-037)', () => {
  it('puts an actor straight onto a point or another actor', () => {
    const t = play('opening-vista', [{ cmd: 'spawn', kind: 'prop', id: 'robe', sprite: 'none', at: 'A' }, { cmd: 'place', id: 'player', at: 'robe' }]);
    t.run(50);
    expect(t.engine.world.get(t.actor('player'), Position)).toEqual(t.engine.world.get(t.actor('robe'), Position));
  });
});

describe('anim speed (D-039)', () => {
  it('plays a clip at the given rate', () => {
    const t = play('opening-vista', [{ cmd: 'spawn', kind: 'prop', id: 'v', sprite: 'vine', clip: 'idle', at: 'A' }, { cmd: 'anim', id: 'v', clip: 'burn', speed: 0.5 }]);
    t.run(20);
    expect((t.engine.world.get(t.actor('v'), Animator) as Animator).rate).toBe(0.5);
    const burnMs = assets['vine'].clips['burn'].frames.reduce((sum, f) => sum + f.durationMs, 0);
    t.run(burnMs + 50);
    expect((t.engine.world.get(t.actor('v'), Animator) as Animator).state.finished).toBe(false); // half speed: not done yet
    t.run(burnMs);
    expect((t.engine.world.get(t.actor('v'), Animator) as Animator).state.finished).toBe(true);
  });
});

describe('the vista wall (D-040)', () => {
  it('only collapse brings it down (fire does not); then the way north leads to the first meeting', () => {
    const t = play('opening-vista', [{ cmd: 'wait', ms: 200 }, { cmd: 'collapse', id: 'vista-wall' }]);
    t.engine.tick(STEP, EMPTY_INPUT_FRAME);
    const [[wallId, wall]] = [...t.engine.world.query([CrackedWall] as const)];
    expect(wall.eventOnly).toBe(true);
    igniteArea(t.engine.world, { x: wall.box.x + 24, y: wall.box.y + 20 }, 40, true); // a big pillar right on it
    t.run(100);
    expect(t.engine.world.get(wallId, CrackedWall)?.broken).toBe(false);
    t.run(800);
    expect(t.engine.world.get(wallId, CrackedWall)?.broken).toBe(true);
    const exit = DEMO_EXIT();
    expect(exit).toMatchObject({ targetRoomId: 'part1-meet', targetEntryId: '1' });
  });
});

const DEMO_EXIT = () => openingVista.exits.find((e) => e.targetRoomId === 'part1-meet');

describe('tint and exposure (D-041)', () => {
  it('tint paints an actor toward a colour and back over time, without waiting', () => {
    const t = play('opening-vista', [
      { cmd: 'spawn', kind: 'prop', id: 'robe', sprite: 'vine', at: 'A' },
      { cmd: 'tint', id: 'robe', color: '#ffcc00', amount: 1 },
      { cmd: 'tint', id: 'robe', amount: 0, ms: 1000 },
      { cmd: 'spawn', kind: 'prop', id: 'after', sprite: 'none', at: 'A' },
    ]);
    t.run(20);
    expect(findActor(t.engine.world, 'after')).toBeDefined(); // didn't wait
    const tint = t.engine.world.get(t.actor('robe'), Tint) as Tint;
    expect(tint.color[0]).toBe(1);
    expect(tint.color[1]).toBeCloseTo(0.8, 2);
    expect(tint.amount).toBeGreaterThan(0.9);
    t.run(500);
    const half = (t.engine.world.get(t.actor('robe'), Tint) as Tint).amount;
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    t.run(700);
    expect(t.engine.world.get(t.actor('robe'), Tint)).toBeUndefined(); // back to normal: gone
  });

  it('exposure climbs to its level and falls back, then is gone', () => {
    const t = play('opening-vista', [{ cmd: 'exposure', to: 1, ms: 600 }, { cmd: 'wait', ms: 700 }, { cmd: 'exposure', to: 0, ms: 1000 }]);
    t.run(300);
    const rising = [...t.engine.world.query([Exposure] as const)][0][1].level;
    expect(rising).toBeGreaterThan(0.3);
    expect(rising).toBeLessThan(0.8);
    t.run(330); // at full before the fall starts (700ms)
    expect([...t.engine.world.query([Exposure] as const)][0][1].level).toBeCloseTo(1, 1);
    t.run(1200);
    expect([...t.engine.world.query([Exposure] as const)]).toHaveLength(0);
  });
});
