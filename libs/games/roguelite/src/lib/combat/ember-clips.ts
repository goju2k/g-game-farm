import type { SpriteAnimation } from '@g-game-farm/ribs';
import type { LoadedAnimAsset } from '../anim/anim-asset.js';

/**
 * The ember look (Act 1 player) for the graybox, borrowed from the child
 * form's dash — the frames where it scatters into an ember (planning D-008:
 * the real ember sprite, player-ember, is the asset room's job). Frame
 * numbers are player-child's 9-frame `dash` clip (v7+): 2-4 = travelling
 * streak, 5 = the ember spread wide — the only ember-only frames.
 */
const IDLE_FRAMES = [5];
const TRAVEL_FRAMES = [2, 3, 4];
const CHARGE_FRAME = 5;
const RECOVER_FRAME = 5;

export function createEmberClips(child: LoadedAnimAsset, ember?: LoadedAnimAsset): Record<string, SpriteAnimation> {
  const dash = child.clips['dash'];
  if (!dash || dash.frames.length < 6) {
    throw new Error('createEmberClips: player-child needs its dash clip with ember frames 2-5.');
  }
  // Tags are dropped: they belong to the child's own dash timing, not these phase clips.
  const frame = (i: number, durationMs: number) => ({ ...dash.frames[i], durationMs, tags: undefined });
  const clip = (name: string, loop: boolean, frames: ReturnType<typeof frame>[]): SpriteAnimation => ({ name: `ember:${name}`, texture: child.texture, loop, frames });
  return {
    // The ember's own art (player-ember: a heartbeat, same frame size and anchor as the child) when it's loaded.
    idle: ember?.clips['idle'] ?? clip('idle', true, IDLE_FRAMES.map((i) => frame(i, 160))),
    charge: clip('charge', false, [frame(CHARGE_FRAME, 1000)]),
    travel: clip('travel', true, TRAVEL_FRAMES.map((i) => frame(i, 45))),
    recover: clip('recover', false, [frame(RECOVER_FRAME, 1000)]),
  };
}
