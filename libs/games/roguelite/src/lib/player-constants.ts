/**
 * Shared player-sprite-sheet geometry — needed by bootstrap.ts (initial
 * Position/SpriteRender size), player-clips.ts (per-frame sx/sy math), and
 * camera-follow-player.ts (centering the camera on the sprite's middle,
 * not Position's top-left corner). One frame of the 10x10-grid
 * player.png sheet; frame index 1 = row 0, col 0 = pixel offset (0,0) —
 * see the old pre-engine repo's Sprite.ts numbering, ported verbatim.
 */
export const PLAYER_FRAME_SIZE = 18;
