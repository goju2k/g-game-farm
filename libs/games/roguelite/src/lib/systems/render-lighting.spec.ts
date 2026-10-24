import { createAnimationPlayerState, World } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { TileLight, type Animator, type DropShadow } from '../components.js';
import { spawnTileLights } from '../lighting/tile-lights.js';
import { dungeonPart0SampleTileMap } from '../rooms/maps/dungeon-part0-sample.generated.js';
import { dropShadowWidths, tileLightRadiusAt } from './render-lighting.js';

describe('tileLightRadiusAt', () => {
  const light: TileLight = { x: 0, y: 0, tint: [0, 0, 0], radii: [30, 32, 34, 32], frameDurationsMs: [900, 250, 350, 250] };

  it('steps the radius with the tile animation frames and loops', () => {
    expect(tileLightRadiusAt(light, 0)).toBe(30);
    expect(tileLightRadiusAt(light, 900)).toBe(32);
    expect(tileLightRadiusAt(light, 1150)).toBe(34);
    expect(tileLightRadiusAt(light, 1500)).toBe(32);
    expect(tileLightRadiusAt(light, 1750)).toBe(30);
  });

  it('uses the single radius of a still light', () => {
    expect(tileLightRadiusAt({ x: 0, y: 0, tint: [0, 0, 0], radii: [20] }, 12345)).toBe(20);
  });
});

describe('dropShadowWidths', () => {
  const shadow: DropShadow = { widths: [8, 6], alpha: 0.4, lifted: { clip: 'float', frames: [2, 3, 4], widths: [6, 4] } };
  const on = (current: string, frameIndex: number): Animator => ({ clips: {}, current, state: { ...createAnimationPlayerState(), frameIndex } });

  it('shrinks only on the lifted clip frames', () => {
    expect(dropShadowWidths(shadow, on('float', 0))).toEqual([8, 6]);
    expect(dropShadowWidths(shadow, on('float', 3))).toEqual([6, 4]);
    expect(dropShadowWidths(shadow, on('dash', 3))).toEqual([8, 6]);
    expect(dropShadowWidths(shadow, undefined)).toEqual([8, 6]);
  });
});

describe('spawnTileLights (dungeon-part0 sample)', () => {
  it('lights every placed lamp, the seal once at its 2x2 center, and the remains — with radii per animation frame', () => {
    const world = new World();
    spawnTileLights(world, dungeonPart0SampleTileMap);
    const lights = [...world.query([TileLight] as const)].map(([, l]) => l);
    // 2 lamps of each kind (38, 40), one seal (34; its 35/44/45 quarters add no light), one remains (47).
    expect(lights).toHaveLength(6);
    for (const light of lights) {
      expect(light.frameDurationsMs?.length).toBe(light.radii.length);
    }
    expect(lights.filter((l) => l.radii[0] === 30)).toHaveLength(1);
  });
});
