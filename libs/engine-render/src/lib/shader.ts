/**
 * Single unified vertex shader for every layer, 2D or 3D — the camera-only
 * pixel-snap model (see pixel-snap.ts) means there's no longer any reason
 * to round on the CPU per-quad the way the old, deleted camera-math.ts had
 * to. Every vertex here is a raw world-space position (see
 * render/quad3d.ts); `u_viewProjection` — set once per layer per flush(),
 * from that layer's own camera, see sprite-batch-renderer.ts — does the
 * entire world-to-clip-space transform, NDC and all. There is no separate
 * shader-level Y-flip: that's baked into the camera basis convention
 * itself (see render/camera-3d.ts's up=(0,-1,0) rest vector).
 */
export const SPRITE_VERTEX_SHADER_SOURCE = `#version 300 es
in vec3 a_position;
in vec2 a_uv;
in vec4 a_tint;

uniform mat4 u_viewProjection;

out vec2 v_uv;
out vec4 v_tint;

void main() {
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
  v_uv = a_uv;
  v_tint = a_tint;
}
`;

export const SPRITE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision mediump float;

in vec2 v_uv;
in vec4 v_tint;

uniform sampler2D u_texture;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_uv) * v_tint;
}
`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log ?? '(no log)'}`);
  }
  return shader;
}

export function compileProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create program.');
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log ?? '(no log)'}`);
  }
  return program;
}
