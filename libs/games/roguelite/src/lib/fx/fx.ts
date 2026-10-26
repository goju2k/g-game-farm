import { spriteAnimationSource, type EntityId, type System, type World } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';
import { playClip, startAnimator } from '../anim/play-clip.js';
import { Animator, LightEmitter, Position, SpriteRender } from '../components.js';
import { WARM_LIGHT } from '../lighting/dungeon-lighting.js';
import { LIGHT_MOTION } from '../lighting/light-motion.js';
import { ABOVE_ACTORS } from '../systems/render-sprites.js';
import { Fx, FxLibrary, HitFlash, type FxLight, type FxStep } from './fx-components.js';

/** The room's effect assets, or undefined (headless tests, rooms without art) — callers then fall back to graybox shapes. */
export function fxAsset(world: World, id: string): LoadedAnimAsset | undefined {
  for (const [, library] of world.query([FxLibrary] as const)) return library.assets[id];
  return undefined;
}

/** SpriteRender for an anim asset's clip frame 0, anchored at its anchor (Position = anchor point). */
export function spriteFor(asset: LoadedAnimAsset, clip: string, options: { readonly flipX?: boolean; readonly rotation?: number; readonly scale?: number } = {}): SpriteRender {
  const [width, height] = asset.asset.frameSize;
  const scale = options.scale ?? 1;
  return {
    ...spriteAnimationSource(asset.clips[clip], 0),
    layer: 'gameplay',
    width: width * scale,
    height: height * scale,
    originX: asset.asset.anchor[0] * scale,
    originY: asset.asset.anchor[1] * scale,
    ...(options.flipX ? { flipX: true } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
  };
}

/**
 * Plays effect `id` at `at` (its anchor point): the given clip steps in
 * order, then the entity removes itself. No-op without the asset.
 */
export function spawnFx(
  world: World,
  id: string,
  at: Readonly<{ x: number; y: number }>,
  wanted: readonly FxStep[],
  options: { readonly flipX?: boolean; readonly rotation?: number; readonly scale?: number; readonly aboveActors?: boolean; readonly light?: FxLight } = {},
): EntityId | undefined {
  const asset = fxAsset(world, id);
  // Steps whose clip this art doesn't have are skipped (data may name clips ahead of the art).
  const steps = asset ? wanted.filter((step) => step.clip in asset.clips) : [];
  if (!asset || steps.length === 0) return undefined;
  const entity = world.createEntity();
  world.set(entity, Position, { x: at.x, y: at.y });
  const sprite = spriteFor(asset, steps[0].clip, options);
  world.set(entity, SpriteRender, options.aboveActors ? { ...sprite, depthOffset: ABOVE_ACTORS } : sprite);
  world.set(entity, Animator, startAnimator(asset.clips, steps[0].clip));
  world.set(entity, Fx, { steps, index: 0, elapsedMs: 0, ...(options.light ? { light: options.light } : {}) });
  if (options.light) world.set(entity, LightEmitter, { offsetX: 0, offsetY: options.light.offsetY, radius: options.light.radius, tint: WARM_LIGHT, motion: LIGHT_MOTION.brazier });
  return entity;
}

/** The light level `elapsedMs` into step `index`: from the previous step's level (1 before the first) toward this one's, over the step. */
export function fxLightLevel(steps: readonly FxStep[], index: number, elapsedMs: number, clipMs: number): number {
  const from = index === 0 ? 1 : (steps[index - 1].light ?? 1);
  const to = steps[index].light ?? from;
  const length = steps[index].ms ?? clipMs;
  const t = length > 0 ? Math.min(1, elapsedMs / length) : 1;
  return from + (to - from) * t;
}

/** Advances effect steps and removes finished effects; counts down hit flashes. Simulation, after the animator. */
export const fxSystem: System = {
  name: 'roguelite:fx',
  order: 1.5,
  run: (ctx) => {
    for (const [id, fx, animator] of ctx.world.query([Fx, Animator] as const)) {
      const step = fx.steps[fx.index];
      const elapsedMs = fx.elapsedMs + ctx.deltaMs;
      const done = step.ms !== undefined ? elapsedMs >= step.ms : animator.state.finished;
      if (fx.light) {
        const clip = animator.clips[step.clip];
        const clipMs = clip ? clip.frames.reduce((sum, f) => sum + f.durationMs, 0) / (animator.rate ?? 1) : 0;
        const emitter = ctx.world.get(id, LightEmitter);
        if (emitter) ctx.world.set(id, LightEmitter, { ...emitter, radius: fx.light.radius * fxLightLevel(fx.steps, fx.index, elapsedMs, clipMs) });
      }
      if (!done) {
        ctx.world.set(id, Fx, { ...fx, elapsedMs });
        continue;
      }
      const next = fx.index + 1;
      if (next >= fx.steps.length || !(fx.steps[next].clip in animator.clips)) {
        ctx.world.destroyEntity(id);
        continue;
      }
      ctx.world.set(id, Fx, { ...fx, index: next, elapsedMs: 0 });
      playClip(ctx.world, id, fx.steps[next].clip);
    }
    for (const [id, flash] of ctx.world.query([HitFlash] as const)) {
      if (flash.framesLeft <= 1) ctx.world.remove(id, HitFlash);
      else ctx.world.set(id, HitFlash, { framesLeft: flash.framesLeft - 1 });
    }
  },
};
