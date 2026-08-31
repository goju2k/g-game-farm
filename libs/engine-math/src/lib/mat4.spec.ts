import { identity, multiply, orthographic, perspective, rotationX, rotationY, rotationZ, transformDirection, transformPoint, translation } from './mat4.js';

describe('mat4', () => {
  it('identity leaves a point unchanged', () => {
    expect(transformPoint(identity(), { x: 1, y: 2, z: 3 })).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('multiply by identity on either side is a no-op', () => {
    const m = translation(1, 2, 3);
    expect(multiply(identity(), m)).toEqual(m);
    expect(multiply(m, identity())).toEqual(m);
  });

  it('multiply(a, b) applies b first — order matters (not commutative)', () => {
    const rotateThenNothing = multiply(rotationZ(Math.PI / 2), translation(1, 0, 0));
    // translate (0,0,0)->(1,0,0), then rotate 90deg around Z: (1,0,0)->(0,1,0)
    const a = transformPoint(rotateThenNothing, { x: 0, y: 0, z: 0 });
    expect(a.x).toBeCloseTo(0, 9);
    expect(a.y).toBeCloseTo(1, 9);

    const translateThenNothing = multiply(translation(1, 0, 0), rotationZ(Math.PI / 2));
    // rotate origin (stays at origin), then translate: (0,0,0)->(1,0,0)
    const b = transformPoint(translateThenNothing, { x: 0, y: 0, z: 0 });
    expect(b.x).toBeCloseTo(1, 9);
    expect(b.y).toBeCloseTo(0, 9);
  });

  it('translation moves a point by the given offset', () => {
    expect(transformPoint(translation(5, -2, 10), { x: 1, y: 1, z: 1 })).toEqual({ x: 6, y: -1, z: 11 });
  });

  it('translation does not affect a direction (transformDirection ignores it)', () => {
    const d = transformDirection(translation(5, -2, 10), { x: 1, y: 0, z: 0 });
    expect(d).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('rotationX(90deg) rotates world +Z toward world -Y — matches camera-3d.ts basis derivation', () => {
    // Rest "up" (0,0,1) rotated by pitch=90deg becomes (0,-1,0) — hand-verified
    // in the plan against camera-3d.ts's default top-down pose.
    const up = transformPoint(rotationX(Math.PI / 2), { x: 0, y: 0, z: 1 });
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(-1, 9);
    expect(up.z).toBeCloseTo(0, 9);
  });

  it('rotationX(90deg) rotates rest "forward" (0,-1,0) to (0,0,-1) — looking straight down', () => {
    const forward = transformPoint(rotationX(Math.PI / 2), { x: 0, y: -1, z: 0 });
    expect(forward.x).toBeCloseTo(0, 9);
    expect(forward.y).toBeCloseTo(0, 9);
    expect(forward.z).toBeCloseTo(-1, 9);
  });

  it('rotationX leaves the X axis untouched at any angle', () => {
    const p = transformPoint(rotationX(Math.PI / 3), { x: 1, y: 0, z: 0 });
    expect(p).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('rotationY(90deg) rotates +X toward -Z (standard right-handed convention)', () => {
    const p = transformPoint(rotationY(Math.PI / 2), { x: 1, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(-1, 9);
  });

  it('rotationZ(90deg) rotates +X toward +Y (standard right-handed convention)', () => {
    const p = transformPoint(rotationZ(Math.PI / 2), { x: 1, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1, 9);
  });

  it('orthographic maps the view-volume corners to NDC [-1,1]', () => {
    const m = orthographic(-10, 10, -5, 5, 0.1, 100);
    expect(transformPoint(m, { x: 0, y: 0, z: 0 })).toEqual(expect.objectContaining({ x: 0, y: 0 }));
    const topRight = transformPoint(m, { x: 10, y: 5, z: 0 });
    expect(topRight.x).toBeCloseTo(1, 9);
    expect(topRight.y).toBeCloseTo(1, 9);
    const bottomLeft = transformPoint(m, { x: -10, y: -5, z: 0 });
    expect(bottomLeft.x).toBeCloseTo(-1, 9);
    expect(bottomLeft.y).toBeCloseTo(-1, 9);
  });

  it('perspective maps a point on the near-plane frustum edge to NDC x=1 (fovY=90deg, aspect=1)', () => {
    // At fovY=90deg, half-angle=45deg, tan(45deg)=1 -- the frustum's
    // half-width at the near plane (z=-near) equals `near` itself.
    const m = perspective(Math.PI / 2, 1, 1, 100);
    const centerAtNear = transformPoint(m, { x: 0, y: 0, z: -1 });
    expect(centerAtNear.x).toBeCloseTo(0, 9);
    expect(centerAtNear.y).toBeCloseTo(0, 9);
    expect(centerAtNear.z).toBeCloseTo(-1, 9); // near plane maps to NDC z=-1

    const edgeAtNear = transformPoint(m, { x: 1, y: 0, z: -1 });
    expect(edgeAtNear.x).toBeCloseTo(1, 9);
  });
});
