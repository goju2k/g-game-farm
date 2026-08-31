import { computeQuad3D } from './quad3d.js';
import type { SpriteDraw } from './types.js';

const baseDraw: Omit<SpriteDraw, 'orientation' | 'z'> = {
  layer: 'gameplay',
  texture: 0 as SpriteDraw['texture'],
  sx: 0, sy: 0, sWidth: 16, sHeight: 16,
  x: 10, y: 20, width: 4, height: 2,
};

const topDownCamera = { x: 0, y: 0, zoom: 1 };

describe('computeQuad3D — ground orientation', () => {
  it('is a flat rect on the world XY plane at z=0 by default, independent of the camera', () => {
    const quad = computeQuad3D(baseDraw, topDownCamera);
    expect(quad.topLeft).toEqual({ x: 10, y: 20, z: 0 });
    expect(quad.topRight).toEqual({ x: 14, y: 20, z: 0 });
    expect(quad.bottomLeft).toEqual({ x: 10, y: 22, z: 0 });
    expect(quad.bottomRight).toEqual({ x: 14, y: 22, z: 0 });
  });

  it('is the default when orientation is omitted', () => {
    const withOrientation = computeQuad3D({ ...baseDraw, orientation: 'ground' }, topDownCamera);
    const withoutOrientation = computeQuad3D(baseDraw, topDownCamera);
    expect(withoutOrientation).toEqual(withOrientation);
  });

  it('respects an explicit z, still flat', () => {
    const quad = computeQuad3D({ ...baseDraw, z: 5 }, topDownCamera);
    expect(quad.topLeft.z).toBe(5);
    expect(quad.topRight.z).toBe(5);
    expect(quad.bottomLeft.z).toBe(5);
    expect(quad.bottomRight.z).toBe(5);
  });

  it('gives the same result regardless of camera rotation (ground quads ignore the camera entirely)', () => {
    const a = computeQuad3D(baseDraw, topDownCamera);
    const b = computeQuad3D(baseDraw, { x: 0, y: 0, zoom: 1, yawRadians: 1, pitchRadians: 0.4 });
    expect(a).toEqual(b);
  });
});

describe('computeQuad3D — billboard orientation', () => {
  it('at the default top-down camera, matches the ground quad shape exactly (right=+X, down=+Y)', () => {
    const ground = computeQuad3D(baseDraw, topDownCamera);
    const billboard = computeQuad3D({ ...baseDraw, orientation: 'billboard' }, topDownCamera);
    expect(billboard.topLeft).toEqual(ground.topLeft);
    expect(billboard.topRight.x).toBeCloseTo(ground.topRight.x, 9);
    expect(billboard.topRight.y).toBeCloseTo(ground.topRight.y, 9);
    expect(billboard.bottomLeft.x).toBeCloseTo(ground.bottomLeft.x, 9);
    expect(billboard.bottomLeft.y).toBeCloseTo(ground.bottomLeft.y, 9);
  });

  it('at a horizon-level camera (pitch=0), height extends downward along world -Z instead of +Y', () => {
    const quad = computeQuad3D({ ...baseDraw, orientation: 'billboard' }, { x: 0, y: 0, zoom: 1, pitchRadians: 0 });
    expect(quad.topRight.x).toBeCloseTo(14, 9);
    expect(quad.topRight.y).toBeCloseTo(20, 9);
    expect(quad.topRight.z).toBeCloseTo(0, 9);
    expect(quad.bottomLeft.x).toBeCloseTo(10, 9);
    expect(quad.bottomLeft.y).toBeCloseTo(20, 9);
    expect(quad.bottomLeft.z).toBeCloseTo(-2, 9); // height=2 extends along -up=(0,0,-1)
  });

  it('a 90deg yaw rotates which world axis "right" extends along', () => {
    const quad = computeQuad3D({ ...baseDraw, orientation: 'billboard' }, { x: 0, y: 0, zoom: 1, yawRadians: Math.PI / 2 });
    // right basis becomes (0,1,0) at yaw=90deg (see camera-3d.spec.ts) -> width extends along +Y instead of +X
    expect(quad.topRight.x).toBeCloseTo(10, 9);
    expect(quad.topRight.y).toBeCloseTo(24, 9);
  });
});
