import { computeDigitalState } from './digital-state.js';

describe('computeDigitalState', () => {
  it('treats everything held on the first poll (previousHeld undefined) as justPressed', () => {
    const result = computeDigitalState<string>(undefined, new Set(['KeyA', 'KeyB']));
    expect([...result.held].sort()).toEqual(['KeyA', 'KeyB']);
    expect([...result.justPressed].sort()).toEqual(['KeyA', 'KeyB']);
    expect(result.justReleased.size).toBe(0);
  });

  it('reports a key with no prior or current state as neither held nor an edge', () => {
    const result = computeDigitalState<string>(new Set(), new Set());
    expect(result.held.size).toBe(0);
    expect(result.justPressed.size).toBe(0);
    expect(result.justReleased.size).toBe(0);
  });

  it('reports a key held in both polls as held, with no edge', () => {
    const result = computeDigitalState<string>(new Set(['KeyA']), new Set(['KeyA']));
    expect(result.held.has('KeyA')).toBe(true);
    expect(result.justPressed.has('KeyA')).toBe(false);
    expect(result.justReleased.has('KeyA')).toBe(false);
  });

  it('reports a key only in currentHeld as justPressed', () => {
    const result = computeDigitalState<string>(new Set(), new Set(['KeyA']));
    expect(result.held.has('KeyA')).toBe(true);
    expect(result.justPressed.has('KeyA')).toBe(true);
    expect(result.justReleased.has('KeyA')).toBe(false);
  });

  it('reports a key only in previousHeld as justReleased and not held', () => {
    const result = computeDigitalState<string>(new Set(['KeyA']), new Set());
    expect(result.held.has('KeyA')).toBe(false);
    expect(result.justPressed.has('KeyA')).toBe(false);
    expect(result.justReleased.has('KeyA')).toBe(true);
  });

  it('handles a mix of held/pressed/released keys independently in one call', () => {
    const previous = new Set(['Held', 'Released']);
    const current = new Set(['Held', 'Pressed']);
    const result = computeDigitalState<string>(previous, current);

    expect([...result.held].sort()).toEqual(['Held', 'Pressed']);
    expect([...result.justPressed]).toEqual(['Pressed']);
    expect([...result.justReleased]).toEqual(['Released']);
  });

  it('does not alias the input sets — mutating currentHeld afterward does not affect the result', () => {
    const currentHeld = new Set(['KeyA']);
    const result = computeDigitalState<string>(undefined, currentHeld);

    currentHeld.add('KeyB');
    currentHeld.delete('KeyA');

    expect([...result.held]).toEqual(['KeyA']);
    expect([...result.justPressed]).toEqual(['KeyA']);
  });
});
