import type { EntityId, SpriteAnimation, System, World } from '@g-game-farm/ribs';
import { playClip, startAnimator } from '../anim/play-clip.js';
import { Animator, Position, SpriteRender } from '../components.js';
import { fxAsset, spriteFor } from '../fx/fx.js';
import { ROOM_TILE_SIZE } from '../rooms/tile-layout.js';
import { companionClip } from './event-commands.js';
import { Companion } from './event-components.js';

/**
 * Event actors' art (asset room, Demo 0 M1): the companion's clip follows
 * its brightness (idle-dim / idle / idle-bright) and switches to `move`
 * while it travels; vines are one sprite per blocked cell.
 */

/** Simulation, after event commands moved things this step and before the animator steps. */
export function createCompanionArtSystem(): System {
  const last = new Map<EntityId, { x: number; y: number }>();
  return {
    name: 'roguelite:events/companion-art',
    order: 3.5,
    run: (ctx) => {
      const seen = new Set<EntityId>();
      for (const [id, companion, animator, position] of ctx.world.query([Companion, Animator, Position] as const)) {
        seen.add(id);
        const previous = last.get(id);
        const moving = previous !== undefined && (Math.abs(previous.x - position.x) > 0.05 || Math.abs(previous.y - position.y) > 0.05);
        last.set(id, { x: position.x, y: position.y });
        const clip = moving ? 'move' : companionClip(companion.brightness);
        if (animator.current !== clip && clip in animator.clips) playClip(ctx.world, id, clip);
      }
      for (const id of last.keys()) if (!seen.has(id)) last.delete(id);
    },
  };
}

/** One vine sprite per cell, standing on the cell's bottom middle (the asset's anchor). Empty without the asset. */
export function spawnVineSprites(world: World, cells: readonly { readonly column: number; readonly row: number }[]): EntityId[] {
  const art = fxAsset(world, 'vine');
  if (!art) return [];
  return cells.map((cell) => {
    const entity = world.createEntity();
    world.set(entity, Position, { x: (cell.column + 0.5) * ROOM_TILE_SIZE, y: (cell.row + 1) * ROOM_TILE_SIZE });
    world.set(entity, SpriteRender, spriteFor(art, 'idle'));
    world.set(entity, Animator, startAnimator(art.clips, 'idle'));
    return entity;
  });
}

/** When a clip reaches the first frame carrying `tag`, in ms from its start; the whole clip's length if none does. */
export function msUntilTag(clip: SpriteAnimation | undefined, tag: string): number {
  if (!clip) return 0;
  let ms = 0;
  for (const frame of clip.frames) {
    if (frame.tags?.includes(tag)) return ms;
    ms += frame.durationMs;
  }
  return ms;
}
