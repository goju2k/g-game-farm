import type { System } from '@g-game-farm/ribs';
import { moveBoxInGrid, spriteAnimationSource, startAnimationPlayer } from '@g-game-farm/ribs';
import { Animator, PlayerControlled, Position, RoomTileLayout, SpriteRender, WallCollider } from '../components.js';

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
 * Wall collision is the engine's moveBoxInGrid() (engine-physics) sweeping
 * the player's WallCollider box through the room's CollisionGrid: X
 * first, then Y from the already-resolved X, so a diagonal move into a
 * wall slides along it (the same axis order the old game used). Unlike
 * the old game's "revert the whole axis on overlap", a blocked axis ends
 * flush against the wall — the gap left no longer depends on speed or
 * tick length. No room (no RoomTileLayout) = nothing to collide with.
 */
export const movePlayerSystem: System = {
  name: 'roguelite:move-player',
  run: (ctx) => {
    const collision = [...ctx.world.query([RoomTileLayout] as const)][0]?.[1].collision;

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

      let x = position.x + dx;
      let y = position.y + dy;
      if (collision && (dx !== 0 || dy !== 0)) {
        const box = { x: position.x + wallCollider.offsetX, y: position.y + wallCollider.offsetY, width: wallCollider.width, height: wallCollider.height };
        const moved = moveBoxInGrid(collision, box, dx, dy);
        x = moved.x - wallCollider.offsetX;
        y = moved.y - wallCollider.offsetY;
      }

      if (x !== position.x || y !== position.y) {
        ctx.world.set(id, Position, { x, y });
      }

      if (flipX !== sprite.flipX) {
        ctx.world.set(id, SpriteRender, { ...sprite, flipX });
      }

      const desiredClip = heldA || heldD || heldW || heldS ? 'run' : 'idle';
      if (animator.current !== desiredClip) {
        const clip = animator.clips[desiredClip];
        const { state } = startAnimationPlayer(clip);
        ctx.world.set(id, Animator, { ...animator, current: desiredClip, state });
        // Eagerly sync frame 0 here rather than leaving it to stepAnimatorSystem: that system
        // only writes SpriteRender when frameIndex actually CHANGES tick to tick, which a switch
        // TO a clip that also happens to still be sitting at frameIndex 0 after this tick's deltaMs
        // (e.g. any single-frame clip, or simply a short enough deltaMs) would never trigger,
        // leaving SpriteRender showing a stale frame from whichever clip was active before.
        const latestSprite = ctx.world.get(id, SpriteRender) ?? sprite;
        ctx.world.set(id, SpriteRender, { ...latestSprite, ...spriteAnimationSource(clip, 0) });
      }
    }
  },
};
