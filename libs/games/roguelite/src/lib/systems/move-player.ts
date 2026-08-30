import type { AABB, System } from '@g-game-farm/ribs';
import { overlaps, startAnimationPlayer } from '@g-game-farm/ribs';
import { Animator, PlayerControlled, Position, SpriteRender, WallCollider } from '../components.js';
import { WALL_COLLIDERS } from '../tile-map.js';

function collidesWithWall(x: number, y: number, collider: WallCollider): boolean {
  const box: AABB = { x: x + collider.offsetX, y: y + collider.offsetY, width: collider.width, height: collider.height };
  return WALL_COLLIDERS.some((wall) => overlaps(box, wall));
}

/**
 * Reads WASD, moves the player, updates facing + which clip is active.
 * Ported verbatim from the old pre-engine repo's Player.ts#step():
 *
 * - x and y move independently and UNCONDITIONALLY within the same tick —
 *   holding two keys on different axes (e.g. W+D) moves diagonally at the
 *   full per-axis speed on both axes, not normalized to a constant
 *   diagonal speed. This reads like an unreviewed quirk of the original
 *   hobby project, not a deliberate design choice, but the port is meant
 *   to be near-identical to the old game, so it's replicated faithfully
 *   here rather than fixed.
 * - A/D (and separately W/S) are mutually exclusive, A/W taking priority
 *   when both are held — same as the old code's `if (A) {...} else if
 *   (D) {...}` — not "sum -1 and +1 and cancel to zero."
 * - flipX only changes when A or D is held this tick; otherwise it's left
 *   exactly as-is ("sticky"), matching the old code's `this.flipX = ...`
 *   living only inside the A/D branches (never touched by W/S or idle).
 *
 * Wall collision — old pre-engine repo's Player.ts#step()'s movement
 * branch: X is applied and collision-checked (reverted on collision)
 * BEFORE Y is even touched; Y's own check then runs against the
 * already-resolved X, not the pre-tick X. This axis-separated order (not a
 * single combined-diagonal check) is what lets the player slide along a
 * wall when moving diagonally into it, instead of the whole diagonal move
 * being blocked. Gated on dx/dy !== 0 (skip the WALL_COLLIDERS scan
 * entirely on an axis with no input) — behaviorally identical to running
 * the check unconditionally every tick as the old code does: when a delta
 * is 0, the candidate position equals the current one, so either it
 * already doesn't overlap (no-op) or it already does (revert to itself,
 * also a no-op) — just without the wasted 128-entry scan.
 *
 * Checks WallCollider (the player's own 'base'/colliderConfig box)
 * against WALL_COLLIDERS only, not a generic object list — confirmed
 * equivalent to the old game's collider.base.checkCollisionList(
 * objectContext.list): no monster or particle in the old game ever gets a
 * 'base' collider (only bodyColliderConfig/'body', ported here as
 * Hitbox), so walls are the only thing that check could ever match.
 */
export const movePlayerSystem: System = {
  name: 'roguelite:move-player',
  run: (ctx) => {
    for (const [id, position, playerControlled, sprite, animator, wallCollider] of ctx.world.query([
      Position,
      PlayerControlled,
      SpriteRender,
      Animator,
      WallCollider,
    ] as const)) {
      const heldA = ctx.input.keyboard.held.has('KeyA');
      const heldD = ctx.input.keyboard.held.has('KeyD');
      const heldW = ctx.input.keyboard.held.has('KeyW');
      const heldS = ctx.input.keyboard.held.has('KeyS');

      const distance = (playerControlled.speed * ctx.deltaMs) / 1000;

      let dx = 0;
      let flipX = sprite.flipX;
      if (heldA) {
        dx = -distance;
        flipX = false;
      } else if (heldD) {
        dx = distance;
        flipX = true;
      }

      let dy = 0;
      if (heldW) {
        dy = -distance;
      } else if (heldS) {
        dy = distance;
      }

      let x = position.x;
      let y = position.y;

      if (dx !== 0 && !collidesWithWall(x + dx, y, wallCollider)) {
        x += dx;
      }
      if (dy !== 0 && !collidesWithWall(x, y + dy, wallCollider)) {
        y += dy;
      }

      if (x !== position.x || y !== position.y) {
        ctx.world.set(id, Position, { x, y });
      }

      if (flipX !== sprite.flipX) {
        ctx.world.set(id, SpriteRender, { ...sprite, flipX });
      }

      const desiredClip = heldA || heldD || heldW || heldS ? 'run' : 'idle';
      if (animator.current !== desiredClip) {
        const { state } = startAnimationPlayer(animator.clips[desiredClip]);
        ctx.world.set(id, Animator, { ...animator, current: desiredClip, state });
      }
    }
  },
};
