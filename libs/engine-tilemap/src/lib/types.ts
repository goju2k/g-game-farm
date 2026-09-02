/**
 * A tool-agnostic, normalized representation of "some 2D tile-based level
 * someone authored" — mirrors the animation system's own precedent
 * (SpriteAnimation is the engine's own format, deliberately not the raw
 * Aseprite JSON schema): the engine defines this shape once, and any map
 * editor's export format gets converted INTO it by a TileMapBuilder, never
 * consumed directly by game code. Nothing here is Tiled-specific — Tiled is
 * just the first (and, for now, only) source format a builder targets; a
 * different editor's builder produces the exact same TileMap shape.
 *
 * This is a design-time/build-time data contract, not a runtime engine
 * capability — it has no relationship to World/Engine/System/tick(). A
 * TileMapBuilder is a pure `source -> TileMap` function (no file I/O of its
 * own), so reading a map file off disk is the caller's job, keeping builders
 * trivially unit-testable against an already-parsed source object.
 */

/**
 * One placed tile, in GRID coordinates (column/row — NOT world units or
 * pixels). Converting a grid position into world-space is a decision that
 * depends on a specific game's tile spacing/origin/overlap conventions (see
 * e.g. roguelite's rooms/tile-layout.ts), so it deliberately happens in the
 * game-specific TileMap -> room-data adapter, not here. Only occupied cells
 * are ever present — a builder omits empty cells (Tiled's GID 0) rather
 * than emitting a "no tile" sentinel, so `tiles` is always a sparse list.
 */
export interface TileMapTilePlacement {
  readonly column: number;
  readonly row: number;
  /** Which tile from the map's tileset — meaning is defined by whatever tileset the source format referenced; this IR doesn't interpret it. */
  readonly tileId: number;
}

export interface TileMapTileLayer {
  readonly kind: 'tiles';
  readonly name: string;
  readonly tiles: readonly TileMapTilePlacement[];
}

/**
 * One authored marker — a room exit, an entry point, a monster/NPC/pickup
 * spawn, or anything else a game wants to place declaratively. `type` and
 * `properties` are completely open-ended on purpose: this IR doesn't know
 * or care what a "monsterSpawn" is, only that some object layer placed one
 * at (x, y) with a bag of properties — interpreting `type`/`properties` is
 * entirely the consuming game's job. Position (and size, for a rectangle
 * object) is in world/pixel units directly, unlike tile placements — this
 * matches how Tiled itself treats object layers (pixel-positioned) versus
 * tile layers (grid-indexed), not an arbitrary choice made here.
 */
export interface TileMapObject {
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

export interface TileMapObjectLayer {
  readonly kind: 'objects';
  readonly name: string;
  readonly objects: readonly TileMapObject[];
}

export type TileMapLayer = TileMapTileLayer | TileMapObjectLayer;

export interface TileMap {
  /** One tile size for the whole map — every layer's tileId/column/row is interpreted against it. Multiple tilesets/tile sizes per map isn't a case any current source format or game needs; not modeled here. */
  readonly tileWidth: number;
  readonly tileHeight: number;
  /** Back-to-front order, same convention as the engine's own render LayerConfig stack. */
  readonly layers: readonly TileMapLayer[];
}

/**
 * Converts one source map-editor's own format into the normalized TileMap
 * shape above. A pure function — no file reading, no game-specific
 * interpretation of `TileMapObject.type`/`properties` (that's the next step
 * downstream, in a game's own TileMap -> room-data adapter). Implement one
 * per source format (Tiled today; nothing here assumes there will only ever
 * be one).
 */
export interface TileMapBuilder<TSource> {
  build(source: TSource): TileMap;
}
