import type { SpriteDraw } from '../render/types.js';
import type { AnimationPlayerState, AnimationStepResult, EnteredFrame, SpriteAnimation } from './types.js';

/** Bare default for a component's initial value, before any clip has been assigned. */
export function createAnimationPlayerState(): AnimationPlayerState {
  return { frameIndex: 0, elapsedInFrameMs: 0, finished: false };
}

export function frameTagsOf(clip: SpriteAnimation, frameIndex: number): readonly string[] {
  return clip.frames[frameIndex].tags ?? [];
}

/**
 * Begins playing `clip` from frame 0, including firing frame 0's own entry
 * (its tags land in `entered`). This exists as a separate function from
 * `stepAnimationPlayer` because that one only ever produces `entered` on a
 * *transition* — the moment a clip is first assigned, no transition has
 * happened yet, so a frame-0 tag (e.g. an instant hitbox) would otherwise
 * never fire. Call this whenever a system assigns/switches an entity onto a
 * clip; call `stepAnimationPlayer` to continue one already playing.
 */
export function startAnimationPlayer(clip: SpriteAnimation): AnimationStepResult {
  if (clip.frames.length === 0) {
    throw new Error(`SpriteAnimation "${clip.name}" has no frames.`);
  }
  const state: AnimationPlayerState = { frameIndex: 0, elapsedInFrameMs: 0, finished: false };
  return { state, entered: [{ frameIndex: 0, tags: frameTagsOf(clip, 0) }] };
}

/**
 * Advances `state` by `deltaMs`. Loops internally over as many frame
 * transitions as `deltaMs` covers — a frame whose durationMs is short
 * relative to the fixed simulation step is a real scenario (short hit
 * effects, frame-perfect windows), and skipping straight to the final frame
 * would silently drop every tag on the frames in between. Terminates
 * because `elapsedMs` strictly decreases by a positive `duration` each
 * iteration.
 */
export function stepAnimationPlayer(state: AnimationPlayerState, clip: SpriteAnimation, deltaMs: number): AnimationStepResult {
  if (clip.frames.length === 0) {
    throw new Error(`SpriteAnimation "${clip.name}" has no frames.`);
  }
  if (state.frameIndex < 0 || state.frameIndex >= clip.frames.length) {
    throw new Error(
      `AnimationPlayerState.frameIndex (${state.frameIndex}) is out of range for "${clip.name}" ` +
        `(${clip.frames.length} frames) — reset with createAnimationPlayerState()/startAnimationPlayer() after switching clips.`,
    );
  }
  if (state.finished || deltaMs <= 0) {
    return { state, entered: [] };
  }

  let frameIndex = state.frameIndex;
  let elapsedMs = state.elapsedInFrameMs + deltaMs;
  const entered: EnteredFrame[] = [];

  for (;;) {
    const duration = clip.frames[frameIndex].durationMs;
    if (duration <= 0) {
      throw new Error(`"${clip.name}" frame ${frameIndex} has non-positive durationMs (${duration}).`);
    }
    if (elapsedMs < duration) {
      break;
    }
    elapsedMs -= duration;

    const isLast = frameIndex === clip.frames.length - 1;
    if (isLast && !clip.loop) {
      return { state: { frameIndex, elapsedInFrameMs: duration, finished: true }, entered };
    }
    frameIndex = isLast ? 0 : frameIndex + 1;
    entered.push({ frameIndex, tags: frameTagsOf(clip, frameIndex) });
  }

  return { state: { frameIndex, elapsedInFrameMs: elapsedMs, finished: false }, entered };
}

/** What to draw for the current frame — position isn't the engine's to know (no Transform component), so combining this with world coordinates is the game's render system's job. */
export function spriteAnimationSource(
  clip: SpriteAnimation,
  frameIndex: number,
): Pick<SpriteDraw, 'texture' | 'sx' | 'sy' | 'sWidth' | 'sHeight'> {
  if (frameIndex < 0 || frameIndex >= clip.frames.length) {
    throw new Error(`"${clip.name}" has no frame ${frameIndex} (${clip.frames.length} frames).`);
  }
  const frame = clip.frames[frameIndex];
  return { texture: clip.texture, sx: frame.sx, sy: frame.sy, sWidth: frame.sWidth, sHeight: frame.sHeight };
}
