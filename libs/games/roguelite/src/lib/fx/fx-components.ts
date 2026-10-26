import { defineComponent } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';

/** Whitens an entity's whole sprite while > 0 (render-sprites passes SpriteDraw.flash) — the hit flash. */
export interface HitFlash {
  readonly framesLeft: number;
}
export const HitFlash = defineComponent<HitFlash>('roguelite:HitFlash');

/**
 * A one-shot effect playing clips of one anim asset in order, then removing
 * itself. A step without `ms` lasts until its (non-looping) clip finishes; a
 * step with `ms` (typically a looping clip, like the fire pillar's burn) lasts
 * that long.
 */
export interface Fx {
  readonly steps: readonly { readonly clip: string; readonly ms?: number }[];
  readonly index: number;
  readonly elapsedMs: number;
}
export const Fx = defineComponent<Fx>('roguelite:Fx');

/** The anim assets effects and sentinels draw from, by id — a room singleton, so any system can spawn an effect. */
export interface FxLibrary {
  readonly assets: Readonly<Record<string, LoadedAnimAsset>>;
}
export const FxLibrary = defineComponent<FxLibrary>('roguelite:FxLibrary');

export const FX_COMPONENTS = [HitFlash, Fx, FxLibrary] as const;
