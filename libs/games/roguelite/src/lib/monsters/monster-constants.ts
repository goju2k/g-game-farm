/**
 * Shared monster-sprite-sheet frame size — every monster's pose clip and
 * bootstrap.ts's monster spawn use 16x16 frames (old pre-engine repo's
 * AniMetaZag/Doltan/Ghost/Grass.ts all declare w:16,h:16 on their
 * spriteMap). Mirrors player-constants.ts's PLAYER_FRAME_SIZE.
 */
export const MONSTER_FRAME_SIZE = 16;

/** Uniform across all 4 species in the old pre-engine repo's stat configs (Zag/Doltan/Ghost/Grass.ts all set life:100). No max-life/UI display exists anywhere old or new. */
export const MONSTER_STARTING_LIFE = 100;
