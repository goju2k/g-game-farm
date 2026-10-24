import { describe, expect, it } from 'vitest';
import { mergeInputEdges, withoutInputEdges } from './input-edges.js';
import { EMPTY_INPUT_FRAME, type InputFrame } from './types.js';

function keys(held: string[], pressed: string[] = [], released: string[] = []): InputFrame {
  return { ...EMPTY_INPUT_FRAME, keyboard: { held: new Set(held), justPressed: new Set(pressed), justReleased: new Set(released) } };
}

describe('mergeInputEdges', () => {
  it("keeps the later frame's levels and both frames' edges", () => {
    const merged = mergeInputEdges(keys(['Space'], ['Space']), keys(['KeyW'], ['KeyW'], ['Space']));
    expect([...merged.keyboard.held]).toEqual(['KeyW']);
    expect([...merged.keyboard.justPressed].sort()).toEqual(['KeyW', 'Space']);
    expect([...merged.keyboard.justReleased]).toEqual(['Space']);
  });

  it('merges mouse button edges and keeps the later pointer position', () => {
    const earlier: InputFrame = {
      ...EMPTY_INPUT_FRAME,
      mouse: { ...EMPTY_INPUT_FRAME.mouse, buttons: { held: new Set(), justPressed: new Set(['left']), justReleased: new Set(['left']) }, worldPosition: { x: 1, y: 1 } },
    };
    const later: InputFrame = { ...EMPTY_INPUT_FRAME, mouse: { ...EMPTY_INPUT_FRAME.mouse, worldPosition: { x: 9, y: 9 } } };
    const merged = mergeInputEdges(earlier, later);
    expect(merged.mouse.buttons.justPressed.has('left')).toBe(true);
    expect(merged.mouse.worldPosition).toEqual({ x: 9, y: 9 });
  });
});

describe('withoutInputEdges', () => {
  it('empties edges but keeps what is held', () => {
    const stripped = withoutInputEdges(keys(['Space'], ['Space'], ['KeyW']));
    expect([...stripped.keyboard.held]).toEqual(['Space']);
    expect(stripped.keyboard.justPressed.size).toBe(0);
    expect(stripped.keyboard.justReleased.size).toBe(0);
  });
});
