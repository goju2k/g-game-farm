import { createEngine } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { RoomClock } from '../components.js';
import { advanceRoomClockSystem, tileFrameAt } from './render-tilemap.js';

describe('tileFrameAt', () => {
  const frames = [
    { sx: 0, sy: 0, durationMs: 100 },
    { sx: 16, sy: 0, durationMs: 50 },
    { sx: 32, sy: 0, durationMs: 50 },
  ];

  it('walks the frames by duration, switching exactly on each boundary', () => {
    expect(tileFrameAt(frames, 0).sx).toBe(0);
    expect(tileFrameAt(frames, 99).sx).toBe(0);
    expect(tileFrameAt(frames, 100).sx).toBe(16);
    expect(tileFrameAt(frames, 149).sx).toBe(16);
    expect(tileFrameAt(frames, 150).sx).toBe(32);
    expect(tileFrameAt(frames, 199).sx).toBe(32);
  });

  it('loops forever', () => {
    expect(tileFrameAt(frames, 200).sx).toBe(0);
    expect(tileFrameAt(frames, 200 * 1000 + 120).sx).toBe(16);
  });
});

describe('advanceRoomClockSystem', () => {
  it('adds each simulation step to the room clock', () => {
    const engine = createEngine({ fixedDeltaMs: 10 });
    engine.registerComponents([RoomClock]);
    engine.registerSystems({ simulation: [advanceRoomClockSystem] });
    engine.registerScenes([{ name: 's', setup: (world) => world.set(world.createEntity(), RoomClock, { elapsedMs: 0 }) }]);
    engine.loadScene('s');
    engine.tick(35);
    const [[, clock]] = [...engine.world.query([RoomClock] as const)];
    expect(clock.elapsedMs).toBe(30);
  });
});
