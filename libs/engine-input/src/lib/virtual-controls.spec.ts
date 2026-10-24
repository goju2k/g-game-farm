import { describe, expect, it } from 'vitest';
import { mergeInputEdges } from './input-edges.js';
import { EMPTY_INPUT_FRAME } from './types.js';
import { createVirtualControls } from './virtual-controls.js';

describe('createVirtualControls', () => {
  it('a tap between two polls still shows up once as pressed and released', () => {
    const controls = createVirtualControls();
    controls.press('parry');
    controls.release('parry');
    const frame = controls.poll();
    expect(frame.buttons.justPressed.has('parry')).toBe(true);
    expect(frame.buttons.justReleased.has('parry')).toBe(true);
    expect(frame.buttons.held.has('parry')).toBe(false);
    const next = controls.poll();
    expect(next.buttons.justPressed.size).toBe(0);
  });

  it('held buttons stay held across polls without re-pressing', () => {
    const controls = createVirtualControls();
    controls.press('dash');
    controls.poll();
    controls.press('dash'); // already held: no new edge
    const frame = controls.poll();
    expect(frame.buttons.held.has('dash')).toBe(true);
    expect(frame.buttons.justPressed.size).toBe(0);
  });

  it('carries axes and aim, and reset releases everything', () => {
    const controls = createVirtualControls();
    controls.press('dash');
    controls.setAxis('moveX', 1);
    controls.setAim({ x: 3, y: 4 });
    expect(controls.poll()).toMatchObject({ axes: { moveX: 1 }, aim: { x: 3, y: 4 } });
    controls.reset();
    const frame = controls.poll();
    expect(frame.buttons.justReleased.has('dash')).toBe(true);
    expect(frame.axes).toEqual({ moveX: 0 });
    expect(frame.aim).toBeUndefined();
  });

  it('virtual edges survive a tick that ran no simulation step (mergeInputEdges)', () => {
    const controls = createVirtualControls();
    controls.press('parry');
    const first = { ...EMPTY_INPUT_FRAME, virtual: controls.poll() };
    const second = { ...EMPTY_INPUT_FRAME, virtual: controls.poll() };
    expect(mergeInputEdges(first, second).virtual.buttons.justPressed.has('parry')).toBe(true);
  });
});
