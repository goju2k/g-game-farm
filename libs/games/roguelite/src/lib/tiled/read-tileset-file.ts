import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ReadExternalTileset } from './tiled-builder.js';
import type { TiledTilesetJson } from './tiled-map-json.js';

/**
 * Node-only (build script + codegen test, never the game bundle): reads a
 * map's external .tsj references relative to the map file itself, the same
 * way Tiled resolves them.
 */
export function tilesetReaderFor(mapFilePath: string): ReadExternalTileset {
  return (source) => JSON.parse(readFileSync(join(dirname(mapFilePath), source), 'utf8')) as TiledTilesetJson;
}
