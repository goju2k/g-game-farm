import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEngine, EMPTY_INPUT_FRAME, type TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import { ROGUELITE_ANIM_ASSETS, type RogueliteAssetKey } from '../assets.js';
import { registerRoguelite } from '../bootstrap.js';
import { SpellProjectile } from '../combat/combat-components.js';
import { parseCombatData } from '../combat/combat-data.js';
import { Animator, Flags, LightEmitter, Position, RoomTileLayout, SpriteRender } from '../components.js';
import { createRogueliteSession } from '../session.js';
import { createDialogueController } from './dialogue-controller.js';
import { msUntilTag } from './event-art.js';
import { createGameEventRegistry, findActor, setCompanionBrightness } from './event-commands.js';
import { GlowDot, Vine } from './event-components.js';
import { parseEventScripts } from './event-director.js';

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

function boot(room: string, scripts: unknown = { rooms: {} }) {
  const engine = createEngine();
  const registry = createGameEventRegistry();
  registerRoguelite(engine, textures, 5 as TextureHandle, { mage: 0 as TextureHandle, flame: 7 as TextureHandle }, createRogueliteSession(), () => 0.5, { tiles: 6 as TextureHandle, 'dungeon-part0': 8 as TextureHandle }, assets, combat, {
    scripts: parseEventScripts(scripts, registry, 'test.json'),
    registry,
    dialogue: createDialogueController(),
  });
  engine.loadScene(room);
  return { engine, step: () => engine.tick(STEP, EMPTY_INPUT_FRAME) };
}

describe('event actors use their art', () => {
  it('the companion is a sprite whose clip follows its brightness, and `move` while travelling', () => {
    const t = boot('part1-meet', {
      rooms: {
        'part1-meet': [
          {
            id: 'arrive',
            trigger: { type: 'roomStart' },
            do: [
              { cmd: 'spawn', kind: 'companion', id: 'companion', at: { x: 100, y: 100 } },
              { cmd: 'wait', ms: 100 },
              { cmd: 'move', id: 'companion', path: [{ x: 160, y: 100 }], speed: 60 },
            ],
          },
        ],
      },
    });
    t.step();
    const companion = findActor(t.engine.world, 'companion');
    expect(companion).toBeDefined();
    const id = companion as NonNullable<typeof companion>;
    expect(t.engine.world.get(id, SpriteRender)?.texture).toBe(assets['companion'].texture);
    expect(t.engine.world.get(id, GlowDot)).toBeUndefined();
    expect((t.engine.world.get(id, Animator) as Animator).current).toBe('idle') // brightness 2: normal;
    for (let i = 0; i < 20; i++) t.step();
    expect((t.engine.world.get(id, Animator) as Animator).current).toBe('move');
    for (let i = 0; i < 90; i++) t.step(); // arrived
    setCompanionBrightness(t.engine.world, id, 1);
    t.step();
    expect((t.engine.world.get(id, Animator) as Animator).current).toBe('idle-dim');
  });

  it('the artifact stands on its point with its glow up the pedestal', () => {
    const t = boot('opening-vista', { rooms: { 'opening-vista': [{ id: 'a', trigger: { type: 'roomStart' }, do: [{ cmd: 'spawn', kind: 'artifact', id: 'artifact', at: { x: 50, y: 60 } }] }] } });
    t.step();
    const id = findActor(t.engine.world, 'artifact') as NonNullable<ReturnType<typeof findActor>>;
    expect(t.engine.world.get(id, SpriteRender)?.texture).toBe(assets['artifact-spark-of-being'].texture);
    expect(t.engine.world.get(id, LightEmitter)?.offsetY).toBe(-10);
  });

  it('a burnt vine plays its burn and only opens the way at burn:clear', () => {
    const t = boot('part1-meet');
    const [[vineId, vine]] = [...t.engine.world.query([Vine] as const)];
    expect(vine.sprites?.length).toBe(vine.cells.length);
    const cell = vine.cells[0];
    const solid = () => {
      const [[, layout]] = [...t.engine.world.query([RoomTileLayout] as const)];
      return layout.collision.cells[cell.row * layout.collision.columns + cell.column] !== 0;
    };
    expect(solid()).toBe(true);
    const shot = t.engine.world.createEntity();
    t.engine.world.set(shot, Position, { x: vine.box.x + vine.box.width / 2, y: vine.box.y + vine.box.height / 2 });
    t.engine.world.set(shot, SpellProjectile, { vx: 0, vy: 0, remainingPx: 10, damage: 1, size: 4 });
    t.step();
    expect(t.engine.world.get(vineId, Vine)?.burningMs).toBeDefined();
    expect(solid()).toBe(true); // still burning
    const clearMs = msUntilTag(assets['vine'].clips['burn'], 'burn:clear');
    expect(clearMs).toBeGreaterThan(0);
    for (let ms = 0; ms <= clearMs + STEP; ms += STEP) t.step();
    expect(solid()).toBe(false);
    expect([...t.engine.world.query([Flags] as const)][0][1].values['vine-burned']).toBe(true);
    for (let i = 0; i < 60; i++) t.step();
    expect(vine.sprites?.every((s) => t.engine.world.get(s, SpriteRender) === undefined)).toBe(true); // burnt out and gone
  });
});
