import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TileMapObjectLayer, TileMapTileLayer } from '@g-game-farm/engine-tilemap';
import { buildTiledTileMap } from './tiled-builder.js';
import type { TiledMapJson } from './tiled-map-json.js';

function tinyMap(overrides: Partial<TiledMapJson> = {}): TiledMapJson {
  return {
    type: 'map',
    tilewidth: 16,
    tileheight: 16,
    width: 3,
    height: 2,
    layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [0, 2, 3, 5, 0, 0] }],
    tilesets: [{ firstgid: 1, source: 'tiles.tsj' }],
    ...overrides,
  };
}

describe('buildTiledTileMap', () => {
  it('carries the grid extent and tile size through unchanged', () => {
    const result = buildTiledTileMap(tinyMap());
    expect(result.columns).toBe(3);
    expect(result.rows).toBe(2);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });

  it('skips empty cells (gid 0) and converts occupied ones to column/row/tileId, subtracting firstgid', () => {
    const result = buildTiledTileMap(tinyMap());
    const layer = result.layers[0] as TileMapTileLayer;
    expect(layer.kind).toBe('tiles');
    // data=[0,2,3,5,0,0] over a 3-wide grid: index1->(col1,row0) gid2->tileId1, index2->(col2,row0) gid3->tileId2, index3->(col0,row1) gid5->tileId4
    expect(layer.tiles).toEqual([
      { column: 1, row: 0, tileId: 1 },
      { column: 2, row: 0, tileId: 2 },
      { column: 0, row: 1, tileId: 4 },
    ]);
  });

  it('names an external tileset after its file (no directory, no extension), an embedded one by its own name', () => {
    const external = buildTiledTileMap(tinyMap({ tilesets: [{ firstgid: 1, source: '../tilesets/tiles.tsj' }] }));
    expect((external.layers[0] as TileMapTileLayer).tileset).toBe('tiles');
    const embedded = buildTiledTileMap(tinyMap({ tilesets: [{ firstgid: 1, name: 'dungeon' }] }));
    expect((embedded.layers[0] as TileMapTileLayer).tileset).toBe('dungeon');
  });

  it('resolves each layer against its own tileset when the map has several (artwork + a collision palette)', () => {
    const map = tinyMap({
      layers: [
        { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 2, 3, 0, 0, 0] },
        // collision palette starts at gid 101: 101 -> tileId 0, 102 -> tileId 1
        { type: 'tilelayer', name: 'collision', width: 3, height: 2, data: [102, 0, 102, 0, 101, 0] },
      ],
      tilesets: [
        { firstgid: 101, source: 'collision.tsj' }, // deliberately listed out of firstgid order
        { firstgid: 1, source: 'tiles.tsj' },
      ],
    });
    const [ground, collision] = buildTiledTileMap(map).layers as TileMapTileLayer[];
    expect(ground.tileset).toBe('tiles');
    expect(ground.tiles.map((t) => t.tileId)).toEqual([0, 1, 2]);
    expect(collision.tileset).toBe('collision');
    expect(collision.tiles).toEqual([
      { column: 0, row: 0, tileId: 1 },
      { column: 2, row: 0, tileId: 1 },
      { column: 1, row: 1, tileId: 0 },
    ]);
  });

  it('gives an all-empty tile layer a null tileset rather than guessing one', () => {
    const map = tinyMap({ layers: [{ type: 'tilelayer', name: 'collision', width: 3, height: 2, data: [0, 0, 0, 0, 0, 0] }] });
    const layer = buildTiledTileMap(map).layers[0] as TileMapTileLayer;
    expect(layer.tileset).toBeNull();
    expect(layer.tiles).toEqual([]);
  });

  it('throws when one layer mixes tilesets', () => {
    const map = tinyMap({
      layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [1, 101, 0, 0, 0, 0] }],
      tilesets: [
        { firstgid: 1, source: 'tiles.tsj' },
        { firstgid: 101, source: 'collision.tsj' },
      ],
    });
    expect(() => buildTiledTileMap(map)).toThrow(/mixes tilesets/);
  });

  it('throws on a gid that belongs to no tileset', () => {
    expect(() => buildTiledTileMap(tinyMap({ tilesets: [] }))).toThrow(/none of the map's tilesets/);
  });

  it('throws on a flipped/rotated tile instead of producing a garbage tileId', () => {
    const flippedHorizontally = 0x80000000 + 2;
    const map = tinyMap({ layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [0, flippedHorizontally, 0, 0, 0, 0] }] });
    expect(() => buildTiledTileMap(map)).toThrow(/flipped\/rotated.*column 1, row 0/);
  });

  it('throws on infinite maps and non-orthogonal maps', () => {
    expect(() => buildTiledTileMap(tinyMap({ infinite: true }))).toThrow(/infinite/);
    expect(() => buildTiledTileMap(tinyMap({ orientation: 'isometric' }))).toThrow(/orthogonal/);
    expect(() => buildTiledTileMap(tinyMap({ orientation: 'orthogonal', infinite: false }))).not.toThrow();
  });

  it('throws instead of silently misreading base64/compressed tile data', () => {
    const map = tinyMap({ layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 2, data: 'eJxjYAAAAAQAAQ==' }] });
    expect(() => buildTiledTileMap(map)).toThrow(/base64|compressed/);
  });

  it('converts an object layer, flattening Tiled\'s {name,type,value} property array into a plain record', () => {
    const map = tinyMap({
      layers: [
        {
          type: 'objectgroup',
          name: 'markers',
          objects: [
            {
              type: 'exit',
              x: 320,
              y: 48,
              width: 16,
              height: 32,
              properties: [
                { name: 'targetRoomId', type: 'string', value: 'room-b' },
                { name: 'locked', type: 'bool', value: true },
              ],
            },
          ],
        },
      ],
    });
    const result = buildTiledTileMap(map);
    const layer = result.layers[0] as TileMapObjectLayer;
    expect(layer.kind).toBe('objects');
    expect(layer.objects).toEqual([
      { type: 'exit', x: 320, y: 48, width: 16, height: 32, properties: { targetRoomId: 'room-b', locked: true } },
    ]);
  });

  it('defaults a missing properties array to an empty record rather than throwing', () => {
    const map = tinyMap({
      layers: [{ type: 'objectgroup', name: 'markers', objects: [{ type: 'entryPoint', x: 0, y: 0 }] }],
    });
    const layer = buildTiledTileMap(map).layers[0] as TileMapObjectLayer;
    expect(layer.objects[0].properties).toEqual({});
  });

  it('silently skips a layer kind this converter has no opinion about (e.g. imagelayer)', () => {
    const map = tinyMap({
      layers: [
        { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [0, 2, 0, 0, 0, 0] },
        { type: 'imagelayer' },
      ],
    });
    expect(buildTiledTileMap(map).layers).toHaveLength(1);
  });

  it('produces a sensible TileMap from the real test.tmj fixture saved from Tiled', () => {
    const raw = readFileSync(join(__dirname, '../../../maps/test.tmj'), 'utf8');
    const source = JSON.parse(raw) as TiledMapJson;

    const result = buildTiledTileMap(source);

    expect(result.columns).toBe(30);
    expect(result.rows).toBe(20);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
    expect(result.layers.map((l) => [l.kind, l.name])).toEqual([
      ['tiles', 'ground'],
      ['tiles', 'collision'],
      ['objects', 'markers'],
    ]);

    const [ground, collision, markers] = result.layers as [TileMapTileLayer, TileMapTileLayer, TileMapObjectLayer];
    expect(ground.tileset).toBe('tiles');
    // Confirmed by directly counting the fixture's own data array: 398 of 600 cells are non-zero
    // (295 floor + 103 wall), firstgid is 1 so gid 2/3 become tileId 1/2.
    expect(ground.tiles).toHaveLength(398);
    expect(ground.tiles.filter((t) => t.tileId === 1)).toHaveLength(295);
    expect(ground.tiles.filter((t) => t.tileId === 2)).toHaveLength(103);
    // The fixture's very first non-empty cell (data index 1, gid 3) is column 1, row 0.
    expect(ground.tiles[0]).toEqual({ column: 1, row: 0, tileId: 2 });

    // Collision palette starts at firstgid 101 — one solid tile (tileId 0) on every wall cell.
    expect(collision.tileset).toBe('collision');
    expect(collision.tiles).toHaveLength(103);
    expect(collision.tiles.every((t) => t.tileId === 0)).toBe(true);

    expect(markers.objects).toEqual([{ type: 'entryPoint', x: 224, y: 192, width: 0, height: 0, properties: { id: 'fromRoomB' } }]);
  });
});
