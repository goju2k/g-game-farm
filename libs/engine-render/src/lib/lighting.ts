import type { GrowableFloat32Buffer } from './batching.js';
import { compileProgram } from './shader.js';
import type { LightDraw, LightingSettings, Rgb } from './types.js';

/**
 * 2D lighting, as two offscreen buffers per frame:
 *
 * - light map: cleared to the ambient level, each light drawn into it as a
 *   stepped ellipse (per-channel MAX blending, so overlapping lights never
 *   blow out past the brightest one). Light edges are evaluated at
 *   world-pixel centers, so band steps land on the same pixel grid as the
 *   sprites instead of cutting through art pixels. Values are stored at
 *   half scale so tinted light can push a channel above 1 (up to 2) in an
 *   8-bit buffer.
 * - scene: the lit layers are drawn here instead of to the canvas.
 *
 * composite() then writes scene × light to the canvas — except pixels whose
 * art color is one of the frame's emissive colors, which keep full
 * brightness — and the unlit layers after it draw on top as usual.
 */

export const MAX_LIGHT_BANDS = 4;
export const MAX_EMISSIVE_COLORS = 8;
/** The light map holds brightness × this, so a multiplier up to 1 / LIGHT_MAP_SCALE fits in 0..1. */
const LIGHT_MAP_SCALE = 0.5;

/** Throws with what's wrong — shader uniforms are fixed-size, and a misordered band list would silently pick the wrong ring. */
export function validateLightingSettings(settings: LightingSettings): void {
  const { ambient, bands, emissive = [] } = settings;
  if (ambient.length !== 3 || ambient.some((c) => !(c >= 0 && c <= 1))) {
    throw new Error(`setLighting: ambient must be 3 channels in 0..1, got [${ambient.join(', ')}].`);
  }
  if (bands.length < 1 || bands.length > MAX_LIGHT_BANDS) {
    throw new Error(`setLighting: 1..${MAX_LIGHT_BANDS} bands, got ${bands.length}.`);
  }
  let previous = 0;
  for (const [i, band] of bands.entries()) {
    if (!(band.until > previous && band.until <= 1)) {
      throw new Error(`setLighting: band ${i}'s until (${band.until}) must be > ${previous} and <= 1 — bands go inner to outer.`);
    }
    if (!(band.intensity >= 0 && band.intensity <= 1)) {
      throw new Error(`setLighting: band ${i}'s intensity (${band.intensity}) must be in 0..1.`);
    }
    previous = band.until;
  }
  if (emissive.length > MAX_EMISSIVE_COLORS) {
    throw new Error(`setLighting: at most ${MAX_EMISSIVE_COLORS} emissive colors, got ${emissive.length}.`);
  }
  for (const color of emissive) {
    if (color.length !== 3 || color.some((c) => !Number.isInteger(c) || c < 0 || c > 255)) {
      throw new Error(`setLighting: emissive colors are 3 integer channels in 0..255, got [${color.join(', ')}].`);
    }
  }
}

/** The band intensity L a point `distance` (fraction of the radius) from a light's center gets — the CPU twin of the shader's lookup. */
export function bandIntensityAt(bands: LightingSettings['bands'], distance: number): number {
  for (const band of bands) {
    if (distance <= band.until) {
      return band.intensity;
    }
  }
  return 0;
}

/** A light's per-channel brightness multiplier at band intensity L — the CPU twin of the shader's tint formula. */
export function tintedLight(tint: Rgb, intensity: number): Rgb {
  const channel = (k: number) => Math.min(1 / LIGHT_MAP_SCALE, intensity * (1 + k * intensity));
  return [channel(tint[0]), channel(tint[1]), channel(tint[2])];
}

/** position(3) + center(2) + radius(1) + squashY(1) + tint(3) */
export const LIGHT_FLOATS_PER_VERTEX = 10;

/** Two triangles covering the light's ellipse bounding box on the ground plane (z = 0), in world units. */
export function pushLightQuad(out: GrowableFloat32Buffer, light: LightDraw): void {
  const squash = light.squashY ?? 1;
  if (!(light.radius > 0) || !(squash > 0)) {
    throw new Error(`submitLight: radius and squashY must be positive (got ${light.radius}, ${squash}).`);
  }
  const { x, y, radius } = light;
  const [kr, kg, kb] = light.tint;
  const left = x - radius;
  const right = x + radius;
  const top = y - radius * squash;
  const bottom = y + radius * squash;
  const vertex = (vx: number, vy: number) => out.push(vx, vy, 0, x, y, radius, squash, kr, kg, kb);
  vertex(left, top);
  vertex(right, top);
  vertex(left, bottom);
  vertex(right, top);
  vertex(right, bottom);
  vertex(left, bottom);
}

const LIGHT_VERTEX_SHADER = `#version 300 es
in vec3 a_position;
in vec2 a_center;
in float a_radius;
in float a_squash;
in vec3 a_tint;

uniform mat4 u_viewProjection;

out vec2 v_world;
flat out vec2 v_center;
flat out float v_radius;
flat out float v_squash;
flat out vec3 v_tint;

void main() {
  gl_Position = u_viewProjection * vec4(a_position, 1.0);
  v_world = a_position.xy;
  v_center = a_center;
  v_radius = a_radius;
  v_squash = a_squash;
  v_tint = a_tint;
}
`;

const LIGHT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_world;
flat in vec2 v_center;
flat in float v_radius;
flat in float v_squash;
flat in vec3 v_tint;

uniform vec4 u_bandUntil;
uniform vec4 u_bandIntensity;
uniform int u_bandCount;

out vec4 outColor;

void main() {
  // Evaluate at the center of the world pixel this fragment falls in, so every screen pixel of one art pixel gets the same light.
  vec2 offset = floor(v_world) + 0.5 - v_center;
  float d = length(vec2(offset.x, offset.y / v_squash)) / v_radius;
  float l = 0.0;
  for (int i = 0; i < ${MAX_LIGHT_BANDS}; i++) {
    if (i >= u_bandCount) break;
    if (d <= u_bandUntil[i]) { l = u_bandIntensity[i]; break; }
  }
  if (l <= 0.0) discard;
  outColor = vec4(clamp(l * (1.0 + v_tint * l) * ${LIGHT_MAP_SCALE.toFixed(2)}, 0.0, 1.0), 1.0);
}
`;

const FULLSCREEN_VERTEX_SHADER = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
}
`;

const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform sampler2D u_scene;
uniform sampler2D u_lightMap;
uniform vec3 u_emissive[${MAX_EMISSIVE_COLORS}];
uniform int u_emissiveCount;
out vec4 outColor;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec3 scene = texelFetch(u_scene, at, 0).rgb;
  vec3 light = texelFetch(u_lightMap, at, 0).rgb / ${LIGHT_MAP_SCALE.toFixed(2)};
  for (int i = 0; i < ${MAX_EMISSIVE_COLORS}; i++) {
    if (i >= u_emissiveCount) break;
    if (all(lessThan(abs(scene * 255.0 - u_emissive[i]), vec3(0.5)))) { light = max(light, vec3(1.0)); break; }
  }
  outColor = vec4(min(scene * light, vec3(1.0)), 1.0);
}
`;

function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`Uniform "${name}" not found in lighting shader.`);
  }
  return location;
}

/** One layer's lights for this frame plus the view-projection they're drawn through. */
export interface LightBatch {
  readonly viewProjection: Float32Array;
  readonly vertices: Float32Array;
}

interface RenderTarget {
  readonly framebuffer: WebGLFramebuffer;
  readonly texture: WebGLTexture;
}

/** The GL side: owns both offscreen targets and the programs. Created lazily by the Renderer the first frame lighting is used. */
export class LightingPass {
  private readonly lightProgram: WebGLProgram;
  private readonly compositeProgram: WebGLProgram;
  private readonly viewProjectionUniform: WebGLUniformLocation;
  private readonly bandUntilUniform: WebGLUniformLocation;
  private readonly bandIntensityUniform: WebGLUniformLocation;
  private readonly bandCountUniform: WebGLUniformLocation;
  private readonly sceneUniform: WebGLUniformLocation;
  private readonly lightMapUniform: WebGLUniformLocation;
  private readonly emissiveUniform: WebGLUniformLocation;
  private readonly emissiveCountUniform: WebGLUniformLocation;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly emptyVao: WebGLVertexArrayObject;
  private lightTarget: RenderTarget | null = null;
  private sceneTarget: RenderTarget | null = null;
  private size = { width: 0, height: 0 };

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.lightProgram = compileProgram(gl, LIGHT_VERTEX_SHADER, LIGHT_FRAGMENT_SHADER);
    this.compositeProgram = compileProgram(gl, FULLSCREEN_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER);
    this.viewProjectionUniform = uniform(gl, this.lightProgram, 'u_viewProjection');
    this.bandUntilUniform = uniform(gl, this.lightProgram, 'u_bandUntil');
    this.bandIntensityUniform = uniform(gl, this.lightProgram, 'u_bandIntensity');
    this.bandCountUniform = uniform(gl, this.lightProgram, 'u_bandCount');
    this.sceneUniform = uniform(gl, this.compositeProgram, 'u_scene');
    this.lightMapUniform = uniform(gl, this.compositeProgram, 'u_lightMap');
    this.emissiveUniform = uniform(gl, this.compositeProgram, 'u_emissive');
    this.emissiveCountUniform = uniform(gl, this.compositeProgram, 'u_emissiveCount');

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    const emptyVao = gl.createVertexArray();
    if (!buffer || !vao || !emptyVao) {
      throw new Error('Failed to create lighting buffers.');
    }
    this.buffer = buffer;
    this.vao = vao;
    this.emptyVao = emptyVao;

    const stride = LIGHT_FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
    const attributes: readonly [string, number, number][] = [
      ['a_position', 3, 0],
      ['a_center', 2, 3],
      ['a_radius', 1, 5],
      ['a_squash', 1, 6],
      ['a_tint', 3, 7],
    ];
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, size, offset] of attributes) {
      const location = gl.getAttribLocation(this.lightProgram, name);
      if (location < 0) {
        throw new Error(`Attribute "${name}" not found in lighting shader.`);
      }
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset * Float32Array.BYTES_PER_ELEMENT);
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private createTarget(width: number, height: number): RenderTarget {
    const { gl } = this;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      throw new Error('Failed to create a lighting render target.');
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { framebuffer, texture };
  }

  private deleteTarget(target: RenderTarget | null): void {
    if (target) {
      this.gl.deleteTexture(target.texture);
      this.gl.deleteFramebuffer(target.framebuffer);
    }
  }

  private ensureTargets(width: number, height: number): { light: RenderTarget; scene: RenderTarget } {
    if (!this.lightTarget || !this.sceneTarget || this.size.width !== width || this.size.height !== height) {
      this.deleteTarget(this.lightTarget);
      this.deleteTarget(this.sceneTarget);
      this.lightTarget = this.createTarget(width, height);
      this.sceneTarget = this.createTarget(width, height);
      this.size = { width, height };
    }
    return { light: this.lightTarget, scene: this.sceneTarget };
  }

  /**
   * Draws ambient + every light into the light map, then binds and clears
   * the scene target so the lit layers that follow draw into it. Leaves
   * standard alpha blending on.
   */
  begin(settings: LightingSettings, batches: readonly LightBatch[], width: number, height: number): void {
    const { gl } = this;
    const { light, scene } = this.ensureTargets(width, height);

    gl.bindFramebuffer(gl.FRAMEBUFFER, light.framebuffer);
    gl.viewport(0, 0, width, height);
    const [ar, ag, ab] = settings.ambient;
    gl.clearColor(ar * LIGHT_MAP_SCALE, ag * LIGHT_MAP_SCALE, ab * LIGHT_MAP_SCALE, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (batches.length > 0) {
      const until = [1, 1, 1, 1];
      const intensity = [0, 0, 0, 0];
      settings.bands.forEach((band, i) => {
        until[i] = band.until;
        intensity[i] = band.intensity;
      });
      gl.useProgram(this.lightProgram);
      gl.uniform4fv(this.bandUntilUniform, until);
      gl.uniform4fv(this.bandIntensityUniform, intensity);
      gl.uniform1i(this.bandCountUniform, settings.bands.length);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      for (const batch of batches) {
        gl.uniformMatrix4fv(this.viewProjectionUniform, false, batch.viewProjection);
        gl.bufferData(gl.ARRAY_BUFFER, batch.vertices, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES, 0, batch.vertices.length / LIGHT_FLOATS_PER_VERTEX);
      }
      gl.bindVertexArray(null);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Writes scene × light (emissive colors exempt) to the canvas and leaves the canvas bound for any unlit layers. */
  composite(settings: LightingSettings): void {
    const { gl } = this;
    if (!this.lightTarget || !this.sceneTarget) {
      throw new Error('LightingPass.composite() before begin().');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.compositeProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTarget.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lightTarget.texture);
    gl.uniform1i(this.sceneUniform, 0);
    gl.uniform1i(this.lightMapUniform, 1);
    const emissive = settings.emissive ?? [];
    const flat = new Float32Array(MAX_EMISSIVE_COLORS * 3);
    emissive.forEach((color, i) => flat.set(color, i * 3));
    gl.uniform3fv(this.emissiveUniform, flat);
    gl.uniform1i(this.emissiveCountUniform, emissive.length);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    const { gl } = this;
    this.deleteTarget(this.lightTarget);
    this.deleteTarget(this.sceneTarget);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.emptyVao);
    gl.deleteProgram(this.lightProgram);
    gl.deleteProgram(this.compositeProgram);
  }
}
