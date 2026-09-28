import { transformPoint } from '@g-game-farm/engine-math';
import { cameraBasis, isDefaultTopDownOrthographic, projectionMatrix, screenToGround, viewMatrix, viewProjectionMatrix } from './camera-3d.js';

const canvas = { width: 640, height: 360 };

/** Test-only: NDC -> screen-pixel-row/col, same convention the GPU viewport transform applies for real (NDC (+1,+1) is the visual top-right, (-1,-1) is the visual bottom-left). */
function ndcToScreen(ndc: { x: number; y: number }, canvasSize: { width: number; height: number }) {
  return {
    x: ((ndc.x + 1) / 2) * canvasSize.width,
    y: ((1 - ndc.y) / 2) * canvasSize.height,
  };
}

describe('camera-3d — cameraBasis', () => {
  it('default pose (top-down) matches today\'s screen-coordinate sign convention', () => {
    const { right, up, forward } = cameraBasis({ x: 0, y: 0, zoom: 1 });
    expect(right.x).toBeCloseTo(1, 9);
    expect(right.y).toBeCloseTo(0, 9);
    expect(right.z).toBeCloseTo(0, 9);
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(-1, 9);
    expect(up.z).toBeCloseTo(0, 9);
    expect(forward.x).toBeCloseTo(0, 9);
    expect(forward.y).toBeCloseTo(0, 9);
    expect(forward.z).toBeCloseTo(-1, 9);
  });

  it('yawRadians rotates right/forward around the vertical (Z) axis', () => {
    const { right, forward } = cameraBasis({ x: 0, y: 0, zoom: 1, yawRadians: Math.PI / 2 });
    expect(right.x).toBeCloseTo(0, 9);
    expect(right.y).toBeCloseTo(1, 9);
    expect(forward.z).toBeCloseTo(-1, 9); // still straight down — yaw alone doesn't change pitch
  });

  it('pitchRadians: 0 gives a horizon-level (not top-down) forward, matching conventional 3D camera expectations', () => {
    const { forward, up } = cameraBasis({ x: 0, y: 0, zoom: 1, pitchRadians: 0 });
    expect(forward.x).toBeCloseTo(0, 9);
    expect(forward.y).toBeCloseTo(-1, 9);
    expect(forward.z).toBeCloseTo(0, 9);
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(0, 9);
    expect(up.z).toBeCloseTo(1, 9);
  });
});

describe('camera-3d — viewMatrix', () => {
  it('at the default pose, view-space X/Y reproduce the old flat-2D formula exactly', () => {
    const pose = { x: 5, y: -3, zoom: 1 };
    const v = viewMatrix(pose);
    const world = { x: 12, y: 7, z: 0 };
    const view = transformPoint(v, world);
    expect(view.x).toBeCloseTo(world.x - pose.x, 9); // worldX - camX
    expect(view.y).toBeCloseTo(pose.y - world.y, 9); // camY - worldY
  });
});

describe('camera-3d — viewProjectionMatrix cross-check against the old (deleted) camera-math.ts', () => {
  it('reproduces computeQuadScreenRect\'s exact screen position for a known case', () => {
    // Old camera-math.spec.ts: computeQuadScreenRect(0.25, 0, 4, 2, {x:0,y:0,zoom:2}, {}, canvas)
    // produced { x: 320.5, y: 180, width: 8, height: 4 } for a 640x360 canvas.
    const pose = { x: 0, y: 0, zoom: 2 };
    const vp = viewProjectionMatrix(pose, canvas);
    const screen = ndcToScreen(transformPoint(vp, { x: 0.25, y: 0, z: 0 }), canvas);
    expect(screen.x).toBeCloseTo(320.5, 9);
    expect(screen.y).toBeCloseTo(180, 9);
  });

  it('reproduces a translated-camera case', () => {
    // Old parallaxFactor test's baseline: camera offset of 50 world units at zoom 1 shifts screen X by -50.
    const base = viewProjectionMatrix({ x: 0, y: 0, zoom: 1 }, canvas);
    const shifted = viewProjectionMatrix({ x: 50, y: 0, zoom: 1 }, canvas);
    const a = ndcToScreen(transformPoint(base, { x: 0, y: 0, z: 0 }), canvas);
    const b = ndcToScreen(transformPoint(shifted, { x: 0, y: 0, z: 0 }), canvas);
    expect(b.x).toBeCloseTo(a.x - 50, 9);
  });
});

describe('camera-3d — projectionMatrix', () => {
  it('defaults to orthographic', () => {
    const pose = { x: 0, y: 0, zoom: 4 };
    const orthoDirect = projectionMatrix(pose, canvas);
    const orthoExplicit = projectionMatrix({ ...pose, projectionKind: 'orthographic' as const }, canvas);
    expect(orthoDirect).toEqual(orthoExplicit);
  });

  it('perspective is a distinct, explicit opt-in', () => {
    const pose = { x: 0, y: 0, zoom: 4, projectionKind: 'perspective' as const };
    const m = projectionMatrix(pose, canvas);
    const orthoM = projectionMatrix({ x: 0, y: 0, zoom: 4 }, canvas);
    expect(m).not.toEqual(orthoM);
  });
});

describe('camera-3d — screenToGround', () => {
  it('at the default top-down pose, is exactly the old flat formula (screen - canvas/2) / zoom + camera', () => {
    const pose = { x: 100, y: 50, zoom: 4 };
    const result = screenToGround(pose, canvas, 400, 90);
    expect(result?.x).toBeCloseTo((400 - canvas.width / 2) / 4 + 100, 9);
    expect(result?.y).toBeCloseTo((90 - canvas.height / 2) / 4 + 50, 9);
  });

  it.each([
    ['default top-down orthographic', { x: 10, y: -20, zoom: 3 }],
    ['yawed + rolled orthographic', { x: 10, y: -20, zoom: 3, yawRadians: 0.4, rollRadians: 0.2 }],
    ['pitched orthographic', { x: 10, y: -20, zoom: 3, pitchRadians: 1.1 }],
    ['pitched perspective', { x: 10, y: -20, z: 300, pitchRadians: 1.2, projectionKind: 'perspective' as const }],
  ])('round-trips a ground point through viewProjectionMatrix — %s', (_label, pose) => {
    const world = { x: 17, y: -9, z: 0 };
    const screen = ndcToScreen(transformPoint(viewProjectionMatrix(pose, canvas), world), canvas);
    const result = screenToGround(pose, canvas, screen.x, screen.y);
    expect(result?.x).toBeCloseTo(world.x, 6);
    expect(result?.y).toBeCloseTo(world.y, 6);
  });

  it('is undefined for a zero-size canvas', () => {
    expect(screenToGround({ x: 0, y: 0, zoom: 1 }, { width: 0, height: 0 }, 0, 0)).toBeUndefined();
  });

  it('is undefined when the view ray never meets the ground (horizon-level orthographic camera)', () => {
    expect(screenToGround({ x: 0, y: 0, zoom: 1, pitchRadians: 0 }, canvas, 320, 180)).toBeUndefined();
  });
});

describe('camera-3d — isDefaultTopDownOrthographic', () => {
  it('true for the bare {x,y,zoom} default pose', () => {
    expect(isDefaultTopDownOrthographic({ x: 0, y: 0, zoom: 4 })).toBe(true);
  });

  it('true when pitch/yaw/roll are explicitly set to their default values', () => {
    expect(isDefaultTopDownOrthographic({ x: 0, y: 0, zoom: 4, yawRadians: 0, pitchRadians: Math.PI / 2, rollRadians: 0 })).toBe(true);
  });

  it('false with any yaw', () => {
    expect(isDefaultTopDownOrthographic({ x: 0, y: 0, zoom: 4, yawRadians: 0.1 })).toBe(false);
  });

  it('false with any roll', () => {
    expect(isDefaultTopDownOrthographic({ x: 0, y: 0, zoom: 4, rollRadians: 0.1 })).toBe(false);
  });

  it('false with a non-top-down pitch', () => {
    expect(isDefaultTopDownOrthographic({ x: 0, y: 0, zoom: 4, pitchRadians: 1 })).toBe(false);
  });

  it('false for perspective projection', () => {
    expect(isDefaultTopDownOrthographic({ x: 0, y: 0, zoom: 4, projectionKind: 'perspective' })).toBe(false);
  });
});
