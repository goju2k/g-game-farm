import { add, cross, dot, length, normalize, scale, sub } from './vec3.js';

describe('vec3', () => {
  it('add', () => {
    expect(add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('sub', () => {
    expect(sub({ x: 4, y: 5, z: 6 }, { x: 1, y: 2, z: 3 })).toEqual({ x: 3, y: 3, z: 3 });
  });

  it('scale', () => {
    expect(scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
  });

  it('dot', () => {
    expect(dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32); // 4+10+18
  });

  it('cross — right-handed basis: x cross y = z', () => {
    expect(cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('cross — y cross z = x', () => {
    expect(cross({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 })).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('length', () => {
    expect(length({ x: 3, y: 4, z: 0 })).toBe(5);
  });

  it('normalize', () => {
    const n = normalize({ x: 3, y: 4, z: 0 });
    expect(n.x).toBeCloseTo(0.6, 9);
    expect(n.y).toBeCloseTo(0.8, 9);
    expect(n.z).toBe(0);
  });

  it('normalize of a zero vector returns zero, not NaN', () => {
    expect(normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});
