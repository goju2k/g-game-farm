import type { RenderSystem } from '@g-game-farm/ribs';
import { Position, SpriteRender } from '../components.js';

/** Where SpriteRender's dest rect's top-left lands for an entity at `position` — applies originX/originY (mirrored when flipped). */
export function spriteDrawOrigin(position: Position, sprite: SpriteRender): { readonly x: number; readonly y: number } {
  // No origin = Position is the top-left and a flip mirrors in place; only an explicit origin mirrors around itself.
  if (sprite.originX === undefined && sprite.originY === undefined) {
    return position;
  }
  const originX = sprite.originX ?? 0;
  const originY = sprite.originY ?? 0;
  const scaleX = sprite.width / sprite.sWidth;
  const scaleY = sprite.height / sprite.sHeight;
  const mirroredX = sprite.flipX ? sprite.sWidth - originX : originX;
  return { x: position.x - mirroredX * scaleX, y: position.y - originY * scaleY };
}

/** Draws every entity that has both Position and SpriteRender. */
export const renderSpritesSystem: RenderSystem = {
  name: 'roguelite:render-sprites',
  run: (ctx) => {
    for (const [, position, sprite] of ctx.world.query([Position, SpriteRender] as const)) {
      const { x, y } = spriteDrawOrigin(position, sprite);
      ctx.renderer.submitSprite({
        layer: sprite.layer,
        texture: sprite.texture,
        sx: sprite.sx,
        sy: sprite.sy,
        sWidth: sprite.sWidth,
        sHeight: sprite.sHeight,
        x,
        y,
        width: sprite.width,
        height: sprite.height,
        flipX: sprite.flipX,
        tint: sprite.tint,
      });
    }
  },
};
