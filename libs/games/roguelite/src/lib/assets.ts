/**
 * Key -> path, relative to this game's asset base. Deliberately no base URL
 * — resolving one (Next.js `public/`, a future nw.js file root, ...) is
 * host knowledge, not game knowledge. Path values preserve the pre-engine
 * repo's convention verbatim (see e.g. AniMetaZag.ts's `src` fields) so
 * later porting steps (player animation, monsters) can reuse them as-is.
 */
export const ROGUELITE_ASSET_MANIFEST = {
  player: 'characters/player.png',
  zag: 'characters/monster/zag/zag.png',
  doltan: 'characters/monster/doltan/doltan.png',
  ghost: 'characters/monster/ghost/ghost.png',
  grass: 'characters/monster/grass/grass.png',
  tiles: 'map/tiles.png',
} as const;

export type RogueliteAssetKey = keyof typeof ROGUELITE_ASSET_MANIFEST;

/**
 * Map tileset name (a Tiled tileset's identity — see tiled-builder.ts) ->
 * its image, relative to the same asset base. A Tiled room may only use
 * tilesets listed here (rooms/tiled-room.ts checks), and the tilemap
 * renderer gets one texture per entry. A delivered tileset lives as-is
 * under map/<id>/ (its .tsj next to its .png).
 */
export const ROGUELITE_TILESET_IMAGES: Readonly<Record<string, string>> = {
  tiles: 'map/tiles.png',
};
