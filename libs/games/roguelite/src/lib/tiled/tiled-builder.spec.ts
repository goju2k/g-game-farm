import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TileMapObjectLayer, TileMapTileLayer } from '@g-game-farm/engine-tilemap';
import { buildTiledTileMap } from './tiled-builder.js';
import type { TiledMapJson, TiledTilesetJson } from './tiled-map-json.js';

/** Any external .tsj these tests reference reads as a plain 10x10 16px tileset unless a test supplies its own. */
const PLAIN_TILESET: TiledTilesetJson = { tilewidth: 16, tileheight: 16, columns: 10, tilecount: 100 };
const readPlain = () => PLAIN_TILESET;

function build(map: TiledMapJson, read: (source: string) => TiledTilesetJson = readPlain) {
  return buildTiledTileMap(map, read);
}

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
    const result = build(tinyMap());
    expect(result.columns).toBe(3);
    expect(result.rows).toBe(2);
    expect(result.tileWidth).toBe(16);
    expect(result.tileHeight).toBe(16);
  });

  it('skips empty cells (gid 0) and converts occupied ones to column/row/tileId, subtracting firstgid', () => {
    const result = build(tinyMap());
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
    const external = build(tinyMap({ tilesets: [{ firstgid: 1, source: '../tilesets/tiles.tsj' }] }));
    expect((external.layers[0] as TileMapTileLayer).tileset).toBe('tiles');
    const embedded = build(tinyMap({ tilesets: [{ firstgid: 1, name: 'dungeon', ...PLAIN_TILESET }] }));
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
    const [ground, collision] = build(map).layers as TileMapTileLayer[];
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
    const layer = build(map).layers[0] as TileMapTileLayer;
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
    expect(() => build(map)).toThrow(/mixes tilesets/);
  });

  it('throws on a gid that belongs to no tileset', () => {
    expect(() => build(tinyMap({ tilesets: [] }))).toThrow(/none of the map's tilesets/);
  });

  it('throws on a flipped/rotated tile instead of producing a garbage tileId', () => {
    const flippedHorizontally = 0x80000000 + 2;
    const map = tinyMap({ layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [0, flippedHorizontally, 0, 0, 0, 0] }] });
    expect(() => build(map)).toThrow(/flipped\/rotated.*column 1, row 0/);
  });

  it('throws on infinite maps and non-orthogonal maps', () => {
    expect(() => build(tinyMap({ infinite: true }))).toThrow(/infinite/);
    expect(() => build(tinyMap({ orientation: 'isometric' }))).toThrow(/orthogonal/);
    expect(() => build(tinyMap({ orientation: 'orthogonal', infinite: false }))).not.toThrow();
  });

  it('throws instead of silently misreading base64/compressed tile data', () => {
    const map = tinyMap({ layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 2, data: 'eJxjYAAAAAQAAQ==' }] });
    expect(() => build(map)).toThrow(/base64|compressed/);
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
    const result = build(map);
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
    const layer = build(map).layers[0] as TileMapObjectLayer;
    expect(layer.objects[0].properties).toEqual({});
  });

  it('silently skips a layer kind this converter has no opinion about (e.g. imagelayer)', () => {
    const map = tinyMap({
      layers: [
        { type: 'tilelayer', name: 'ground', width: 3, height: 2, data: [0, 2, 0, 0, 0, 0] },
        { type: 'imagelayer' },
      ],
    });
    expect(build(map).layers).toHaveLength(1);
  });

  it('produces a sensible TileMap from the real test.tmj fixture saved from Tiled', () => {
    const raw = readFileSync(join(__dirname, '../../../maps/test.tmj'), 'utf8');
    const source = JSON.parse(raw) as TiledMapJson;

    const result = build(source);

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

  describe('tilesets', () => {
    const animated: TiledTilesetJson = {
      tilewidth: 16,
      tileheight: 16,
      columns: 8,
      tilecount: 16,
      tiles: [
        { id: 3, animation: [{ tileid: 3, duration: 120 }, { tileid: 4, duration: 80 }] },
        { id: 5 }, // per-tile data without an animation (e.g. a Wang/type entry) is ignored
      ],
    };

    it('reads each external tileset through the reader, by the path written in the map', () => {
      const sources: string[] = [];
      const map = build(tinyMap({ tilesets: [{ firstgid: 1, source: '../public/game/map/dungeon/dungeon.tsj' }] }), (source) => {
        sources.push(source);
        return animated;
      });
      expect(sources).toEqual(['../public/game/map/dungeon/dungeon.tsj']);
      expect(map.tilesets).toEqual([{ name: 'dungeon', columns: 8, tileCount: 16, animations: { 3: [{ tileId: 3, durationMs: 120 }, { tileId: 4, durationMs: 80 }] } }]);
    });

    it('reads an embedded tileset from the map itself', () => {
      const map = build(tinyMap({ tilesets: [{ firstgid: 1, name: 'inline', ...animated }] }), () => {
        throw new Error('should not read a file');
      });
      expect(map.tilesets[0]).toMatchObject({ name: 'inline', columns: 8, tileCount: 16 });
    });

    it('needs a reader for an external tileset', () => {
      expect(() => buildTiledTileMap(tinyMap())).toThrow(/external — pass readExternalTileset/);
    });

    it("rejects a tileset whose grid doesn't fit the map", () => {
      expect(() => build(tinyMap(), () => ({ ...PLAIN_TILESET, tilewidth: 32 }))).toThrow(/tile size 32x16 differs/);
      expect(() => build(tinyMap(), () => ({ ...PLAIN_TILESET, spacing: 1 }))).toThrow(/margin\/spacing must be 0/);
    });

    it('rejects broken animations', () => {
      const withFrames = (frames: { tileid: number; duration: number }[]) => () => ({ ...PLAIN_TILESET, tiles: [{ id: 0, animation: frames }] });
      expect(() => build(tinyMap(), withFrames([{ tileid: 100, duration: 100 }]))).toThrow(/tileid 100, outside 0\.\.99/);
      expect(() => build(tinyMap(), withFrames([{ tileid: 1, duration: 0 }]))).toThrow(/duration 0/);
    });
  });
});
