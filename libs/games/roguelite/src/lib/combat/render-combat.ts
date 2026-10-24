import type { RenderSystem, TextureHandle } from '@g-game-farm/ribs';
import { Position } from '../components.js';
import { CombatPlayer, ParrySpark, ScreenFade, SentinelMelee } from './combat-components.js';
import type { CombatData } from './combat-data.js';
import { sentinelAttackBox, sentinelBody } from './combat-geometry.js';

const LAYER = 'gameplay';
type Rgba = readonly [number, number, number, number];

/** Palette glow colors — listed as emissive in the dungeon lighting, so they stay bright in the dark (spec §8-2: the seal light brightens). */
const SEAL_LIGHT: Rgba = [0x5f / 255, 0xcd / 255, 0xe4 / 255, 1];
const SEAL_FLASH: Rgba = [0xcb / 255, 0xdb / 255, 0xfc / 255, 1];
const BODY: Rgba = [0.42, 0.45, 0.52, 1];
const BODY_STUNNED: Rgba = [0.3, 0.33, 0.45, 1];
const BODY_DORMANT: Rgba = [0.22, 0.22, 0.26, 1];

/**
 * Graybox drawing for combat: sentinels as blocks whose windup reads in
 * three steps (core of seal light grows -> holds -> whole body flashes for
 * the cue), their live attack box, and parry sparks.
 * Replaced by real sprites when the asset room delivers them.
 */
export function createRenderCombatSystem(data: CombatData, whitePixel: TextureHandle): RenderSystem {
  const stats = data.enemies['sentinel-melee'];
  return {
    name: 'roguelite:combat/render',
    order: -0.4, // after the camera and shadows, before character sprites
    run: (ctx) => {
      const rect = (x: number, y: number, width: number, height: number, tint: Rgba) =>
        ctx.renderer.submitSprite({ layer: LAYER, texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x, y, width, height, tint });

      for (const [, sentinel, position] of ctx.world.query([SentinelMelee, Position] as const)) {
        const body = sentinelBody(position, stats);
        const windupF = sentinel.windupF ?? stats.windupF;
        const cueF = sentinel.cueF ?? stats.cueF;
        const cue = sentinel.state === 'windup' && sentinel.framesLeft <= cueF;
        const bodyTint = cue ? SEAL_FLASH : sentinel.state === 'stunned' ? BODY_STUNNED : sentinel.state === 'dormant' ? BODY_DORMANT : BODY;
        rect(Math.round(body.x), Math.round(body.y), body.width, body.height, bodyTint);

        if (sentinel.state === 'windup' && !cue) {
          // Seal-light core: 2px -> 8px over the windup's first part, then holds.
          const progress = Math.min(1, (windupF - sentinel.framesLeft) / Math.max(1, windupF - cueF - 8));
          const size = 2 + 2 * Math.round(3 * progress);
          rect(Math.round(position.x - size / 2), Math.round(position.y - size / 2), size, size, SEAL_LIGHT);
        } else if (sentinel.state !== 'dormant') {
          rect(Math.round(position.x - 1), Math.round(position.y - 1), 2, 2, sentinel.state === 'active' ? SEAL_FLASH : SEAL_LIGHT);
        }

        if (sentinel.state === 'windup' || sentinel.state === 'active') {
          const box = sentinelAttackBox(position, sentinel.dirX, sentinel.dirY, stats);
          rect(Math.round(box.x), Math.round(box.y), box.width, box.height, sentinel.state === 'active' ? [SEAL_LIGHT[0], SEAL_LIGHT[1], SEAL_LIGHT[2], 0.6] : [1, 1, 1, 0.06]);
        }
      }

      for (const [, spark] of ctx.world.query([ParrySpark] as const)) {
        const t = 1 - spark.framesLeft / spark.totalF;
        const half = Math.round(4 + 10 * t);
        const tint: Rgba = t < 0.5 ? SEAL_FLASH : SEAL_LIGHT;
        const x = Math.round(spark.x);
        const y = Math.round(spark.y);
        rect(x - half, y - half, half * 2, 1, tint);
        rect(x - half, y + half - 1, half * 2, 1, tint);
        rect(x - half, y - half, 1, half * 2, tint);
        rect(x + half - 1, y - half, 1, half * 2, tint);
      }
    },
  };
}

/** The fade must cover the characters too, so it also draws after them. */
export function createRenderFadeOverlaySystem(whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:combat/render-fade',
    order: 10,
    run: (ctx) => {
      for (const [, fade] of ctx.world.query([ScreenFade] as const)) {
        const t = fade.framesLeft / fade.totalF;
        const alpha = fade.phase === 'out' ? 1 - t : t;
        for (const [, , position] of ctx.world.query([CombatPlayer, Position] as const)) {
          ctx.renderer.submitSprite({ layer: LAYER, texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x: position.x - 2000, y: position.y - 2000, width: 4000, height: 4000, tint: [0, 0, 0, alpha] });
        }
      }
    },
  };
}
