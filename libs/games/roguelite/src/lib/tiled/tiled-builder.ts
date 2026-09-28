import type { TileMap, TileMapBuilder, TileMapLayer, TileMapObject, TileMapTileLayer, TileMapTilePlacement } from '@g-game-farm/engine-tilemap';
import type { TiledMapJson, TiledObjectJson, TiledObjectLayerJson, TiledPropertyJson, TiledTileLayerJson, TiledTilesetRefJson } from './tiled-map-json.js';

/** Tiled stores flip/rotation in a GID's top 4 bits (H/V/diagonal flip, hex 120° rotation) — any GID at or above this has at least one set. */
const TILED_GID_FLAG_THRESHOLD = 0x10000000;

interface ResolvedTileset {
  readonly name: string;
  readonly firstgid: number;
}

/** An embedded tileset's own name, else the external file's basename without extension ("../x/test-room.tsj" -> "test-room"). */
function tilesetName(ref: TiledTilesetRefJson): string {
  if (ref.name !== undefined) {
    return ref.name;
  }
  if (ref.source !== undefined) {
    const fileName = ref.source.split(/[\\/]/).pop() ?? ref.source;
    return fileName.replace(/\.[^.]+$/, '');
  }
  throw new Error(`buildTiledTileMap: tileset at firstgid ${ref.firstgid} has neither a "name" nor a "source".`);
}

/** Sorted by firstgid descending, so the first entry with firstgid <= gid is the one that gid belongs to. */
function resolveTilesets(refs: readonly TiledTilesetRefJson[]): readonly ResolvedTileset[] {
  return refs.map((ref) => ({ name: tilesetName(ref), firstgid: ref.firstgid })).sort((a, b) => b.firstgid - a.firstgid);
}

function toTileLayer(layer: TiledTileLayerJson, tilesets: readonly ResolvedTileset[]): TileMapTileLayer {
  const { data } = layer;
  if (typeof data === 'string') {
    throw new Error(
      `buildTiledTileMap: layer "${layer.name}"'s data is a base64/compressed string, not a plain array — re-export the map with Tiled's "CSV" or uncompressed tile layer format (the default for JSON export).`,
    );
  }
  const tiles: TileMapTilePlacement[] = [];
  let layerTileset: ResolvedTileset | null = null;
  for (let i = 0; i < data.length; i++) {
    const gid = data[i];
    if (gid === 0) {
      continue; // empty cell — TileMap's own contract is a sparse list, no "no tile" entries
    }
    if (gid >= TILED_GID_FLAG_THRESHOLD) {
      throw new Error(
        `buildTiledTileMap: layer "${layer.name}" has a flipped/rotated tile at column ${i % layer.width}, row ${Math.floor(i / layer.width)} — TileMap has no flip/rotation, un-flip it in Tiled.`,
      );
    }
    const tileset = tilesets.find((candidate) => candidate.firstgid <= gid);
    if (tileset === undefined) {
      throw new Error(`buildTiledTileMap: layer "${layer.name}" references gid ${gid}, which belongs to none of the map's tilesets.`);
    }
    if (layerTileset === null) {
      layerTileset = tileset;
    } else if (layerTileset !== tileset) {
      throw new Error(
        `buildTiledTileMap: layer "${layer.name}" mixes tilesets "${layerTileset.name}" and "${tileset.name}" — TileMap allows one tileset per layer; split it into separate layers.`,
      );
    }
    tiles.push({ column: i % layer.width, row: Math.floor(i / layer.width), tileId: gid - tileset.firstgid });
  }
  return { kind: 'tiles', name: layer.name, tileset: layerTileset?.name ?? null, tiles };
}

function toTileMapProperties(properties: readonly TiledPropertyJson[] | undefined): Readonly<Record<string, string | number | boolean>> {
  return Object.fromEntries((properties ?? []).map((property) => [property.name, property.value]));
}

function toTileMapObject(object: TiledObjectJson): TileMapObject {
  return {
    type: object.type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    properties: toTileMapProperties(object.properties),
  };
}

/**
 * Converts one Tiled JSON map export into the engine's tool-agnostic
 * TileMap IR — see @g-game-farm/engine-tilemap for why that IR exists and
 * what it deliberately doesn't know about Tiled. A pure function: `source`
 * is already-parsed JSON, nothing here reads a file.
 *
 * Any number of tilesets per map, but each tile layer must draw from just
 * one of them (TileMap's own per-layer-tileset contract) — which is exactly
 * how a metadata layer like "collision" gets its own small palette next to
 * the artwork layers' tiles.png. Silently skips any layer that isn't a tile
 * layer or an object layer (Tiled's image/group layers aren't a concept
 * this game's rooms use); fails loudly on anything it would otherwise
 * misread (compressed data, infinite maps, non-orthogonal grids,
 * flipped/rotated tiles).
 *
 * Never reads an external tileset (.tsj/.tsx) file even when one is
 * referenced — a tileset's identity is its name/path and a tileId is just
 * `gid - firstgid`; neither needs the file's contents. Per-tile meaning
 * lives in separate layers, not in per-tile tileset properties, so there's
 * nothing else in there worth reading (resolving a tileId to an actual
 * source rect in a texture is the room adapter's job, further downstream).
 */
export function buildTiledTileMap(source: TiledMapJson): TileMap {
  if (source.orientation !== undefined && source.orientation !== 'orthogonal') {
    throw new Error(`buildTiledTileMap: orientation "${source.orientation}" isn't supported — only orthogonal maps.`);
  }
  if (source.infinite === true) {
    throw new Error('buildTiledTileMap: infinite maps (chunked tile data) aren\'t supported — uncheck "Infinite" in Tiled\'s map properties.');
  }
  const tilesets = resolveTilesets(source.tilesets);

  const layers: TileMapLayer[] = [];
  for (const layer of source.layers) {
    // See TiledLayerJson's doc comment for why this needs an explicit cast rather than relying on
    // `layer.type === '...'` to narrow the union on its own.
    if (layer.type === 'tilelayer') {
      layers.push(toTileLayer(layer as TiledTileLayerJson, tilesets));
    } else if (layer.type === 'objectgroup') {
      const objectLayer = layer as TiledObjectLayerJson;
      layers.push({ kind: 'objects', name: objectLayer.name, objects: objectLayer.objects.map(toTileMapObject) });
    }
  }

  return { tileWidth: source.tilewidth, tileHeight: source.tileheight, layers };
}

export const tiledMapBuilder: TileMapBuilder<TiledMapJson> = { build: buildTiledTileMap };
