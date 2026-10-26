import type { RenderSystem, TextureHandle } from '@g-game-farm/ribs';
import { Position, RoomExits } from '../components.js';
import { Brazier, BrazierPedestal, CrackedWall, ExamineState, RoomLock, SealDoor, SkillPickup, Trace } from './world-components.js';

type Rgba = readonly [number, number, number, number];
const STONE: Rgba = [0.36, 0.36, 0.42, 1];
const STONE_DARK: Rgba = [0.22, 0.22, 0.27, 1];
const SCRATCH: Rgba = [0.6, 0.62, 0.7, 1];
const SEAL: Rgba = [0x5f / 255, 0xcd / 255, 0xe4 / 255, 1];
const FIRE: Rgba = [0xdf / 255, 0x71 / 255, 0x26 / 255, 1];
const FIRE_CORE: Rgba = [0xfb / 255, 0xf2 / 255, 0x36 / 255, 1];
const BARS: Rgba = [0.55, 0.2, 0.2, 0.9];

/**
 * Graybox drawing for the wayfinding objects (31 §0) until the asset room's
 * art: trace slabs with scratches, braziers and pedestals (a flame once lit),
 * seal doors with their glyph, cracked walls, the skill pedestal's floating
 * flame, an arena's barred exits — and the white shimmer over whatever is
 * near enough to examine.
 */
export function createWorldRenderSystem(whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:world/render',
    order: -0.3, // with the combat graybox, before character sprites
    run: (ctx) => {
      const rect = (layer: string, x: number, y: number, width: number, height: number, tint: Rgba) =>
        ctx.renderer.submitSprite({ layer, texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x: Math.round(x), y: Math.round(y), width, height, tint });
      const lit = (x: number, y: number, w: number, h: number, t: Rgba) => rect('gameplay', x, y, w, h, t);
      const glow = (x: number, y: number, w: number, h: number, t: Rgba) => rect('overlay', x, y, w, h, t);
      const flicker = (Math.floor(Date.now() / 120) % 2) as 0 | 1;

      for (const [, trace, position] of ctx.world.query([Trace, Position] as const)) {
        if (trace.art) continue; // drawn by its art
        lit(position.x - 6, position.y - 14, 12, 14, STONE);
        lit(position.x - 4, position.y - 11, 8, 1, SCRATCH);
        lit(position.x - 3, position.y - 8, 6, 1, SCRATCH);
        lit(position.x - 4, position.y - 5, 7, 1, SCRATCH);
      }

      for (const [, brazier, position] of ctx.world.query([Brazier, Position] as const)) {
        lit(position.x - 6, position.y - 6, 12, 6, STONE_DARK);
        lit(position.x - 7, position.y - 8, 14, 2, STONE);
        if (brazier.lit) {
          glow(position.x - 3, position.y - 14 - flicker, 6, 6 + flicker, FIRE);
          glow(position.x - 1, position.y - 12, 2, 3, FIRE_CORE);
        }
      }

      for (const [, pedestal, position] of ctx.world.query([BrazierPedestal, Position] as const)) {
        lit(position.x - 4, position.y - 6, 8, 6, STONE);
        if (pedestal.lit) glow(position.x - 2, position.y - 11 - flicker, 4, 5 + flicker, FIRE);
      }

      for (const [, pickup, position] of ctx.world.query([SkillPickup, Position] as const)) {
        lit(position.x - 6, position.y - 8, 12, 8, STONE);
        if (!pickup.taken) {
          const bob = Math.round(Math.sin(Date.now() / 300) * 1.5);
          glow(position.x - 2, position.y - 18 + bob, 4, 5, FIRE);
          glow(position.x - 1, position.y - 17 + bob, 2, 2, FIRE_CORE);
        }
      }

      for (const [, door] of ctx.world.query([SealDoor] as const)) {
        if (door.open) continue;
        const b = door.box;
        lit(b.x, b.y, b.width, b.height, STONE_DARK);
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        glow(cx - 4, cy, 9, 1, SEAL);
        glow(cx, cy - 4, 1, 9, SEAL);
        glow(cx - 2, cy - 2, 5, 5, [SEAL[0], SEAL[1], SEAL[2], 0.35]);
      }

      for (const [, wall] of ctx.world.query([CrackedWall] as const)) {
        if (wall.broken) continue;
        const b = wall.box;
        lit(b.x, b.y, b.width, b.height, STONE);
        for (let i = 0; i < 4; i++) lit(b.x + 3 + i * 3, b.y + 2 + i * 3, 2, 3, STONE_DARK);
        lit(b.x + b.width - 6, b.y + 4, 1, b.height - 8, STONE_DARK);
      }

      // An arena holding its exits: bars across them.
      if ([...ctx.world.query([RoomLock] as const)].some(([, lock]) => lock.locked)) {
        for (const [, exits] of ctx.world.query([RoomExits] as const)) {
          for (const exit of exits.exits) {
            const z = exit.zone;
            for (let x = z.x + 2; x < z.x + z.width; x += 5) lit(x, z.y, 2, z.height, BARS);
            for (let y = z.y + 2; y < z.y + z.height; y += 5) lit(z.x, y, z.width, 2, BARS);
          }
        }
      }

      // The examine shimmer: a small white point blinking over what's near (31 §0).
      const near = [...ctx.world.query([ExamineState] as const)][0]?.[1].near;
      const at = near !== undefined ? ctx.world.get(near, Position) : undefined;
      if (at && Math.floor(Date.now() / 250) % 3 !== 0) {
        glow(at.x - 1, at.y - 22, 2, 2, [1, 1, 1, 1]);
        glow(at.x, at.y - 23, 1, 4, [1, 1, 1, 0.5]);
        glow(at.x - 2, at.y - 21, 4, 1, [1, 1, 1, 0.5]);
      }
    },
  };
}
