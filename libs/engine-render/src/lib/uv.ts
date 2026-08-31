export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** Converts a texture-pixel sub-rect to normalized UV, swapping edges for flips. */
export function pixelRectToUv(
  sx: number,
  sy: number,
  sWidth: number,
  sHeight: number,
  textureSize: Readonly<{ width: number; height: number }>,
  flipX = false,
  flipY = false,
): UvRect {
  let u0 = sx / textureSize.width;
  let v0 = sy / textureSize.height;
  let u1 = (sx + sWidth) / textureSize.width;
  let v1 = (sy + sHeight) / textureSize.height;

  if (flipX) {
    [u0, u1] = [u1, u0];
  }
  if (flipY) {
    [v0, v1] = [v1, v0];
  }

  return { u0, v0, u1, v1 };
}
