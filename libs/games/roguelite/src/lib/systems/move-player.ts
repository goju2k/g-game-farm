import type { System } from '@g-game-farm/engine';
import { startAnimationPlayer } from '@g-game-farm/engine';
import { Animator, PlayerControlled, Position, SpriteRender } from '../components.js';

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
 * - No wall/collision check — no tile/wall data exists anywhere yet
 *   (porting step 7); movement here is unconditionally free.
 */
export const movePlayerSystem: System = {
  name: 'roguelite:move-player',
  run: (ctx) => {
    for (const [id, position, playerControlled, sprite, animator] of ctx.world.query([
      Position,
      PlayerControlled,
      SpriteRender,
      Animator,
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

      if (dx !== 0 || dy !== 0) {
        ctx.world.set(id, Position, { x: position.x + dx, y: position.y + dy });
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
