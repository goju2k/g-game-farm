import { overlaps, type AABB, type System } from '@g-game-farm/ribs';
import { Pickup, Position, SpriteRender, WallCollider } from '../components.js';
import { createRoomFlagWriter } from '../rooms/room-flags.js';

/**
 * Player picks up a Pickup entity by touching it (same WallCollider box
 * room-exit-trigger.ts uses) — sets this room's flag and destroys the
 * pickup entity. order: 1, same tier/reasoning as room-exit-trigger.ts:
 * needs this tick's post-move player position, and needs to run before
 * createRunScenarioSystem (order 2) so a `waitUntil` on the flag it just
 * set resolves this same tick.
 */
export const collectPickupsSystem: System = {
  name: 'roguelite:collect-pickups',
  order: 1,
  run: (ctx) => {
    const playerMatch = [...ctx.world.query([Position, WallCollider] as const)][0];
    if (!playerMatch) {
      return;
    }
    const [, position, wallCollider] = playerMatch;
    const playerBox: AABB = {
      x: position.x + wallCollider.offsetX,
      y: position.y + wallCollider.offsetY,
      width: wallCollider.width,
      height: wallCollider.height,
    };

    for (const [id, pickupPosition, sprite, pickup] of ctx.world.query([Position, SpriteRender, Pickup] as const)) {
      const pickupBox: AABB = { x: pickupPosition.x, y: pickupPosition.y, width: sprite.width, height: sprite.height };
      if (overlaps(playerBox, pickupBox)) {
        createRoomFlagWriter(ctx.world).set(pickup.flag, true);
        ctx.world.destroyEntity(id);
      }
    }
  },
};
