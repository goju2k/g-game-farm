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

/** World units/sec. Old pre-engine repo's Player.ts: `(time * 64) / 1000`. */
export const PLAYER_SPEED = 64;

/** The flame spirit growth-stage form's sheet geometry — see flame-clips.ts, flame-spirit-placeholder-texture.ts. "불꽃 정도의 크기" (small, Calcifer-scale), deliberately smaller than PLAYER_FRAME_SIZE. */
export const FLAME_FRAME_SIZE = 12;

/** Small collider roughly centered in the flame sprite's lower half — not derived from the old game (this form didn't exist there), hand-picked proportionate to FLAME_FRAME_SIZE. */
export const FLAME_WALL_COLLIDER = { offsetX: 3, offsetY: 6, width: 6, height: 5 } as const;
