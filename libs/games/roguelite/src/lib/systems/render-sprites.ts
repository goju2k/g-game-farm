import type { RenderSystem } from '@g-game-farm/ribs';
import { Hidden, Tint } from '../events/event-components.js';
import { Position, SpriteRender } from '../components.js';
import { HitFlash } from '../fx/fx-components.js';

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

/** A depthOffset that puts an effect over every actor (a hit spark, a muzzle flash). */
export const ABOVE_ACTORS = 100_000;

/** Where an entity's feet are, for 3/4 draw order: Position for an anchored sprite, the rect's bottom for a top-left one. */
export function spriteDepth(position: Position, sprite: SpriteRender): number {
  const feet = sprite.originX === undefined && sprite.originY === undefined ? position.y + sprite.height : position.y;
  return feet + (sprite.depthOffset ?? 0);
}

/** Draws every entity that has both Position and SpriteRender, in 3/4 order by the feet (the layer sorts by depth). */
export const renderSpritesSystem: RenderSystem = {
  name: 'roguelite:render-sprites',
  run: (ctx) => {
    for (const [id, position, sprite] of ctx.world.query([Position, SpriteRender] as const)) {
      if (ctx.world.get(id, Hidden)) continue; // hidden by an event
      const { x, y } = spriteDrawOrigin(position, sprite);
      const hit = (ctx.world.get(id, HitFlash)?.framesLeft ?? 0) > 0;
      const tint = hit ? undefined : ctx.world.get(id, Tint);
      const flash = hit ? 1 : (tint?.amount ?? 0);
      const rotation = sprite.rotation ?? 0;
      // Rotate around the origin point (where Position is), so a spun sprite stays put.
      const pivot = rotation !== 0 ? { pivotX: position.x - x, pivotY: position.y - y } : {};
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
        depth: spriteDepth(position, sprite),
        ...(flash ? { flash } : {}),
        ...(tint && flash ? { flashColor: tint.color } : {}),
        ...(rotation !== 0 ? { rotation, ...pivot } : {}),
      });
    }
  },
};
