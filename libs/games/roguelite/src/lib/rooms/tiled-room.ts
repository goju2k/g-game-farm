import type { TileMap, TileMapObject, TileMapTileLayer, TileMapTileset } from '@g-game-farm/engine-tilemap';
import { COLLISION_EMPTY, COLLISION_SOLID, createCollisionGrid } from '@g-game-farm/ribs';
import { ROGUELITE_TILESET_IMAGES } from '../assets.js';
import type { RoomEntryPoint, RoomExit, RoomTileLayout, RoomTileSprite } from '../components.js';
import { ROOM_TILE_SIZE, tileSourceRect } from './tile-layout.js';

/**
 * This game's conventions for reading a TileMap as a room — documented for
 * map authors in maps/README.md. The engine's TileMap IR itself has no
 * opinion about any of this; these names only mean something here.
 */
export const COLLISION_LAYER_NAME = 'collision';
/** The collision palette — only ever painted on the collision layer. */
export const COLLISION_TILESET = 'collision';
/** Palette tileId -> CollisionGrid cell value. One entry today (a plain solid block); new shapes get new tiles here. */
const COLLISION_PALETTE: Readonly<Record<number, number>> = { 0: COLLISION_SOLID };

export interface TiledRoomData {
  readonly tiles: RoomTileLayout;
  readonly entryPoints: readonly RoomEntryPoint[];
  readonly exits: readonly RoomExit[];
}

function fail(roomId: string, message: string): never {
  throw new Error(`room "${roomId}": ${message}`);
}

function stringProperty(roomId: string, object: TileMapObject, name: string, required: true): string;
function stringProperty(roomId: string, object: TileMapObject, name: string, required: false): string | undefined;
function stringProperty(roomId: string, object: TileMapObject, name: string, required: boolean): string | undefined {
  const value = object.properties[name];
  if (value === undefined && !required) {
    return undefined;
  }
  if (typeof value !== 'string' || value === '') {
    fail(roomId, `${object.type} object at (${object.x}, ${object.y}) needs a non-empty string property "${name}".`);
  }
  return value;
}

function checkTileset(roomId: string, layer: TileMapTileLayer, expected: string): void {
  if (layer.tileset !== null && layer.tileset !== expected) {
    fail(roomId, `tile layer "${layer.name}" uses tileset "${layer.tileset}", expected "${expected}".`);
  }
}

/** The artwork tileset a layer draws from — must be declared by the map and have a texture in ROGUELITE_TILESET_IMAGES. */
function artTileset(roomId: string, map: TileMap, layer: TileMapTileLayer): TileMapTileset {
  if (layer.tileset === COLLISION_TILESET) {
    fail(roomId, `tile layer "${layer.name}" uses the "${COLLISION_TILESET}" palette — only the "${COLLISION_LAYER_NAME}" layer may.`);
  }
  const tileset = map.tilesets.find((t) => t.name === layer.tileset);
  if (!tileset) {
    fail(roomId, `tile layer "${layer.name}" uses tileset "${layer.tileset}", which the map doesn't declare.`);
  }
  if (!(tileset.name in ROGUELITE_TILESET_IMAGES)) {
    fail(roomId, `tileset "${tileset.name}" has no image registered — add it to ROGUELITE_TILESET_IMAGES (assets.ts).`);
  }
  return tileset;
}

/** One placed tile as a sprite — with its frames when the tileset animates that tileId. */
function tileSprite(column: number, row: number, tileId: number, tileset: TileMapTileset): RoomTileSprite {
  const animation = tileset.animations[tileId];
  return {
    x: column * ROOM_TILE_SIZE,
    y: row * ROOM_TILE_SIZE,
    tileset: tileset.name,
    ...tileSourceRect(tileId, tileset.columns),
    ...(animation ? { frames: animation.map((f) => ({ ...tileSourceRect(f.tileId, tileset.columns), durationMs: f.durationMs })) } : {}),
  };
}

/**
 * Reads a TileMap (built from a Tiled .tmj at build time — see
 * scripts/build-maps.ts) as this game's room data. Pure and fail-loud: any
 * map that breaks the conventions above throws with the room id and what's
 * wrong, at scene-registration time rather than as a silently broken room.
 *
 * Coordinates: the map's top-left is world (0,0) and one map pixel is one
 * world unit — tiles sit edge to edge at ROOM_TILE_SIZE, so Tiled's own
 * pixel coordinates for objects are used as-is.
 */
export function roomDataFromTileMap(roomId: string, map: TileMap): TiledRoomData {
  if (map.tileWidth !== ROOM_TILE_SIZE || map.tileHeight !== ROOM_TILE_SIZE) {
    fail(roomId, `tile size must be ${ROOM_TILE_SIZE}x${ROOM_TILE_SIZE}, got ${map.tileWidth}x${map.tileHeight}.`);
  }

  const sprites: RoomTileSprite[] = [];
  let collisionLayer: TileMapTileLayer | undefined;
  const entryPoints: RoomEntryPoint[] = [];
  const exits: RoomExit[] = [];

  for (const layer of map.layers) {
    if (layer.kind === 'tiles') {
      if (layer.name === COLLISION_LAYER_NAME) {
        if (collisionLayer) {
          fail(roomId, `more than one "${COLLISION_LAYER_NAME}" layer.`);
        }
        checkTileset(roomId, layer, COLLISION_TILESET);
        collisionLayer = layer;
        continue;
      }
      if (layer.tileset === null) {
        continue; // an empty layer — nothing to draw
      }
      const tileset = artTileset(roomId, map, layer);
      for (const tile of layer.tiles) {
        if (tile.tileId >= tileset.tileCount) {
          fail(roomId, `tile layer "${layer.name}" has tileId ${tile.tileId} at column ${tile.column}, row ${tile.row} — tileset "${tileset.name}" has ${tileset.tileCount}.`);
        }
        sprites.push(tileSprite(tile.column, tile.row, tile.tileId, tileset));
      }
      continue;
    }

    for (const object of layer.objects) {
      if (object.type === 'entryPoint') {
        entryPoints.push({ id: stringProperty(roomId, object, 'id', true), position: { x: object.x, y: object.y } });
      } else if (object.type === 'exit') {
        if (!object.width || !object.height) {
          fail(roomId, `exit object at (${object.x}, ${object.y}) must be a rectangle with a size.`);
        }
        const lockedUnlessFlag = stringProperty(roomId, object, 'lockedUnlessFlag', false);
        exits.push({
          id: stringProperty(roomId, object, 'id', true),
          zone: { x: object.x, y: object.y, width: object.width, height: object.height },
          targetRoomId: stringProperty(roomId, object, 'targetRoomId', true),
          targetEntryId: stringProperty(roomId, object, 'targetEntryId', true),
          ...(lockedUnlessFlag === undefined ? {} : { lockedUnless: { kind: 'flag' as const, flag: lockedUnlessFlag } }),
        });
      } else {
        fail(roomId, `unknown object type "${object.type}" at (${object.x}, ${object.y}) in layer "${layer.name}".`);
      }
    }
  }

  if (!collisionLayer) {
    fail(roomId, `no "${COLLISION_LAYER_NAME}" tile layer — every room needs one (an empty layer is fine if nothing blocks).`);
  }
  if (entryPoints.length === 0) {
    fail(roomId, 'no entryPoint object — the player would have nowhere to appear.');
  }

  const cells: number[] = new Array<number>(map.columns * map.rows).fill(COLLISION_EMPTY);
  for (const tile of collisionLayer.tiles) {
    const value = COLLISION_PALETTE[tile.tileId];
    if (value === undefined) {
      fail(roomId, `collision tile ${tile.tileId} at column ${tile.column}, row ${tile.row} isn't in the collision palette.`);
    }
    cells[tile.row * map.columns + tile.column] = value;
  }

  return {
    tiles: {
      sprites,
      collision: createCollisionGrid({ originX: 0, originY: 0, cellSize: ROOM_TILE_SIZE, columns: map.columns, rows: map.rows, cells }),
    },
    entryPoints,
    exits,
  };
}
