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
} as const;

export type RogueliteAssetKey = keyof typeof ROGUELITE_ASSET_MANIFEST;
