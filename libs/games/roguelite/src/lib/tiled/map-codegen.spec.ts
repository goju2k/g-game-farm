import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportNameFor, generatedModulePathFor, tileMapModuleSource } from './map-codegen.js';
import { buildTiledTileMap } from './tiled-builder.js';
import type { TiledMapJson } from './tiled-map-json.js';

const packageRoot = join(__dirname, '../../..');
const mapFileNames = readdirSync(join(packageRoot, 'maps')).filter((name) => name.endsWith('.tmj'));

describe('map codegen', () => {
  it('names exports and output paths after the map file', () => {
    expect(exportNameFor('test.tmj')).toBe('testTileMap');
    expect(exportNameFor('room-c.tmj')).toBe('roomCTileMap');
    expect(generatedModulePathFor('room-c.tmj')).toBe('src/lib/rooms/maps/room-c.generated.ts');
  });

  it('finds at least one map to check', () => {
    expect(mapFileNames.length).toBeGreaterThan(0);
  });

  // The generated modules are committed; this is what catches "edited the .tmj, forgot to regenerate".
  it.each(mapFileNames)('committed module for maps/%s is up to date — if not, run: npx nx run roguelite:build-maps', (mapFileName) => {
    const source = JSON.parse(readFileSync(join(packageRoot, 'maps', mapFileName), 'utf8')) as TiledMapJson;
    const expected = tileMapModuleSource(mapFileName, buildTiledTileMap(source));
    const committed = readFileSync(join(packageRoot, generatedModulePathFor(mapFileName)), 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(expected);
  });
});
