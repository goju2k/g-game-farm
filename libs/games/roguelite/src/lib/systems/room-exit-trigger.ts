import { evaluateCondition, overlaps, type AABB, type System } from '@g-game-farm/ribs';
import { Position, RoomExits, WallCollider } from '../components.js';
import { createRoomFlagWriter } from '../rooms/room-flags.js';
import type { RogueliteSession } from '../session.js';

/**
 * Checks the player's WallCollider box (the same physical box move-player.ts
 * already collides against walls with — no separate "trigger footprint"
 * concept) against every RoomExit zone in this room. On a match whose
 * `lockedUnless` (if any) evaluates true against this room's own Flags,
 * stashes the target entry point on the session and requests the scene
 * change — createRoomScene.ts's setup() on the next room reads
 * session.pendingEntryId to know where to spawn the player.
 *
 * order: 1, same tier as chasePlayerSystem/stepAnimatorSystem/
 * createFireProjectilesSystem — needs to run after movePlayerSystem
 * (order 0) so it checks this tick's post-move position, not last tick's.
 * Safe to keep calling requestSceneChange every tick the player stands in
 * an unlocked zone: it only takes effect at the very start of the next
 * tick (see SystemContext.requestSceneChange's doc comment), and
 * world.clear() on the actual transition means this system simply stops
 * running in the old room afterward.
 */
export function createRoomExitTriggerSystem(session: RogueliteSession): System {
  return {
    name: 'roguelite:room-exit-trigger',
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

      const exitsMatch = [...ctx.world.query([RoomExits] as const)][0];
      if (!exitsMatch) {
        return;
      }
      const [, roomExits] = exitsMatch;

      for (const exit of roomExits.exits) {
        if (!overlaps(playerBox, exit.zone)) {
          continue;
        }
        if (exit.lockedUnless && !evaluateCondition(exit.lockedUnless, createRoomFlagWriter(ctx.world))) {
          continue;
        }
        session.pendingEntryId = exit.targetEntryId;
        ctx.requestSceneChange(exit.targetRoomId);
        return;
      }
    },
  };
}
