import {
  dot,
  multiply,
  orthographic,
  perspective,
  rotationX,
  rotationY,
  rotationZ,
  scale,
  transformDirection,
  type Mat4,
  type Vec3,
} from '@g-game-farm/engine-math';
import type { CameraPose } from './types.js';

/**
 * Rest basis (all rotation angles 0). This engine is Z-up: world X/Y keep
 * their existing 2D meaning (X = right, Y = "screen-down" depth axis), Z
 * is height off the ground — deliberately NOT three.js's Y-up, chosen so
 * "2D is the Z=0 special case" is literally true (the ground plane is the
 * world-XY plane at Z=0) rather than requiring every existing X/Y meaning
 * to be relabeled.
 */
const REST_RIGHT: Vec3 = { x: 1, y: 0, z: 0 };
const REST_UP: Vec3 = { x: 0, y: 0, z: 1 };
const REST_FORWARD: Vec3 = { x: 0, y: -1, z: 0 };

/**
 * Camera height default — provably inert for the orthographic, unpitched
 * case (see viewMatrix's doc comment: orthographic projection with the
 * default pitch never reads position.z into the screen-space result), and
 * a reasonable non-degenerate starting distance if a caller opts into
 * `projectionKind:'perspective'` without specifying `z`.
 */
const DEFAULT_CAMERA_Z = 1000;
const DEFAULT_ZOOM = 1;
const DEFAULT_FOV_Y_RADIANS = Math.PI / 3;
const DEFAULT_NEAR = 0.1;
const DEFAULT_FAR = 100000;

function cameraPosition(pose: CameraPose): Vec3 {
  return { x: pose.x, y: pose.y, z: pose.z ?? DEFAULT_CAMERA_Z };
}

/**
 * Standard Tait-Bryan yaw->pitch->roll composition, applied to the rest
 * basis. `pitchRadians` defaults to Math.PI/2 (not 0) so that OMITTING
 * pitch means "top-down" — matching this engine's dominant use case — a
 * caller who wants the more three.js-conventional "looking straight
 * ahead, horizon-level" rest pose just passes `pitchRadians: 0` explicitly.
 */
function rotationMatrix(pose: CameraPose): Mat4 {
  const yaw = pose.yawRadians ?? 0;
  const pitch = pose.pitchRadians ?? Math.PI / 2;
  const roll = pose.rollRadians ?? 0;
  return multiply(rotationZ(yaw), multiply(rotationX(pitch), rotationY(roll)));
}

/**
 * The camera's world-space orientation, as three orthonormal vectors. At
 * the default pose (pitch=pi/2, yaw=roll=0) this is hand-verified (see
 * camera-3d.spec.ts) to produce right=(1,0,0), up=(0,-1,0),
 * forward=(0,0,-1) — exactly reproducing today's screen-coordinate sign
 * convention (increasing world Y moves DOWN the screen, world X moves
 * right, no flip) with zero extra shader-side Y-flip needed (see
 * viewMatrix's doc comment for why).
 */
export function cameraBasis(pose: CameraPose): { readonly right: Vec3; readonly up: Vec3; readonly forward: Vec3 } {
  const r = rotationMatrix(pose);
  return {
    right: transformDirection(r, REST_RIGHT),
    up: transformDirection(r, REST_UP),
    forward: transformDirection(r, REST_FORWARD),
  };
}

/**
 * World-to-view transform. A camera's world transform is T(position)*R
 * (R orthonormal, no scale anywhere in this design), so its inverse is
 * R^T * T(-position) (transpose = inverse for an orthonormal matrix) — no
 * general 4x4 inverse implemented or needed anywhere in this module.
 * Built directly from the basis-vectors-as-rows technique (the standard
 * "look-at style" construction) rather than by transposing the rotation
 * matrix from rotationMatrix(), which sidesteps needing to reason about
 * that matrix's specific column layout at all.
 *
 * Hand-verified (see camera-3d.spec.ts and the plan) that at the default
 * pose this produces `viewX = worldX - camera.x`, `viewY = camera.y -
 * worldY` — and, combined with projectionMatrix()'s default orthographic
 * projection (which maps view-space directly to NDC with NO extra flip),
 * the resulting screen-pixel position is bit-for-bit the same formula
 * `(worldX - camX)*zoom + canvasWidth/2` / `(worldY - camY)*zoom +
 * canvasHeight/2` that the old (deleted) camera-math.ts used. The Y-flip
 * the old 2D-only vertex shader used to do explicitly (`1.0 - ...`) is
 * now absorbed entirely into the up=(0,-1,0) basis-vector convention —
 * there is no separate shader-level flip anywhere in this design.
 */
export function viewMatrix(pose: CameraPose): Mat4 {
  const { right, up, forward } = cameraBasis(pose);
  const backward = scale(forward, -1); // OpenGL convention: camera looks down -Z in its own view space, so "backward" (away from view direction) is view-space +Z.
  const position = cameraPosition(pose);
  return [
    right.x, up.x, backward.x, 0,
    right.y, up.y, backward.y, 0,
    right.z, up.z, backward.z, 0,
    -dot(right, position), -dot(up, position), -dot(backward, position), 1,
  ];
}

/**
 * View-to-clip transform. `projectionKind` defaults to 'orthographic'
 * (matching today's only mode); `zoom` (orthographic) keeps its existing
 * meaning of screen pixels per world unit exactly. Perspective is a
 * distinct, explicit opt-in (`projectionKind:'perspective'`), never a
 * side effect of any other field.
 */
export function projectionMatrix(pose: CameraPose, canvasSize: Readonly<{ width: number; height: number }>): Mat4 {
  const near = pose.near ?? DEFAULT_NEAR;
  const far = pose.far ?? DEFAULT_FAR;

  if (pose.projectionKind === 'perspective') {
    const aspect = canvasSize.width / canvasSize.height;
    return perspective(pose.fovYRadians ?? DEFAULT_FOV_Y_RADIANS, aspect, near, far);
  }

  const zoom = pose.zoom ?? DEFAULT_ZOOM;
  const halfWidth = canvasSize.width / (2 * zoom);
  const halfHeight = canvasSize.height / (2 * zoom);
  return orthographic(-halfWidth, halfWidth, -halfHeight, halfHeight, near, far);
}

export function viewProjectionMatrix(pose: CameraPose, canvasSize: Readonly<{ width: number; height: number }>): Mat4 {
  return multiply(projectionMatrix(pose, canvasSize), viewMatrix(pose));
}

/** Exported for pixel-snap.ts's qualification gate — not part of the public engine barrel. */
export function isDefaultTopDownOrthographic(pose: CameraPose): boolean {
  const epsilon = 1e-6;
  const yaw = pose.yawRadians ?? 0;
  const pitch = pose.pitchRadians ?? Math.PI / 2;
  const roll = pose.rollRadians ?? 0;
  return (
    Math.abs(yaw) < epsilon &&
    Math.abs(roll) < epsilon &&
    Math.abs(pitch - Math.PI / 2) < epsilon &&
    (pose.projectionKind ?? 'orthographic') === 'orthographic'
  );
}
