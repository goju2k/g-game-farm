import { intersection, overlaps, type AABB } from './aabb.js';

const box = (x: number, y: number, width: number, height: number): AABB => ({ x, y, width, height });

describe('overlaps', () => {
  it('is true for identical boxes', () => {
    expect(overlaps(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBe(true);
  });

  it('is false when separated on the x axis', () => {
    expect(overlaps(box(0, 0, 10, 10), box(20, 0, 10, 10))).toBe(false);
  });

  it('is false when separated on the y axis', () => {
    expect(overlaps(box(0, 0, 10, 10), box(0, 20, 10, 10))).toBe(false);
  });

  it('is false when boxes only touch at an edge', () => {
    expect(overlaps(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(false);
  });

  it('is true for full containment', () => {
    expect(overlaps(box(0, 0, 10, 10), box(2, 2, 2, 2))).toBe(true);
  });

  it('is true when only corners overlap', () => {
    expect(overlaps(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBe(true);
  });

  it('is false for a zero-width or zero-height box against anything', () => {
    expect(overlaps(box(5, 5, 0, 10), box(0, 0, 10, 10))).toBe(false);
    expect(overlaps(box(5, 5, 10, 0), box(0, 0, 10, 10))).toBe(false);
  });
});

describe('intersection', () => {
  it('returns the exact overlap rect for a partial overlap', () => {
    expect(intersection(box(0, 0, 10, 10), box(5, 5, 10, 10))).toEqual(box(5, 5, 5, 5));
  });

  it('returns undefined for disjoint boxes', () => {
    expect(intersection(box(0, 0, 10, 10), box(20, 20, 10, 10))).toBeUndefined();
  });

  it('returns the smaller box unchanged under full containment', () => {
    expect(intersection(box(0, 0, 10, 10), box(2, 2, 2, 2))).toEqual(box(2, 2, 2, 2));
  });

  it('returns undefined for boxes that only touch at an edge', () => {
    expect(intersection(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBeUndefined();
  });
});
