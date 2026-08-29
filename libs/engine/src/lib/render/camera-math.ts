import type { CameraPose, LayerConfig } from './types.js';

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type SnapConfig = Pick<LayerConfig, 'parallaxFactor' | 'pixelSnap'>;

/**
 * Converts a world-space rect to a screen-pixel rect for one layer, applying
 * that layer's parallax and (if pixelSnap) integer-grid snapping.
 *
 * Snapping the camera offset alone isn't enough — an entity's world
 * position can itself be fractional — so this snaps the quad's start and
 * end points independently and derives width/height from the rounded
 * pair. That's what keeps adjacent quads seamless: two quads sharing an
 * edge compute the same shared coordinate and round it to the same
 * integer. Rounding each vertex independently instead would let a quad's
 * size jitter by a pixel frame to frame.
 */
export function computeQuadScreenRect(
  worldX: number,
  worldY: number,
  worldWidth: number,
  worldHeight: number,
  camera: CameraPose,
  layer: SnapConfig,
  canvasSize: Readonly<{ width: number; height: number }>,
): ScreenRect {
  const parallax = layer.parallaxFactor ?? 1;
  const pixelSnap = layer.pixelSnap ?? false;

  const effCamX = camera.x * parallax;
  const effCamY = camera.y * parallax;
  const effZoom = pixelSnap ? Math.round(camera.zoom) : camera.zoom;

  const rawX0 = (worldX - effCamX) * effZoom + canvasSize.width / 2;
  const rawY0 = (worldY - effCamY) * effZoom + canvasSize.height / 2;
  const rawX1 = rawX0 + worldWidth * effZoom;
  const rawY1 = rawY0 + worldHeight * effZoom;

  if (!pixelSnap) {
    return { x: rawX0, y: rawY0, width: rawX1 - rawX0, height: rawY1 - rawY0 };
  }

  const x0 = Math.round(rawX0);
  const y0 = Math.round(rawY0);
  const x1 = Math.round(rawX1);
  const y1 = Math.round(rawY1);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
