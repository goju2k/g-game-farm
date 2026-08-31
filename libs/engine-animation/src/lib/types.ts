import type { TextureHandle } from '@g-game-farm/engine-render';

export interface SpriteAnimationFrame {
  readonly sx: number;
  readonly sy: number;
  readonly sWidth: number;
  readonly sHeight: number;
  /** How long this frame is shown, in ms. Must be > 0. */
  readonly durationMs: number;
  /**
   * Opaque labels fired as AnimationFrameTag events when this frame is
   * entered — hitbox on/off, cancel windows, etc. The engine never
   * interprets these strings; their meaning is entirely game-defined.
   */
  readonly tags?: readonly string[];
}

/**
 * A normalized, engine-ready animation clip — what a build-time Aseprite
 * exporter (out of scope for this phase; see CLAUDE.md's art pipeline
 * section) or hand-authored data is expected to produce. One texture per
 * clip: the art pipeline already atlas-packs at build time, so per-frame
 * textures would have no real use case.
 */
export interface SpriteAnimation {
  /** Identifies the clip in AnimationFrameTag events/error messages — not a key the engine indexes by. */
  readonly name: string;
  readonly texture: TextureHandle;
  readonly frames: readonly SpriteAnimationFrame[];
  readonly loop: boolean;
}

/**
 * Playback progress for one entity's animation slot. Deliberately doesn't
 * know *which* clip it's playing — player.ts takes the clip as a separate
 * argument, so switching clips is just "start over with a different clip",
 * no special-cased transition branch needed. Games embed this in their own
 * component (registered via PluginApi.registerComponents) alongside
 * whatever else that component needs (which clip is active, facing, etc.).
 */
export interface AnimationPlayerState {
  readonly frameIndex: number;
  readonly elapsedInFrameMs: number;
  /** True once a non-looping clip has reached the end of its last frame; further step() calls become no-ops. Always false for a looping clip. */
  readonly finished: boolean;
}

export interface EnteredFrame {
  readonly frameIndex: number;
  readonly tags: readonly string[];
}

export interface AnimationStepResult {
  readonly state: AnimationPlayerState;
  /** Every frame entered by this call, in playback order — can be more than one if durationMs is small relative to deltaMs. */
  readonly entered: readonly EnteredFrame[];
}
