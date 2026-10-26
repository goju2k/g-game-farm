import type { RenderSystem, SpriteAnimation, TextureHandle } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';
import { FxLibrary } from '../fx/fx-components.js';
import { CombatPlayer } from '../combat/combat-components.js';
import { Position, SpriteRender } from '../components.js';
import { spriteDrawOrigin } from '../systems/render-sprites.js';
import { Emote, EventFade, GlowDot, Vine } from './event-components.js';

/** Unlit layer above the lit ones: emotes and event fades must not be darkened by room lighting (a white flash stays white). */
export const OVERLAY_LAYER = 'overlay';
const LIT_LAYER = 'gameplay';

type Rgba = readonly [number, number, number, number];
const INK: Rgba = [0.09, 0.08, 0.14, 1];
const PAPER: Rgba = [0.96, 0.96, 0.98, 1];

/**
 * Emote icons as pixel lists inside the bubble's 10x6 interior (event spec
 * §4: three drawn icons, no font).
 */
const ICONS: Readonly<Record<Emote['icon'], readonly (readonly [number, number])[]>> = {
  ellipsis: [
    [2, 3],
    [5, 3],
    [8, 3],
  ],
  exclaim: [
    [5, 1],
    [5, 2],
    [5, 3],
    [5, 5],
  ],
  question: [
    [4, 1],
    [5, 1],
    [6, 1],
    [6, 2],
    [5, 3],
    [5, 5],
  ],
};

const STEP_MS = 1000 / 60;

/** The frame a non-looping clip shows `ms` after it started (the last one once it's over). */
function frameAt(clip: SpriteAnimation, ms: number) {
  let left = ms;
  for (const frame of clip.frames) {
    if (left < frame.durationMs) return frame;
    left -= frame.durationMs;
  }
  return clip.frames[clip.frames.length - 1];
}

export function createEventRenderSystem(whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:events/render',
    order: 6,
    run: (ctx) => {
      const rect = (layer: string, x: number, y: number, width: number, height: number, tint: Rgba) =>
        ctx.renderer.submitSprite({ layer, texture: whitePixel, sx: 0, sy: 0, sWidth: 1, sHeight: 1, x, y, width, height, tint });

      for (const [, vine] of ctx.world.query([Vine] as const)) {
        rect(LIT_LAYER, vine.box.x, vine.box.y, vine.box.width, vine.box.height, [0.2, 0.42, 0.18, 1]);
        for (let x = vine.box.x + 2; x < vine.box.x + vine.box.width; x += 5) rect(LIT_LAYER, x, vine.box.y, 1, vine.box.height, [0.12, 0.3, 0.1, 1]);
      }

      for (const [, dot, position] of ctx.world.query([GlowDot, Position] as const)) {
        const [r, g, b] = dot.color;
        const x = Math.round(position.x - dot.size / 2);
        const y = Math.round(position.y - dot.size / 2);
        // A soft plus shape: full center, faint arms — reads as a point of light at 4x.
        rect(OVERLAY_LAYER, x, y, dot.size, dot.size, [r, g, b, 1]);
        rect(OVERLAY_LAYER, x - 1, y + dot.size / 2 - 0.5, dot.size + 2, 1, [r, g, b, 0.45]);
        rect(OVERLAY_LAYER, x + dot.size / 2 - 0.5, y - 1, 1, dot.size + 2, [r, g, b, 0.45]);
      }

      let emoteArt: LoadedAnimAsset | undefined;
      for (const [, library] of ctx.world.query([FxLibrary] as const)) emoteArt = library.assets['emote'];

      for (const [id, emote, position] of ctx.world.query([Emote, Position] as const)) {
        const sprite = ctx.world.get(id, SpriteRender);
        const top = sprite ? spriteDrawOrigin(position, sprite).y + (ctx.world.get(id, CombatPlayer) ? 4 : 0) : position.y - 4;
        const elapsed = emote.totalF - emote.framesLeft;
        const clip = emoteArt?.clips[emote.icon];
        if (emoteArt && clip) {
          // The bubble's tail tip (the asset's anchor) sits one pixel above the head; its clip plays once and holds the last frame.
          const frame = frameAt(clip, elapsed * STEP_MS);
          const fade = Math.min(1, emote.framesLeft / 6);
          const [anchorX, anchorY] = emoteArt.asset.anchor;
          ctx.renderer.submitSprite({
            layer: OVERLAY_LAYER,
            texture: clip.texture,
            sx: frame.sx,
            sy: frame.sy,
            sWidth: frame.sWidth,
            sHeight: frame.sHeight,
            x: Math.round(position.x - anchorX),
            y: Math.round(top - 1 - anchorY),
            width: frame.sWidth,
            height: frame.sHeight,
            tint: [1, 1, 1, fade],
          });
          continue;
        }
        const pop = Math.min(1, elapsed / 6, emote.framesLeft / 6); // 0.1s in, 0.1s out
        const bx = Math.round(position.x - 6);
        const by = Math.round(top - 11 + (1 - pop) * 3);
        const alpha = pop;
        const ink: Rgba = [INK[0], INK[1], INK[2], alpha];
        rect(OVERLAY_LAYER, bx, by, 12, 8, ink);
        rect(OVERLAY_LAYER, bx + 1, by + 1, 10, 6, [PAPER[0], PAPER[1], PAPER[2], alpha]);
        rect(OVERLAY_LAYER, bx + 4, by + 8, 2, 1, ink); // tail
        for (const [px, py] of ICONS[emote.icon]) rect(OVERLAY_LAYER, bx + 1 + px - 1, by + 1 + py - 1, 1, 1, ink);
      }

      for (const [, fade] of ctx.world.query([EventFade] as const)) {
        const c = fade.color === 'white' ? 1 : 0;
        for (const [, , position] of ctx.world.query([CombatPlayer, Position] as const)) {
          rect(OVERLAY_LAYER, position.x - 3000, position.y - 3000, 6000, 6000, [c, c, c, fade.alpha]);
        }
      }
    },
  };
}
