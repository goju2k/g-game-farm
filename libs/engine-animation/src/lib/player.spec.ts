import { TickEventBus } from '@g-game-farm/engine-events';
import type { TextureHandle } from '@g-game-farm/engine-render';
import { AnimationFrameTag, type AnimationFrameTagEvent } from './events.js';
import {
  createAnimationPlayerState,
  frameTagsOf,
  spriteAnimationSource,
  startAnimationPlayer,
  stepAnimationPlayer,
} from './player.js';
import type { SpriteAnimation } from './types.js';

const texture = 0 as TextureHandle;

function clip(overrides: Partial<SpriteAnimation> = {}): SpriteAnimation {
  return {
    name: 'test-clip',
    texture,
    loop: false,
    frames: [
      { sx: 0, sy: 0, sWidth: 16, sHeight: 16, durationMs: 10 },
      { sx: 16, sy: 0, sWidth: 16, sHeight: 16, durationMs: 10, tags: ['mid'] },
      { sx: 32, sy: 0, sWidth: 16, sHeight: 16, durationMs: 10, tags: ['end'] },
    ],
    ...overrides,
  };
}

describe('createAnimationPlayerState', () => {
  it('returns frame 0, no elapsed time, not finished', () => {
    expect(createAnimationPlayerState()).toEqual({ frameIndex: 0, elapsedInFrameMs: 0, finished: false });
  });
});

describe('startAnimationPlayer', () => {
  it('starts at frame 0 and fires frame 0 as entered (including its tags)', () => {
    const withFrame0Tags = clip({
      frames: [{ sx: 0, sy: 0, sWidth: 16, sHeight: 16, durationMs: 10, tags: ['instant-hitbox'] }],
    });
    const result = startAnimationPlayer(withFrame0Tags);

    expect(result.state).toEqual({ frameIndex: 0, elapsedInFrameMs: 0, finished: false });
    expect(result.entered).toEqual([{ frameIndex: 0, tags: ['instant-hitbox'] }]);
  });

  it('throws for a clip with no frames', () => {
    expect(() => startAnimationPlayer(clip({ frames: [] }))).toThrow();
  });
});

describe('stepAnimationPlayer — within one frame', () => {
  it('only accumulates elapsed time when deltaMs stays under the frame duration', () => {
    const state = createAnimationPlayerState();
    const result = stepAnimationPlayer(state, clip(), 4);

    expect(result.state).toEqual({ frameIndex: 0, elapsedInFrameMs: 4, finished: false });
    expect(result.entered).toEqual([]);
  });
});

describe('stepAnimationPlayer — single transition', () => {
  it('advances to the next frame when deltaMs meets or exceeds the duration, carrying the entered frame tags', () => {
    const state = createAnimationPlayerState();
    const result = stepAnimationPlayer(state, clip(), 10);

    expect(result.state).toEqual({ frameIndex: 1, elapsedInFrameMs: 0, finished: false });
    expect(result.entered).toEqual([{ frameIndex: 1, tags: ['mid'] }]);
  });

  it('carries leftover time past the exact boundary', () => {
    const state = createAnimationPlayerState();
    const result = stepAnimationPlayer(state, clip(), 13);

    expect(result.state.frameIndex).toBe(1);
    expect(result.state.elapsedInFrameMs).toBe(3);
  });
});

describe('stepAnimationPlayer — looping', () => {
  it('wraps to frame 0 (and fires its tags) when a looping clip crosses the last frame boundary', () => {
    const looping = clip({ loop: true });
    const state = { frameIndex: 2, elapsedInFrameMs: 0, finished: false };
    const result = stepAnimationPlayer(state, looping, 10);

    expect(result.state).toEqual({ frameIndex: 0, elapsedInFrameMs: 0, finished: false });
    expect(result.entered).toEqual([{ frameIndex: 0, tags: [] }]);
  });

  it('re-fires frame 0 tags on every loop of a single-frame looping clip', () => {
    const singleFrameLoop = clip({
      loop: true,
      frames: [{ sx: 0, sy: 0, sWidth: 16, sHeight: 16, durationMs: 5, tags: ['tick'] }],
    });
    const state = createAnimationPlayerState();
    const result = stepAnimationPlayer(state, singleFrameLoop, 12); // crosses the boundary twice (5, 10)

    expect(result.entered).toEqual([
      { frameIndex: 0, tags: ['tick'] },
      { frameIndex: 0, tags: ['tick'] },
    ]);
    expect(result.state.elapsedInFrameMs).toBe(2);
  });
});

describe('stepAnimationPlayer — non-looping end of clip', () => {
  it('clamps at the last frame, marks finished, and discards leftover time', () => {
    const state = { frameIndex: 2, elapsedInFrameMs: 0, finished: false };
    const result = stepAnimationPlayer(state, clip({ loop: false }), 25); // well past the last frame's duration

    expect(result.state).toEqual({ frameIndex: 2, elapsedInFrameMs: 10, finished: true });
    expect(result.entered).toEqual([]);
  });

  it('is a no-op once finished', () => {
    const finished = { frameIndex: 2, elapsedInFrameMs: 10, finished: true };
    const result = stepAnimationPlayer(finished, clip({ loop: false }), 999);

    expect(result.state).toBe(finished);
    expect(result.entered).toEqual([]);
  });
});

describe('stepAnimationPlayer — multi-frame skip within one call', () => {
  it('crosses several short frames in one step and reports every frame entered, in order', () => {
    const shortFrames = clip({
      loop: true,
      frames: [
        { sx: 0, sy: 0, sWidth: 16, sHeight: 16, durationMs: 5, tags: ['f0'] },
        { sx: 16, sy: 0, sWidth: 16, sHeight: 16, durationMs: 5, tags: ['f1'] },
        { sx: 32, sy: 0, sWidth: 16, sHeight: 16, durationMs: 5, tags: ['f2'] },
      ],
    });
    const state = createAnimationPlayerState();
    // 17ms over 5ms frames: crosses frame0->1 (12 left), 1->2 (7 left), 2->0 (2 left) = 3 transitions
    const result = stepAnimationPlayer(state, shortFrames, 17);

    expect(result.entered).toEqual([
      { frameIndex: 1, tags: ['f1'] },
      { frameIndex: 2, tags: ['f2'] },
      { frameIndex: 0, tags: ['f0'] },
    ]);
    expect(result.state).toEqual({ frameIndex: 0, elapsedInFrameMs: 2, finished: false });
  });

  it('handles looping through the whole clip multiple times in one call without crashing', () => {
    const tiny = clip({
      loop: true,
      frames: [
        { sx: 0, sy: 0, sWidth: 1, sHeight: 1, durationMs: 5 },
        { sx: 0, sy: 0, sWidth: 1, sHeight: 1, durationMs: 5 },
      ],
    }); // total clip length 10ms
    const state = createAnimationPlayerState();

    expect(() => stepAnimationPlayer(state, tiny, 35)).not.toThrow();
    const result = stepAnimationPlayer(state, tiny, 35);
    // 35ms / 10ms-per-lap = 3 full laps + 5ms => ends mid frame 1
    expect(result.state).toEqual({ frameIndex: 1, elapsedInFrameMs: 0, finished: false });
    expect(result.entered).toHaveLength(7); // 3 full laps (2 transitions each) + 1 more transition
  });
});

describe('stepAnimationPlayer — error cases', () => {
  it('throws for a clip with no frames', () => {
    const state = createAnimationPlayerState();
    expect(() => stepAnimationPlayer(state, clip({ frames: [] }), 10)).toThrow();
  });

  it('throws for a non-positive frame duration instead of looping forever', () => {
    const badClip = clip({ frames: [{ sx: 0, sy: 0, sWidth: 16, sHeight: 16, durationMs: 0 }] });
    const state = createAnimationPlayerState();
    expect(() => stepAnimationPlayer(state, badClip, 10)).toThrow();
  });

  it('throws when state.frameIndex is out of range for the given clip (e.g. forgot to reset after switching clips)', () => {
    const staleState = { frameIndex: 5, elapsedInFrameMs: 0, finished: false };
    expect(() => stepAnimationPlayer(staleState, clip(), 10)).toThrow();
  });
});

describe('frameTagsOf', () => {
  it('returns an empty array for a frame with no tags', () => {
    expect(frameTagsOf(clip(), 0)).toEqual([]);
  });

  it('returns the frame tags when present', () => {
    expect(frameTagsOf(clip(), 1)).toEqual(['mid']);
  });
});

describe('spriteAnimationSource', () => {
  it('returns the fields needed to spread into a SpriteDraw source rect', () => {
    expect(spriteAnimationSource(clip(), 1)).toEqual({ texture, sx: 16, sy: 0, sWidth: 16, sHeight: 16 });
  });

  it('throws for an out-of-range frame index', () => {
    expect(() => spriteAnimationSource(clip(), 99)).toThrow();
    expect(() => spriteAnimationSource(clip(), -1)).toThrow();
  });
});

describe('integration: wiring entered frames into an EventBus (the pattern game code will use)', () => {
  it('round-trips entity/clip/frameIndex/tags through emit and read', () => {
    const bus = new TickEventBus();
    const c = clip();
    const entityId = 42;

    const { entered } = stepAnimationPlayer(createAnimationPlayerState(), c, 10);
    for (const frame of entered) {
      if (frame.tags.length > 0) {
        bus.emit(AnimationFrameTag, { entity: entityId as never, clip: c.name, frameIndex: frame.frameIndex, tags: frame.tags });
      }
    }

    expect(bus.read(AnimationFrameTag)).toEqual([{ entity: entityId, clip: 'test-clip', frameIndex: 1, tags: ['mid'] }]);
  });
});

describe('read-only enforcement (type-level)', () => {
  it('does not typecheck if code tries to mutate SpriteAnimation.frames', () => {
    const illegalMutation = () => {
      const c = clip();
      // @ts-expect-error — frames is readonly; push() doesn't exist on it.
      c.frames.push(c.frames[0]);
    };
    expect(typeof illegalMutation).toBe('function');
  });

  it('does not typecheck if code tries to mutate an AnimationFrameTagEvent.tags array', () => {
    const illegalMutation = () => {
      const event: AnimationFrameTagEvent = { entity: 0 as never, clip: 'x', frameIndex: 0, tags: ['a'] };
      // @ts-expect-error — tags is readonly string[]; push() doesn't exist on it.
      event.tags.push('b');
    };
    expect(typeof illegalMutation).toBe('function');
  });
});
