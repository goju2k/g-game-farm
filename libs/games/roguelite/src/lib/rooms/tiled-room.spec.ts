import type { TileMap, TileMapLayer, TileMapObject } from '@g-game-farm/engine-tilemap';
import { isAreaBlocked, isCellSolid } from '@g-game-farm/ribs';
import { testTileMap } from './maps/test.generated.js';
import { roomDataFromTileMap } from './tiled-room.js';

const collisionLayer = (tiles: readonly { column: number; row: number; tileId: number }[] = []): TileMapLayer => ({
  kind: 'tiles',
  name: 'collision',
  tileset: tiles.length ? 'collision' : null,
  tiles,
});
const markers = (...objects: TileMapObject[]): TileMapLayer => ({ kind: 'objects', name: 'markers', objects });
const entry = (id: string, x = 0, y = 0): TileMapObject => ({ type: 'entryPoint', x, y, width: 0, height: 0, properties: { id } });

function map(layers: readonly TileMapLayer[], overrides: Partial<TileMap> = {}): TileMap {
  return { columns: 3, rows: 2, tileWidth: 16, tileHeight: 16, layers, ...overrides };
}

describe('roomDataFromTileMap', () => {
  it('turns art layers into sprites (grid -> world at 16 units per cell, tileId -> tiles.png source rect), in layer order', () => {
    const data = roomDataFromTileMap(
      'r',
      map([
        { kind: 'tiles', name: 'floor', tileset: 'tiles', tiles: [{ column: 2, row: 1, tileId: 12 }] },
        { kind: 'tiles', name: 'decor', tileset: 'tiles', tiles: [{ column: 0, row: 0, tileId: 1 }] },
        collisionLayer(),
        markers(entry('start')),
      ]),
    );
    expect(data.tiles.sprites).toEqual([
      { x: 32, y: 16, sx: 32, sy: 16 },
      { x: 0, y: 0, sx: 16, sy: 0 },
    ]);
  });

  it('builds the collision grid from the collision layer alone — independent of what the art shows', () => {
    const data = roomDataFromTileMap(
      'r',
      map([
        // Art: wall-looking tiles on both (0,0) and (1,0)...
        { kind: 'tiles', name: 'ground', tileset: 'tiles', tiles: [{ column: 0, row: 0, tileId: 2 }, { column: 1, row: 0, tileId: 2 }] },
        // ...but only (0,0) is actually solid — (1,0) is a "secret passage".
        collisionLayer([{ column: 0, row: 0, tileId: 0 }]),
        markers(entry('start')),
      ]),
    );
    const grid = data.tiles.collision;
    expect(grid).toMatchObject({ originX: 0, originY: 0, cellSize: 16, columns: 3, rows: 2 });
    expect(isCellSolid(grid, 0, 0)).toBe(true);
    expect(isCellSolid(grid, 1, 0)).toBe(false);
  });

  it('reads entryPoint and exit objects in map pixel coordinates', () => {
    const data = roomDataFromTileMap(
      'r',
      map([
        collisionLayer(),
        markers(entry('start', 20, 30), {
          type: 'exit',
          x: 40,
          y: 0,
          width: 8,
          height: 16,
          properties: { id: 'east', targetRoomId: 'room-x', targetEntryId: 'west', lockedUnlessFlag: 'cleared' },
        }),
      ]),
    );
    expect(data.entryPoints).toEqual([{ id: 'start', position: { x: 20, y: 30 } }]);
    expect(data.exits).toEqual([
      {
        id: 'east',
        zone: { x: 40, y: 0, width: 8, height: 16 },
        targetRoomId: 'room-x',
        targetEntryId: 'west',
        lockedUnless: { kind: 'flag', flag: 'cleared' },
      },
    ]);
  });

  it.each([
    ['a non-16 tile size', map([collisionLayer(), markers(entry('s'))], { tileWidth: 32 }), /tile size/],
    ['no collision layer', map([markers(entry('s'))]), /no "collision" tile layer/],
    ['no entry point', map([collisionLayer()]), /no entryPoint/],
    ['an art layer on the wrong tileset', map([{ kind: 'tiles', name: 'ground', tileset: 'collision', tiles: [{ column: 0, row: 0, tileId: 0 }] }, collisionLayer(), markers(entry('s'))]), /expected "tiles"/],
    ['a collision tile outside the palette', map([collisionLayer([{ column: 0, row: 0, tileId: 5 }]), markers(entry('s'))]), /palette/],
    ['an unknown object type', map([collisionLayer(), markers(entry('s'), { type: 'chest', x: 1, y: 2, properties: {} })]), /unknown object type "chest"/],
    ['an exit without a target', map([collisionLayer(), markers(entry('s'), { type: 'exit', x: 0, y: 0, width: 8, height: 8, properties: { id: 'e' } })]), /targetRoomId/],
  ])('fails loudly, naming the room, on %s', (_label, badMap, message) => {
    expect(() => roomDataFromTileMap('room-z', badMap)).toThrow(message);
    expect(() => roomDataFromTileMap('room-z', badMap)).toThrow(/room "room-z"/);
  });

  it('reads the real Tiled-authored test map: walls block, the cave floor is open, entry lands on open floor', () => {
    const data = roomDataFromTileMap('room-c', testTileMap);
    const grid = data.tiles.collision;
    expect(data.tiles.sprites).toHaveLength(398);
    expect(isCellSolid(grid, 0, 2)).toBe(true); // 'W' at the start of row 2
    expect(isCellSolid(grid, 1, 2)).toBe(false); // 'f' right next to it
    expect(isCellSolid(grid, 0, 0)).toBe(false); // '.' — outside the cave but inside the map: nothing painted there
    expect(data.entryPoints).toEqual([{ id: 'fromRoomB', position: { x: 224, y: 192 } }]);
    expect(isAreaBlocked(grid, { x: 224, y: 192, width: 16, height: 16 })).toBe(false);
  });
});
