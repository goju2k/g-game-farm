import type { SpriteAnimation } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';

/**
 * The ember look (Act 1 player) for the graybox, borrowed from the child
 * form's dash — the frames where it scatters into an ember (planning D-008:
 * the real ember sprite is the asset room's job). Frame numbers are
 * player-child's `dash` clip: 3 = ember gathered, 4 = small ember, 5-7 =
 * travelling streak.
 */
const IDLE_FRAMES = [3, 4];
const TRAVEL_FRAMES = [5, 6, 7];
const CHARGE_FRAME = 3;
const RECOVER_FRAME = 4;

export function createEmberClips(child: LoadedAnimAsset): Record<string, SpriteAnimation> {
  const dash = child.clips['dash'];
  if (!dash || dash.frames.length < 8) {
    throw new Error('createEmberClips: player-child needs its 11-frame dash clip (ember frames 3-7).');
  }
  // Tags are dropped: they belong to the child's own dash timing, not these phase clips.
  const frame = (i: number, durationMs: number) => ({ ...dash.frames[i], durationMs, tags: undefined });
  const clip = (name: string, loop: boolean, frames: ReturnType<typeof frame>[]): SpriteAnimation => ({ name: `ember:${name}`, texture: child.texture, loop, frames });
  return {
    idle: clip('idle', true, IDLE_FRAMES.map((i) => frame(i, 160))),
    charge: clip('charge', false, [frame(CHARGE_FRAME, 1000)]),
    travel: clip('travel', true, TRAVEL_FRAMES.map((i) => frame(i, 45))),
    recover: clip('recover', false, [frame(RECOVER_FRAME, 1000)]),
  };
}
