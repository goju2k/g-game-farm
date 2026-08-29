/**
 * Shared player-sprite-sheet geometry — needed by bootstrap.ts (initial
 * Position/SpriteRender size), player-clips.ts (per-frame sx/sy math), and
 * camera-follow-player.ts (centering the camera on the sprite's middle,
 * not Position's top-left corner). One frame of the 10x10-grid
 * player.png sheet; frame index 1 = row 0, col 0 = pixel offset (0,0) —
 * see the old pre-engine repo's Sprite.ts numbering, ported verbatim.
 */
export const PLAYER_FRAME_SIZE = 18;

/** Old pre-engine repo's Player.ts colliderConfig: {colliderWidth:8, colliderHeight:4, colliderOffsetX:5, colliderOffsetY:14}. */
export const PLAYER_WALL_COLLIDER = { offsetX: 5, offsetY: 14, width: 8, height: 4 } as const;
