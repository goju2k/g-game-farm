/**
 * Logical spawn-bounds box size (world units) monsters are scattered across
 * — old pre-engine repo's OpeningWorld: numberOfTiles:[32,32] * tileSize:15
 * = 480 (WorldBase's width/height are exactly tileSize * numberOfTiles[i],
 * no further transform). Pure spawn-position math, independent of any
 * room's tile grid — it only has to fit inside the room that spawns waves
 * (room-a spans -256..256, so this box sits comfortably within its walls).
 *
 * Centered on world-origin ([-WORLD_SIZE/2, WORLD_SIZE/2) on both axes),
 * not the old game's absolute [0,480) box: this port's player spawns near
 * world-origin (room-a's 'start' entry point, (-9,-9)), not at any
 * map-center point the way the old game's player did (world.widthHalf,
 * world.heightHalf) — centering here preserves the old game's actual
 * relationship ("the player starts at the spawn box's center") without
 * requiring an unrelated absolute-coordinate convention the old game only
 * had because of how it happened to define its map's origin.
 */
export const WORLD_SIZE = 480;
