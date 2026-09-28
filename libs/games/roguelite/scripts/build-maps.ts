/**
 * Build-time map conversion: every maps/*.tmj (Tiled JSON) -> engine TileMap
 * IR -> a generated TS module under src/lib/rooms/maps/. The game only ever
 * imports the generated modules — no Tiled types or JSON parsing at runtime.
 * Generated files are committed; map-codegen.spec.ts fails if one is stale.
 *
 * Run: npx nx run roguelite:build-maps
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatedModulePathFor, tileMapModuleSource } from '../src/lib/tiled/map-codegen.ts';
import { buildTiledTileMap } from '../src/lib/tiled/tiled-builder.ts';
import type { TiledMapJson } from '../src/lib/tiled/tiled-map-json.ts';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapsDir = join(packageRoot, 'maps');

for (const mapFileName of readdirSync(mapsDir).filter((name) => name.endsWith('.tmj'))) {
  const source = JSON.parse(readFileSync(join(mapsDir, mapFileName), 'utf8')) as TiledMapJson;
  const outPath = join(packageRoot, generatedModulePathFor(mapFileName));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, tileMapModuleSource(mapFileName, buildTiledTileMap(source)));
  console.log(`maps/${mapFileName} -> ${generatedModulePathFor(mapFileName)}`);
}
