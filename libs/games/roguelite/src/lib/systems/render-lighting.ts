import type { RenderSystem, TextureHandle } from '@g-game-farm/ribs';
import { lightMotionFactor } from '../lighting/light-motion.js';
import { Exposure, Hidden } from '../events/event-components.js';
import { Animator, DropShadow, LightEmitter, Position, RoomClock, RoomLighting, SpriteRender, TileLight } from '../components.js';
import { AmbientOverride } from '../events/event-components.js';

const GAMEPLAY_LAYER = 'gameplay';

/** Which radius a frame-stepped TileLight has `elapsedMs` into its loop — same cycle model as tileFrameAt (render-tilemap.ts). */
export function tileLightRadiusAt(light: TileLight, elapsedMs: number): number {
  const durations = light.frameDurationsMs;
  if (!durations || durations.length === 0) {
    return light.radii[0];
  }
  const cycleMs = durations.reduce((sum, d) => sum + d, 0);
  let t = elapsedMs % cycleMs;
  for (let i = 0; i < durations.length; i++) {
    if (t < durations[i]) {
      return light.radii[i];
    }
    t -= durations[i];
  }
  return light.radii[light.radii.length - 1];
}

/**
 * Turns on the frame's lighting when the room has a RoomLighting, and
 * submits every TileLight and LightEmitter. A room without RoomLighting
 * submits nothing, so the renderer draws it fully bright.
 *
 * order: 0 — after the camera (order -1), which submitLight needs.
 */
export const renderLightingSystem: RenderSystem = {
  name: 'roguelite:render-lighting',
  run: (ctx) => {
    let lighting: RoomLighting | undefined;
    for (const [, l] of ctx.world.query([RoomLighting] as const)) {
      lighting = l;
    }
    if (!lighting) {
      return;
    }
    let elapsedMs = 0;
    for (const [, clock] of ctx.world.query([RoomClock] as const)) {
      elapsedMs = clock.elapsedMs;
    }
    // Events can dim or raise the room's ambient (light.ambient) — same violet cast, scaled level.
    const override = [...ctx.world.query([AmbientOverride] as const)][0]?.[1];
    // The scene burning bright (exposure): the ambient climbs toward full light.
    const exposure = [...ctx.world.query([Exposure] as const)][0]?.[1].level ?? 0;
    if (exposure > 0) {
      const base = lighting.settings.ambient;
      const level = override ? override.level / Math.max(0.0001, base[0]) : 1;
      const lift = (v: number) => Math.min(1, v * level + (1 - v * level) * exposure);
      ctx.renderer.setLighting({ ...lighting.settings, ambient: [lift(base[0]), lift(base[1]), lift(base[2])] });
    } else
    if (override) {
      const [r, g, b] = lighting.settings.ambient;
      const k = r > 0 ? override.level / r : 0;
      ctx.renderer.setLighting({ ...lighting.settings, ambient: [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)] });
    } else {
      ctx.renderer.setLighting(lighting.settings);
    }
    const squashY = lighting.squashY;

    for (const [, light] of ctx.world.query([TileLight] as const)) {
      const radius = tileLightRadiusAt(light, elapsedMs) * lightMotionFactor(light.motion, elapsedMs, light.x * 31 + light.y);
      ctx.renderer.submitLight({ layer: GAMEPLAY_LAYER, x: light.x, y: light.y, radius, tint: light.tint, squashY });
    }
    for (const [id, position, emitter] of ctx.world.query([Position, LightEmitter] as const)) {
      if (emitter.radius < 0.5 || ctx.world.get(id, Hidden)) continue; // switched off (events tween lights down to 0), or hidden
      const flipped = ctx.world.get(id, SpriteRender)?.flipX ?? false;
      ctx.renderer.submitLight({
        layer: GAMEPLAY_LAYER,
        x: position.x + (flipped ? -emitter.offsetX : emitter.offsetX),
        y: position.y + emitter.offsetY,
        radius: emitter.radius * lightMotionFactor(emitter.motion, elapsedMs, (id as unknown as number) * 7919),
        tint: emitter.tint,
        squashY,
      });
    }
  },
};

/** Row widths for a DropShadow this frame — the lifted pair while the Animator is on a lifted frame. */
export function dropShadowWidths(shadow: DropShadow, animator: Animator | undefined): readonly [number, number] {
  const lifted = shadow.lifted;
  if (lifted && animator && animator.current === lifted.clip && lifted.frames.includes(animator.state.frameIndex)) {
    return lifted.widths;
  }
  return shadow.widths;
}

/**
 * Draws each DropShadow as two centered 1-pixel rows at the feet, before
 * the sprites (order -0.5: after the camera, before render-sprites) so the
 * character covers its own shadow. A factory: needs the white-pixel texture.
 */
export function createRenderShadowsSystem(whitePixel: TextureHandle): RenderSystem {
  return {
    name: 'roguelite:render-shadows',
    order: -0.5,
    run: (ctx) => {
      for (const [id, position, shadow] of ctx.world.query([Position, DropShadow] as const)) {
        if (ctx.world.get(id, Hidden)) continue;
        const widths = dropShadowWidths(shadow, ctx.world.get(id, Animator));
        widths.forEach((width, row) => {
          ctx.renderer.submitSprite({
            layer: GAMEPLAY_LAYER,
            texture: whitePixel,
            sx: 0,
            sy: 0,
            sWidth: 1,
            sHeight: 1,
            x: Math.round(position.x - width / 2),
            y: Math.round(position.y) + row,
            width,
            height: 1,
            tint: [0, 0, 0, shadow.alpha],
            depth: position.y - 0.5, // just behind its own body
          });
        });
      }
    },
  };
}
