import { isDefaultTopDownOrthographic } from './camera-3d.js';
import type { CameraPose, LayerConfig } from './types.js';

type SnapConfig = Pick<LayerConfig, 'parallaxFactor' | 'pixelSnap'>;

/**
 * Applies one layer's parallax and (if pixelSnap) pixel-grid snapping to a
 * camera pose, producing the pose that layer's view matrix is actually
 * built from — the Unity Pixel Perfect Camera model: the CAMERA snaps, not
 * individual sprites (contrast the old, deleted camera-math.ts, which
 * rounded each sprite's own screen rect). x/y are the only fields ever
 * touched: parallax's "camera distance" and pixel-grid snapping are both
 * fundamentally about where the camera sits over the ground plane, not its
 * height or orientation — z and every rotation field pass through
 * unchanged.
 *
 * Snapping only produces its stated exact-pixel-alignment guarantee for a
 * top-down/unrotated/orthographic pose (isDefaultTopDownOrthographic) —
 * outside that, `pixelSnap: true` is a silent no-op rather than a rough
 * approximation. A camera animating through a tilt would otherwise flicker
 * between snapped and unsnapped behavior right at the qualification
 * boundary; doing nothing outside the guaranteed case is the less
 * surprising failure mode.
 */
export function applyLayerCameraAdjustment(pose: CameraPose, layer: SnapConfig): CameraPose {
  const parallax = layer.parallaxFactor ?? 1;
  const x = pose.x * parallax;
  const y = pose.y * parallax;

  if (!(layer.pixelSnap ?? false) || !isDefaultTopDownOrthographic(pose)) {
    return { ...pose, x, y };
  }

  const zoom = pose.zoom ?? 1;
  return { ...pose, x: Math.round(x * zoom) / zoom, y: Math.round(y * zoom) / zoom };
}
