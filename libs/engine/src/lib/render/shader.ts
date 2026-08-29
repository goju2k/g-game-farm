/**
 * The camera transform (translate, parallax, pixel-snap) is done entirely
 * on the CPU in camera-math.ts, because the snap has to round a whole quad
 * to one point (see computeQuadScreenRect's doc comment) — something a
 * per-vertex shader stage structurally can't do. So this shader only turns
 * an already-final screen-pixel position into clip space; one program
 * serves every layer, no per-layer uniforms needed.
 */
export const SPRITE_VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
in vec4 a_tint;

uniform vec2 u_canvasSize;

out vec2 v_uv;
out vec4 v_tint;

void main() {
  vec2 ndc = vec2(
    (a_position.x / u_canvasSize.x) * 2.0 - 1.0,
    1.0 - (a_position.y / u_canvasSize.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
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
