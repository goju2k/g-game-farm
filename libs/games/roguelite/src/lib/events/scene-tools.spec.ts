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
import { Hidden, Highlight, PropMarker } from './event-components.js';
import { parseEventScripts } from './event-director.js';

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
