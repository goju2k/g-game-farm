/**
 * Logical spawn-bounds box size (world units) monsters are scattered across
 * — old pre-engine repo's OpeningWorld: numberOfTiles:[32,32] * tileSize:15
 * = 480 (WorldBase's width/height are exactly tileSize * numberOfTiles[i],
 * no further transform). No tilemap/rendering exists yet (that's porting
 * step 7) — this is spawn-position math only.
 *
 * Centered on world-origin ([-WORLD_SIZE/2, WORLD_SIZE/2) on both axes),
 * not the old game's absolute [0,480) box: this port's player spawns near
 * world-origin (bootstrap.ts's playerSpawnX/Y = (-9,-9)), not at any
 * map-center point the way the old game's player did (world.widthHalf,
 * world.heightHalf) — centering here preserves the old game's actual
 * relationship ("the player starts at the spawn box's center") without
 * requiring an unrelated absolute-coordinate convention the old game only
 * had because of how it happened to define its map's origin.
 *
 * Step 7's tilemap should reuse this same constant rather than inventing a
 * new one.
 */
export const WORLD_SIZE = 480;
