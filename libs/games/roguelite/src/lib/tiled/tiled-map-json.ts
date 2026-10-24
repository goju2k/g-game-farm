/**
 * The subset of Tiled's own JSON export schema (https://doc.mapeditor.org/en/stable/reference/json-map-format/)
 * this game's converter actually reads — deliberately NOT a full mirror of
 * everything Tiled can produce (compressed/base64 tile data, image layers,
 * group layers, infinite maps, flipped tiles aren't modeled — see
 * tiled-builder.ts for which of these it fails loudly on vs. silently
 * ignores). This type only exists to give buildTiledTileMap() something
 * typed to read from; it is never the shape game code consumes directly —
 * that's TileMap (see @g-game-farm/engine-tilemap), which this file's
 * builder converts into.
 */

export interface TiledPropertyJson {
  readonly name: string;
  readonly type: string;
  readonly value: string | number | boolean;
}

export interface TiledTileLayerJson {
  readonly type: 'tilelayer';
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /**
   * Row-major GIDs, index = row*width + col. GID 0 = empty cell. Tiled can
   * also export this as a base64 (optionally zlib/gzip-compressed) string
   * instead of a plain number array, depending on the map's own export
   * settings — buildTiledTileMap() throws rather than silently
   * mis-reading if it ever sees that shape here.
   */
  readonly data: readonly number[] | string;
}

export interface TiledObjectJson {
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly properties?: readonly TiledPropertyJson[];
}

export interface TiledObjectLayerJson {
  readonly type: 'objectgroup';
  readonly name: string;
  readonly objects: readonly TiledObjectJson[];
}

/**
 * Tiled has more layer kinds (imagelayer, group) than this — buildTiledTileMap()
 * silently skips any layer whose `type` isn't one of these two, matched
 * against this third, minimal fallback shape. `type: string` here is
 * deliberately too wide to discriminate against the other two members by
 * structural narrowing alone (TiledTileLayerJson/TiledObjectLayerJson's
 * `type` literals are still valid `string`s) — buildTiledTileMap() checks
 * `layer.type` and then casts, rather than relying on control-flow
 * narrowing to resolve a fundamentally ambiguous union on its own.
 */
export type TiledLayerJson = TiledTileLayerJson | TiledObjectLayerJson | { readonly type: string };

/** One entry of a map's `tilesets`: an external reference (`source`), or an embedded tileset (TiledTilesetJson's fields inline). */
export interface TiledTilesetRefJson extends Partial<TiledTilesetJson> {
  readonly firstgid: number;
  /** Present for an external tileset (.tsj) reference — the path, relative to the map file. Its basename (no extension) is the tileset's identity. */
  readonly source?: string;
}

export interface TiledMapJson {
  readonly type: 'map';
  /** Only "orthogonal" is supported — isometric/staggered/hexagonal grids would need a different column/row -> world mapping. */
  readonly orientation?: string;
  /** An infinite map stores tile layers as `chunks` instead of `data` — not supported. */
  readonly infinite?: boolean;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly TiledLayerJson[];
  readonly tilesets: readonly TiledTilesetRefJson[];
}

export interface TiledTileAnimationFrameJson {
  /** Local tile id within the same tileset. */
  readonly tileid: number;
  /** ms */
  readonly duration: number;
}

/** Per-tile extras. Only `animation` is read; Tiled also puts type/properties/wang data here, which this game ignores. */
export interface TiledTileJson {
  readonly id: number;
  readonly animation?: readonly TiledTileAnimationFrameJson[];
}

/**
 * A tileset's definition — the contents of an external .tsj, or the inline
 * fields of an embedded tileset ref. Only what's needed to resolve a tileId
 * to a source rect and to animate it.
 */
export interface TiledTilesetJson {
  readonly name?: string;
  readonly tilewidth: number;
  readonly tileheight: number;
  readonly columns: number;
  readonly tilecount: number;
  readonly margin?: number;
  readonly spacing?: number;
  readonly tiles?: readonly TiledTileJson[];
}
