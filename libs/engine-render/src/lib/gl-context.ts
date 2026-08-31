/** The only place canvas.getContext() is called — everything else takes a WebGL2RenderingContext as a given. */
export function createGlContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error('WebGL2 is not available on this canvas.');
  }
  return gl;
}
