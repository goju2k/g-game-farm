import { add, scale, type Vec3 } from '@g-game-farm/engine-math';
import { cameraBasis } from './camera-3d.js';
import type { CameraPose, SpriteDraw } from './types.js';

export interface Quad3D {
  readonly topLeft: Vec3;
  readonly topRight: Vec3;
  readonly bottomLeft: Vec3;
  readonly bottomRight: Vec3;
}

/**
 * The four world-space corners of one sprite draw, before any camera
 * transform is applied (that happens later, once per layer, via that
 * layer's view-projection matrix — see sprite-batch-renderer.ts's flush()).
 *
 * 'ground' quads need no camera input at all: they're a flat rect on the
 * world XY plane at height `z`, exactly reproducing every sprite this
 * engine drew before this feature existed. 'billboard' quads use the
 * SAME camera pose that will go on to build this layer's view matrix, via
 * cameraBasis() — so a billboard always faces the camera actually drawing
 * it (there is no cross-layer billboarding, and no separate "billboard
 * camera" concept).
 */
export function computeQuad3D(draw: SpriteDraw, cameraPose: CameraPose): Quad3D {
  const z = draw.z ?? 0;
  const topLeft: Vec3 = { x: draw.x, y: draw.y, z };

  if ((draw.orientation ?? 'ground') === 'ground') {
    return {
      topLeft,
      topRight: { x: draw.x + draw.width, y: draw.y, z },
      bottomLeft: { x: draw.x, y: draw.y + draw.height, z },
      bottomRight: { x: draw.x + draw.width, y: draw.y + draw.height, z },
    };
  }

  const { right, up } = cameraBasis(cameraPose);
  const rightOffset = scale(right, draw.width);
  const downOffset = scale(up, -draw.height); // width/height extend along the camera's right/DOWN axes, matching SpriteDraw.orientation's doc comment (up.y is negative at rest, so "down" = -up).
  return {
    topLeft,
    topRight: add(topLeft, rightOffset),
    bottomLeft: add(topLeft, downOffset),
    bottomRight: add(add(topLeft, rightOffset), downOffset),
  };
}
