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
  'dungeon-part0': 'map/dungeon-part0/dungeon-part0.png',
  'dungeon-part1': 'map/dungeon-part1/dungeon-part1.png',
  // UI sheets (not tilesets — plain images with a fixed layout, see combat/damage-ui.ts): D-044.
  'ui-hpbar': 'ui/ui-hpbar/ui-hpbar.png',
  'ui-digits': 'ui/ui-digits/ui-digits.png',
};

/** Anim assets loaded at startup, id -> folder under the asset base (<folder>/<id>.anim.json) — see anim/anim-asset.ts. */
export const ROGUELITE_ANIM_ASSETS: Readonly<Record<string, string>> = {
  'player-child': 'characters/player-child',
  'sentinel-melee': 'characters/sentinel-melee',
  'sentinel-awakened': 'characters/sentinel-awakened',
  'fx-fireball': 'fx/fx-fireball',
  'fx-hit': 'fx/fx-hit',
  'fx-seal-shards': 'fx/fx-seal-shards',
  'fx-fire-pillar': 'fx/fx-fire-pillar',
  'fx-fire-fan': 'fx/fx-fire-fan',
  'fx-fire-pillar-big': 'fx/fx-fire-pillar-big',
  'fx-fire-pillar-quick': 'fx/fx-fire-pillar-quick',
  'fx-focus': 'fx/fx-focus',
  'ui-combo': 'ui/ui-combo',
  'prop-brazier': 'props/prop-brazier',
  'prop-brazier-socket': 'props/prop-brazier-socket',
  'prop-seal-door': 'props/prop-seal-door',
  'prop-cracked-wall': 'props/prop-cracked-wall',
  'prop-skill-pedestal': 'props/prop-skill-pedestal',
  'prop-robe': 'props/prop-robe',
  'fx-radiance': 'fx/fx-radiance',
  'player-ember': 'characters/player-ember',
  'prop-wall-crystal': 'props/prop-wall-crystal',
  'prop-cracked-wall-wide': 'props/prop-cracked-wall-wide',
  'prop-crystal-staff': 'props/prop-crystal-staff',
  'fx-merge': 'fx/fx-merge',
  'fx-wind': 'fx/fx-wind',
  emote: 'fx/emote',
  companion: 'characters/companion',
  vine: 'props/vine',
  'artifact-spark-of-being': 'props/artifact-spark-of-being',
  'artifact-small-flame-core': 'props/artifact-small-flame-core',
};
