import { COLLISION_EMPTY, createCollisionGrid, overlaps, type EntityId, type System, type World } from '@g-game-farm/ribs';
import type { RogueliteSession } from '../session.js';
import { msUntilTag } from './event-art.js';
import { fxAsset } from '../fx/fx.js';
import { Fx } from '../fx/fx-components.js';
import { playClip } from '../anim/play-clip.js';
import { CombatPlayer, SpellProjectile } from '../combat/combat-components.js';
import type { CombatData } from '../combat/combat-data.js';
import { boxAt } from '../combat/combat-geometry.js';
import { readIntent } from '../combat/intent.js';
import { Animator, Flags, LightEmitter, Position, RoomTileLayout, SpriteRender } from '../components.js';
import { actorCenter, findActor } from './event-commands.js';
import { countFailure } from './event-director.js';
import { CameraDirector, Companion, Emote, Highlight, LightPulse, Vine } from './event-components.js';
import { HitFlash } from '../fx/fx-components.js';

/** Keeps CameraDirector's x,y on its follow target every step (render reads it). */
export const cameraDirectorSystem: System = {
  name: 'roguelite:events/camera-director',
  order: 4,
  run: (ctx) => {
    for (const [id, director] of ctx.world.query([CameraDirector] as const)) {
      if (director.mode !== 'follow') continue;
      const target = findActor(ctx.world, director.target);
      const center = target !== undefined ? actorCenter(ctx.world, target) : undefined;
      if (center && (center.x !== director.x || center.y !== director.y)) ctx.world.set(id, CameraDirector, { ...director, x: center.x, y: center.y });
    }
  },
};

const FOLLOW_DISTANCE = 24;
const FOLLOW_EASE = 0.08;

/** The companion trails the player once it's following: 24px behind (opposite the facing), floating up and down. */
export const companionFollowSystem: System = {
  name: 'roguelite:events/companion-follow',
  order: 4,
  run: (ctx) => {
    const playerEntity = findActor(ctx.world, 'player');
    const player = playerEntity !== undefined ? ctx.world.get(playerEntity, CombatPlayer) : undefined;
    const center = playerEntity !== undefined ? actorCenter(ctx.world, playerEntity) : undefined;
    for (const [id, companion, position] of ctx.world.query([Companion, Position] as const)) {
      if (!companion.following || !player || !center) continue;
      const bob = Math.sin((ctx.tick / 60) * Math.PI) * 2;
      const tx = center.x - Math.sign(player.facingX || 1) * FOLLOW_DISTANCE;
      const ty = center.y - 8 + bob;
      ctx.world.set(id, Position, { x: position.x + (tx - position.x) * FOLLOW_EASE, y: position.y + (ty - position.y) * FOLLOW_EASE });
    }
  },
};

/** The highlight's clock: runs in, hold, out, then it's gone. */
export const highlightSystem: System = {
  name: 'roguelite:events/highlight',
  order: 4,
  run: (ctx) => {
    for (const [id, highlight] of ctx.world.query([Highlight] as const)) {
      const elapsedMs = highlight.elapsedMs + ctx.deltaMs;
      if (elapsedMs >= highlight.inMs + highlight.holdMs + highlight.outMs) ctx.world.destroyEntity(id);
      else ctx.world.set(id, Highlight, { ...highlight, elapsedMs });
    }
  },
};

/** Sine pulse on pulsing lights (the artifact), and emote bubble lifetimes. */
export const eventUpkeepSystem: System = {
  name: 'roguelite:events/upkeep',
  order: 4,
  run: (ctx) => {
    for (const [id, pulse, light] of ctx.world.query([LightPulse, LightEmitter] as const)) {
      const phaseMs = pulse.phaseMs + ctx.deltaMs;
      ctx.world.set(id, LightPulse, { ...pulse, phaseMs });
      ctx.world.set(id, LightEmitter, { ...light, radius: pulse.base + pulse.amplitude * Math.sin((phaseMs / pulse.periodMs) * Math.PI * 2) });
    }
    for (const [id, emote] of ctx.world.query([Emote] as const)) {
      if (emote.framesLeft <= 1) ctx.world.remove(id, Emote);
      else ctx.world.set(id, Emote, { ...emote, framesLeft: emote.framesLeft - 1 });
    }
  },
};

/**
 * Vines (opening E-2): each new bump while pushing into them counts a
 * "vine-touch" failure; a quick-spell projectile touching them burns them
 * away — their cells open in the room grid and the room flag "vine-burned"
 * is set. Runs before the projectile system so a projectile stopped by the
 * vine (solid cells) still burns it.
 */
/** Burnt through: the cells open and the room flag "vine-burned" is set. */
function openVine(world: World, vineId: EntityId, vine: Vine, session?: RogueliteSession): void {
  if (vine.progressFlag) session?.flags.add(vine.progressFlag);
  for (const [layoutId, layout] of world.query([RoomTileLayout] as const)) {
    const grid = layout.collision;
    const cells = Array.from(grid.cells);
    for (const cell of vine.cells) cells[cell.row * grid.columns + cell.column] = COLLISION_EMPTY;
    world.set(layoutId, RoomTileLayout, { ...layout, collision: createCollisionGrid({ ...grid, cells }) });
  }
  for (const [flagsId, flags] of world.query([Flags] as const)) {
    world.set(flagsId, Flags, { values: { ...flags.values, 'vine-burned': true } });
  }
  world.destroyEntity(vineId);
}

export function createVineSystem(data: CombatData, session?: RogueliteSession): System {
  return {
    name: 'roguelite:events/vines',
    order: 0.65,
    run: (ctx) => {
      const playerEntity = findActor(ctx.world, 'player');
      const player = playerEntity !== undefined ? ctx.world.get(playerEntity, CombatPlayer) : undefined;
      const position = playerEntity !== undefined ? ctx.world.get(playerEntity, Position) : undefined;
      const intent = readIntent(ctx.input);
      for (const [vineId, vine] of ctx.world.query([Vine] as const)) {
        // Burning: the drawn fire takes a moment; the way opens at burn:clear (asset room: vine burn clip).
        if (vine.burningMs !== undefined) {
          const burningMs = vine.burningMs + ctx.deltaMs;
          const clearMs = msUntilTag(fxAsset(ctx.world, 'vine')?.clips['burn'], 'burn:clear');
          if (burningMs >= clearMs) openVine(ctx.world, vineId, vine, session);
          else ctx.world.set(vineId, Vine, { ...vine, burningMs });
          continue;
        }
        // Burn: any projectile within a pixel of the vine.
        const reach = { x: vine.box.x - 2, y: vine.box.y - 2, width: vine.box.width + 4, height: vine.box.height + 4 };
        const burnedBy = [...ctx.world.query([SpellProjectile, Position] as const)].find(([, projectile, p]) =>
          overlaps({ x: p.x - projectile.size / 2, y: p.y - projectile.size / 2, width: projectile.size, height: projectile.size }, reach),
        );
        if (burnedBy && (vine.hitsLeft ?? 1) > 1) {
          // A thick vine: this hit only singes it.
          ctx.world.destroyEntity(burnedBy[0]);
          ctx.world.set(vineId, Vine, { ...vine, hitsLeft: (vine.hitsLeft ?? 1) - 1 });
          for (const sprite of vine.sprites ?? []) if (ctx.world.get(sprite, SpriteRender)) ctx.world.set(sprite, HitFlash, { framesLeft: 3 });
          continue;
        }
        if (burnedBy) {
          ctx.world.destroyEntity(burnedBy[0]);
          const sprites = vine.sprites ?? [];
          if (sprites.length === 0) {
            openVine(ctx.world, vineId, vine, session);
            continue;
          }
          for (const sprite of sprites) {
            if (!ctx.world.get(sprite, Animator)) continue;
            playClip(ctx.world, sprite, 'burn');
            ctx.world.set(sprite, Fx, { steps: [{ clip: 'burn' }], index: 0, elapsedMs: 0 }); // removes itself when burnt out
          }
          ctx.world.set(vineId, Vine, { ...vine, burningMs: 0, touching: false });
          continue;
        }
        // Bump: the player's feet box, nudged one pixel the way they're pushing, overlaps the vine.
        if (!player || !position) continue;
        const feet = boxAt(position, data.playerForms[player.form].wallCollider);
        const pushing = intent.moveX !== 0 || intent.moveY !== 0;
        const touching = pushing && overlaps({ ...feet, x: feet.x + intent.moveX, y: feet.y + intent.moveY }, vine.box);
        if (touching && !vine.touching) countFailure(ctx.world, 'vine-touch');
        if (touching !== vine.touching) ctx.world.set(vineId, Vine, { ...vine, touching });
      }
    },
  };
}
