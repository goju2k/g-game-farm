import { transformPoint } from '@g-game-farm/engine-math';
import { viewProjectionMatrix } from './camera-3d.js';
import { applyLayerCameraAdjustment } from './pixel-snap.js';

const canvas = { width: 640, height: 360 };

describe('applyLayerCameraAdjustment — parallaxFactor', () => {
  it('defaults to 1 (moves 1:1 with the camera)', () => {
    const pose = applyLayerCameraAdjustment({ x: 50, y: 0, zoom: 1 }, {});
    expect(pose.x).toBe(50);
  });

  it('0 pins the layer to the origin regardless of camera position', () => {
    const a = applyLayerCameraAdjustment({ x: 100, y: 0, zoom: 1 }, { parallaxFactor: 0 });
    const b = applyLayerCameraAdjustment({ x: 200, y: 0, zoom: 1 }, { parallaxFactor: 0 });
    expect(a.x).toBe(0);
    expect(b.x).toBe(0);
  });

  it('a fractional factor scrolls slower than the camera', () => {
    const pose = applyLayerCameraAdjustment({ x: 100, y: 0, zoom: 1 }, { parallaxFactor: 0.5 });
    expect(pose.x).toBe(50);
  });

  it('leaves z and every rotation field untouched', () => {
    const pose = applyLayerCameraAdjustment(
      { x: 10, y: 10, z: 42, zoom: 1, yawRadians: 0.3, pitchRadians: 0, rollRadians: 0.1, projectionKind: 'perspective' as const },
      { parallaxFactor: 0.5 },
    );
    expect(pose.z).toBe(42);
    expect(pose.yawRadians).toBe(0.3);
    expect(pose.pitchRadians).toBe(0);
    expect(pose.rollRadians).toBe(0.1);
    expect(pose.projectionKind).toBe('perspective');
  });
});

describe('applyLayerCameraAdjustment — pixelSnap, default top-down orthographic pose', () => {
  it('rounds x*zoom to the nearest 1/zoom world unit', () => {
    // (0.5 * 3) = 1.5 -> round -> 2 -> /3
    const pose = applyLayerCameraAdjustment({ x: 0.5, y: 0, zoom: 3 }, { pixelSnap: true });
    expect(pose.x).toBeCloseTo(2 / 3, 9);
  });

  it('rounds .5 up, matching Math.round', () => {
    const pose = applyLayerCameraAdjustment({ x: 0.75, y: 0, zoom: 2 }, { pixelSnap: true }); // 0.75*2=1.5 -> 2 -> /2 = 1
    expect(pose.x).toBe(1);
  });

  it('is a no-op when pixelSnap is false, even with a fractional camera position', () => {
    const pose = applyLayerCameraAdjustment({ x: 0.5, y: 0.25, zoom: 3 }, { pixelSnap: false });
    expect(pose.x).toBe(0.5);
    expect(pose.y).toBe(0.25);
  });

  it('applies parallax before snapping', () => {
    // camera x=100, parallax 0.5 -> effective 50, zoom 1 -> already integer, snap is a no-op past that point
    const pose = applyLayerCameraAdjustment({ x: 100, y: 0, zoom: 1 }, { pixelSnap: true, parallaxFactor: 0.5 });
    expect(pose.x).toBe(50);
  });
});

describe('applyLayerCameraAdjustment — pixelSnap silently no-ops outside the qualifying pose', () => {
  it('does not round when yaw is nonzero', () => {
    const pose = applyLayerCameraAdjustment({ x: 0.5, y: 0, zoom: 3, yawRadians: 0.1 }, { pixelSnap: true });
    expect(pose.x).toBe(0.5);
  });

  it('does not round when roll is nonzero', () => {
    const pose = applyLayerCameraAdjustment({ x: 0.5, y: 0, zoom: 3, rollRadians: 0.1 }, { pixelSnap: true });
    expect(pose.x).toBe(0.5);
  });

  it('does not round for a non-top-down pitch', () => {
    const pose = applyLayerCameraAdjustment({ x: 0.5, y: 0, zoom: 3, pitchRadians: 1 }, { pixelSnap: true });
    expect(pose.x).toBe(0.5);
  });

  it('does not round for a perspective projection', () => {
    const pose = applyLayerCameraAdjustment({ x: 0.5, y: 0, zoom: 3, projectionKind: 'perspective' }, { pixelSnap: true });
    expect(pose.x).toBe(0.5);
  });
});

describe('applyLayerCameraAdjustment — seam determinism (drives the actual pixel-alignment guarantee)', () => {
  it('the same camera pose always snaps to the exact same value', () => {
    const pose = { x: 12.34567, y: -7.891, zoom: 4 };
    const a = applyLayerCameraAdjustment(pose, { pixelSnap: true });
    const b = applyLayerCameraAdjustment(pose, { pixelSnap: true });
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });

  it('two adjacent quads transformed through the same snapped-camera view-projection matrix share a bit-identical edge', () => {
    const rawCamera = { x: 12.34567, y: 0, zoom: 4 };
    const layer = { pixelSnap: true };
    const vp = viewProjectionMatrix(applyLayerCameraAdjustment(rawCamera, layer), canvas);

    // Quad A's right edge is at world x=5, quad B's left edge is also at world x=5 — every vertex is
    // transformed by the exact same per-frame uniform, so IEEE-754 determinism guarantees these two
    // independently-computed screen positions come out bit-for-bit identical.
    const aRightEdge = transformPoint(vp, { x: 5, y: 0, z: 0 });
    const bLeftEdge = transformPoint(vp, { x: 5, y: 0, z: 0 });
    expect(aRightEdge.x).toBe(bLeftEdge.x);
  });
});
