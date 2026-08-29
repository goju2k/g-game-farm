import type { RenderSystem } from '@g-game-farm/engine';
import { Position, SpriteRender } from '../components.js';

/** Draws every entity that has both Position and SpriteRender. */
export const renderSpritesSystem: RenderSystem = {
  name: 'roguelite:render-sprites',
  run: (ctx) => {
    for (const [, position, sprite] of ctx.world.query([Position, SpriteRender] as const)) {
      ctx.renderer.submitSprite({
        layer: sprite.layer,
        texture: sprite.texture,
        sx: sprite.sx,
        sy: sprite.sy,
        sWidth: sprite.sWidth,
        sHeight: sprite.sHeight,
        x: position.x,
        y: position.y,
        width: sprite.width,
        height: sprite.height,
        flipX: sprite.flipX,
      });
    }
  },
};
