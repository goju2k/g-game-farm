import type { Rgb, World } from '@g-game-farm/ribs';
import type { TileMap } from '@g-game-farm/engine-tilemap';
import { TileLight } from '../components.js';
import { ROOM_TILE_SIZE } from '../rooms/tile-layout.js';
import { COLD_LIGHT } from './dungeon-lighting.js';

/** What a placed tile emits: center offset from the tile's top-left, color, and one radius per frame of the tile's own animation. */
export interface TileLightSpec {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly tint: Rgb;
  /** One per animation frame (or a single value for a still tile). */
  readonly radii: readonly number[];
}

/**
 * Light-emitting tiles, by tileset then tileId. Radii follow ribs-assets'
 * ranges (seal lamp 36–40, seal glyph 30–34 pulsing, sentinel-remains 13–16),
 * stepping with each tile's animation frames.
 */
const PART0_LIGHTS: Readonly<Record<number, TileLightSpec>> = {
  // Seal lamps (frames 38,39,40,41 / 40,41,38,39) — flicker.
  38: { offsetX: 8, offsetY: 8, tint: COLD_LIGHT, radii: [40, 37, 39, 36] },
  40: { offsetX: 8, offsetY: 8, tint: COLD_LIGHT, radii: [39, 36, 40, 37] },
  // Seal glyph 2x2 (34 is its top-left) — one light at the glyph's center, pulsing with 34's frames.
  34: { offsetX: 16, offsetY: 16, tint: COLD_LIGHT, radii: [30, 32, 34, 32] },
  // sentinel-remains' chest — glows on the second frame.
  47: { offsetX: 8, offsetY: 8, tint: COLD_LIGHT, radii: [13, 16] },
};

export const TILE_LIGHTS: Readonly<Record<string, Readonly<Record<number, TileLightSpec>>>> = {
  'dungeon-part0': PART0_LIGHTS,
  // Part 1 is part0's palette swap: same art, tile ids and animations (ribs-assets #24).
  'dungeon-part1': PART0_LIGHTS,
};

/** One TileLight entity per light-emitting tile placed on any of the map's art layers. */
export function spawnTileLights(world: World, map: TileMap, table: typeof TILE_LIGHTS = TILE_LIGHTS): void {
  for (const layer of map.layers) {
    if (layer.kind !== 'tiles' || layer.tileset === null) {
      continue;
    }
    const specs = table[layer.tileset];
    if (!specs) {
      continue;
    }
    const animations = map.tilesets.find((t) => t.name === layer.tileset)?.animations ?? {};
    for (const tile of layer.tiles) {
      const spec = specs[tile.tileId];
      if (!spec) {
        continue;
      }
      const frames = animations[tile.tileId];
      if (frames && spec.radii.length !== frames.length) {
        throw new Error(`TILE_LIGHTS["${layer.tileset}"][${tile.tileId}]: ${spec.radii.length} radii for a ${frames.length}-frame tile animation.`);
      }
      world.set(world.createEntity(), TileLight, {
        x: tile.column * ROOM_TILE_SIZE + spec.offsetX,
        y: tile.row * ROOM_TILE_SIZE + spec.offsetY,
        tint: spec.tint,
        radii: spec.radii,
        ...(frames ? { frameDurationsMs: frames.map((f) => f.durationMs) } : {}),
      });
    }
  }
}
