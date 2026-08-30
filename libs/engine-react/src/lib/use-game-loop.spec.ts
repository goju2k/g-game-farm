import { createEngine, createInputCapture, type Engine, type InputCapture } from '@g-game-farm/engine';
import { renderHook } from '@testing-library/react';
import { useGameLoop } from './use-game-loop.js';

/** Headless: no `render` option -> NullRenderer, no WebGL involved — see this file's own doc comment on why <GameCanvas> itself can't be tested this way but this hook can. */
function makeHeadlessEngine(): Engine {
  return createEngine();
}

function makeCapture(): InputCapture {
  return createInputCapture({ target: document.createElement('div') });
}

describe('useGameLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not start the loop while engine or capture is undefined', () => {
    const capture = makeCapture();
    const tickSpy = vi.fn();
    const engine = makeHeadlessEngine();
    engine.tick = tickSpy as typeof engine.tick;

    renderHook(() => useGameLoop(undefined, capture));
    vi.advanceTimersByTime(200);
    expect(tickSpy).not.toHaveBeenCalled();

    renderHook(() => useGameLoop(engine, undefined));
    vi.advanceTimersByTime(200);
    expect(tickSpy).not.toHaveBeenCalled();
  });

  it('calls engine.tick() once per animation frame once both engine and capture are defined', () => {
    const engine = makeHeadlessEngine();
    const capture = makeCapture();
    const tickSpy = vi.spyOn(engine, 'tick');

    renderHook(() => useGameLoop(engine, capture));
    vi.advanceTimersByTime(100);

    expect(tickSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('polls the capture before each tick, passing its InputFrame through', () => {
    const engine = makeHeadlessEngine();
    const capture = makeCapture();
    const tickSpy = vi.spyOn(engine, 'tick');
    const pollSpy = vi.spyOn(capture, 'poll');

    renderHook(() => useGameLoop(engine, capture));
    vi.advanceTimersByTime(50);

    expect(pollSpy).toHaveBeenCalled();
    expect(tickSpy.mock.calls[0]?.[1]).toBe(pollSpy.mock.results[0]?.value);
  });

  it('clamps deltaMs to maxFrameDeltaMs after a large gap (e.g. tab backgrounding)', () => {
    const engine = makeHeadlessEngine();
    const capture = makeCapture();
    const tickSpy = vi.spyOn(engine, 'tick');

    renderHook(() => useGameLoop(engine, capture, { maxFrameDeltaMs: 100 }));
    // First tick's delta is always 0 (no previous timestamp yet) — advance past that,
    // then jump a huge amount of virtual time in one go to simulate a backgrounded tab.
    vi.advanceTimersByTime(16);
    tickSpy.mockClear();
    vi.advanceTimersByTime(5000);

    for (const call of tickSpy.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(100);
    }
    expect(tickSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('cancels the animation frame on unmount — tick() stops being called', () => {
    const engine = makeHeadlessEngine();
    const capture = makeCapture();
    const tickSpy = vi.spyOn(engine, 'tick');

    const { unmount } = renderHook(() => useGameLoop(engine, capture));
    vi.advanceTimersByTime(50);
    expect(tickSpy.mock.calls.length).toBeGreaterThan(0);

    unmount();
    tickSpy.mockClear();
    vi.advanceTimersByTime(200);

    expect(tickSpy).not.toHaveBeenCalled();
  });

  it('invokes onFrame with deltaMs and an incrementing frameCount', () => {
    const engine = makeHeadlessEngine();
    const capture = makeCapture();
    const onFrame = vi.fn();

    renderHook(() => useGameLoop(engine, capture, { onFrame }));
    vi.advanceTimersByTime(50);

    expect(onFrame).toHaveBeenCalled();
    const frameCounts = onFrame.mock.calls.map((call) => call[0].frameCount);
    expect(frameCounts).toEqual([...frameCounts].sort((a, b) => a - b));
    expect(new Set(frameCounts).size).toBe(frameCounts.length);
  });
});
