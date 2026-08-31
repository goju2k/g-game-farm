import { buildInputFrame, type RawInputState } from './frame-builder.js';

function rawState(overrides: Partial<RawInputState> = {}): RawInputState {
  return {
    keyboard: { held: new Set() },
    mouse: { heldButtons: new Set(), position: undefined, wheelDeltaY: 0 },
    gamepads: [],
    ...overrides,
  };
}

describe('buildInputFrame — keyboard/mouse', () => {
  it('produces edges for keyboard and mouse using the same rules as the first poll (previous undefined)', () => {
    const current = rawState({ keyboard: { held: new Set(['KeyA']) } });
    const frame = buildInputFrame(current, undefined);

    expect(frame.keyboard.held.has('KeyA')).toBe(true);
    expect(frame.keyboard.justPressed.has('KeyA')).toBe(true);
  });

  it('diffs keyboard/mouse against the previous poll', () => {
    const previous = rawState({ keyboard: { held: new Set(['KeyA']) } });
    const current = rawState({ keyboard: { held: new Set() } });
    const frame = buildInputFrame(current, previous);

    expect(frame.keyboard.held.size).toBe(0);
    expect(frame.keyboard.justReleased.has('KeyA')).toBe(true);
  });

  it('passes mouse position and wheelDeltaY through unchanged', () => {
    const current = rawState({ mouse: { heldButtons: new Set(), position: { x: 12, y: 34 }, wheelDeltaY: -5 } });
    const frame = buildInputFrame(current, undefined);

    expect(frame.mouse.position).toEqual({ x: 12, y: 34 });
    expect(frame.mouse.wheelDeltaY).toBe(-5);
  });

  it('leaves mouse position undefined when the raw state has none', () => {
    const frame = buildInputFrame(rawState(), undefined);
    expect(frame.mouse.position).toBeUndefined();
  });

  it('diffs mouse buttons against the previous poll', () => {
    const previous = rawState({ mouse: { heldButtons: new Set(['left']), position: undefined, wheelDeltaY: 0 } });
    const current = rawState({ mouse: { heldButtons: new Set(['left', 'right']), position: undefined, wheelDeltaY: 0 } });
    const frame = buildInputFrame(current, previous);

    expect(frame.mouse.buttons.held.has('left')).toBe(true);
    expect(frame.mouse.buttons.justPressed.has('right')).toBe(true);
    expect(frame.mouse.buttons.justPressed.has('left')).toBe(false);
  });
});

describe('buildInputFrame — gamepads', () => {
  it('diffs a gamepad present in both polls by matching index', () => {
    const previous = rawState({
      gamepads: [{ index: 0, id: 'pad-a', heldButtons: new Set([0]), buttonValues: [1], axes: [0, 0, 0, 0] }],
    });
    const current = rawState({
      gamepads: [{ index: 0, id: 'pad-a', heldButtons: new Set([0, 1]), buttonValues: [1, 1], axes: [0, 0, 0, 0] }],
    });
    const frame = buildInputFrame(current, previous);

    expect(frame.gamepads).toHaveLength(1);
    expect(frame.gamepads[0].buttons.held.has(0)).toBe(true);
    expect(frame.gamepads[0].buttons.justPressed.has(1)).toBe(true);
    expect(frame.gamepads[0].buttons.justPressed.has(0)).toBe(false);
  });

  it('treats a newly connected gamepad (no entry in previous) as a fresh first poll', () => {
    const previous = rawState({ gamepads: [] });
    const current = rawState({
      gamepads: [{ index: 0, id: 'pad-a', heldButtons: new Set([0]), buttonValues: [1], axes: [0, 0, 0, 0] }],
    });
    const frame = buildInputFrame(current, previous);

    expect(frame.gamepads[0].buttons.justPressed.has(0)).toBe(true);
  });

  it('drops a gamepad that disconnected between polls without crashing', () => {
    const previous = rawState({
      gamepads: [{ index: 0, id: 'pad-a', heldButtons: new Set([0]), buttonValues: [1], axes: [0, 0, 0, 0] }],
    });
    const current = rawState({ gamepads: [] });

    expect(() => buildInputFrame(current, previous)).not.toThrow();
    expect(buildInputFrame(current, previous).gamepads).toEqual([]);
  });

  it('diffs multiple simultaneous gamepads independently by index', () => {
    const previous = rawState({
      gamepads: [
        { index: 0, id: 'pad-a', heldButtons: new Set([0]), buttonValues: [1], axes: [0, 0, 0, 0] },
        { index: 1, id: 'pad-b', heldButtons: new Set(), buttonValues: [0], axes: [0, 0, 0, 0] },
      ],
    });
    const current = rawState({
      gamepads: [
        { index: 0, id: 'pad-a', heldButtons: new Set([0]), buttonValues: [1], axes: [0, 0, 0, 0] },
        { index: 1, id: 'pad-b', heldButtons: new Set([2]), buttonValues: [0, 0, 1], axes: [0, 0, 0, 0] },
      ],
    });
    const frame = buildInputFrame(current, previous);

    const padA = frame.gamepads.filter((pad) => pad.index === 0)[0];
    const padB = frame.gamepads.filter((pad) => pad.index === 1)[0];
    expect(padA.buttons.justPressed.size).toBe(0);
    expect(padB.buttons.justPressed.has(2)).toBe(true);
  });
});
