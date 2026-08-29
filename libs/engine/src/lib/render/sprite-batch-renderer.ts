import { BatchAccumulator, GrowableFloat32Buffer } from './batching.js';
import { computeQuadScreenRect } from './camera-math.js';
import { createGlContext } from './gl-context.js';
import { LayerStack } from './layers.js';
import { compileProgram, SPRITE_FRAGMENT_SHADER_SOURCE, SPRITE_VERTEX_SHADER_SOURCE } from './shader.js';
import { TextureStore } from './texture.js';
import type { CameraPose, EngineRenderer, ImageSource, LayerConfig, SpriteDraw, TextureHandle, TextureOptions } from './types.js';
import { pixelRectToUv } from './uv.js';

const FLOATS_PER_VERTEX = 8; // position(2) + uv(2) + tint(4)
const VERTEX_STRIDE_BYTES = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
const VERTICES_PER_QUAD = 6;

interface LayerRuntime {
  readonly config: LayerConfig;
  readonly vertices: GrowableFloat32Buffer;
  readonly batches: BatchAccumulator;
  readonly glBuffer: WebGLBuffer;
  readonly vao: WebGLVertexArrayObject;
}

function getUniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`Uniform "${name}" not found in sprite shader program.`);
  }
  return location;
}

function getAttribLocation(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): number {
  const location = gl.getAttribLocation(program, name);
  if (location < 0) {
    throw new Error(`Attribute "${name}" not found in sprite shader program.`);
  }
  return location;
}

/** WebGL2 EngineRenderer implementation — see render/types.ts for the interfaces this fulfills. */
export class Renderer implements EngineRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly textures: TextureStore;
  private readonly program: WebGLProgram;
  private readonly layers: ReadonlyMap<string, LayerRuntime>;
  private readonly canvasSizeUniform: WebGLUniformLocation;
  private readonly textureUniform: WebGLUniformLocation;

  private canvasSize: { width: number; height: number };
  private camera: CameraPose = { x: 0, y: 0, zoom: 1 };

  constructor(canvas: HTMLCanvasElement, layers: readonly LayerConfig[]) {
    const gl = createGlContext(canvas);
    this.gl = gl;
    this.canvasSize = { width: canvas.width, height: canvas.height };
    this.textures = new TextureStore(gl);
    this.program = compileProgram(gl, SPRITE_VERTEX_SHADER_SOURCE, SPRITE_FRAGMENT_SHADER_SOURCE);
    this.canvasSizeUniform = getUniform(gl, this.program, 'u_canvasSize');
    this.textureUniform = getUniform(gl, this.program, 'u_texture');

    const positionLoc = getAttribLocation(gl, this.program, 'a_position');
    const uvLoc = getAttribLocation(gl, this.program, 'a_uv');
    const tintLoc = getAttribLocation(gl, this.program, 'a_tint');

    const layerStack = new LayerStack(layers); // validates: non-empty, unique ids
    const runtimes = new Map<string, LayerRuntime>();
    for (const config of layerStack) {
      const glBuffer = gl.createBuffer();
      if (!glBuffer) {
        throw new Error('Failed to create vertex buffer.');
      }
      const vao = gl.createVertexArray();
      if (!vao) {
        throw new Error('Failed to create vertex array.');
      }

      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, VERTEX_STRIDE_BYTES, 0);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, VERTEX_STRIDE_BYTES, 2 * Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(tintLoc);
      gl.vertexAttribPointer(tintLoc, 4, gl.FLOAT, false, VERTEX_STRIDE_BYTES, 4 * Float32Array.BYTES_PER_ELEMENT);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      runtimes.set(config.id, { config, vertices: new GrowableFloat32Buffer(), batches: new BatchAccumulator(), glBuffer, vao });
    }
    this.layers = runtimes;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setCamera(pose: CameraPose): void {
    this.camera = pose;
  }

  submitSprite(draw: SpriteDraw): void {
    const layer = this.layers.get(draw.layer);
    if (!layer) {
      throw new Error(`Unknown layer "${draw.layer}".`);
    }

    const textureSize = this.textures.getSize(draw.texture);
    const rect = computeQuadScreenRect(draw.x, draw.y, draw.width, draw.height, this.camera, layer.config, this.canvasSize);
    const uv = pixelRectToUv(draw.sx, draw.sy, draw.sWidth, draw.sHeight, textureSize, draw.flipX, draw.flipY);
    const [r, g, b, a] = draw.tint ?? [1, 1, 1, 1];

    const x0 = rect.x;
    const y0 = rect.y;
    const x1 = rect.x + rect.width;
    const y1 = rect.y + rect.height;

    layer.vertices.push(
      x0, y0, uv.u0, uv.v0, r, g, b, a,
      x1, y0, uv.u1, uv.v0, r, g, b, a,
      x0, y1, uv.u0, uv.v1, r, g, b, a,

      x1, y0, uv.u1, uv.v0, r, g, b, a,
      x1, y1, uv.u1, uv.v1, r, g, b, a,
      x0, y1, uv.u0, uv.v1, r, g, b, a,
    );
    layer.batches.submit(draw.texture, VERTICES_PER_QUAD);
  }

  createTexture(source: ImageSource, options: TextureOptions): TextureHandle {
    return this.textures.create(source, options);
  }

  destroyTexture(handle: TextureHandle): void {
    this.textures.destroy(handle);
  }

  getTextureSize(handle: TextureHandle): Readonly<{ width: number; height: number }> {
    return this.textures.getSize(handle);
  }

  resize(width: number, height: number): void {
    this.canvasSize = { width, height };
  }

  beginFrame(): void {
    const { gl } = this;
    gl.viewport(0, 0, this.canvasSize.width, this.canvasSize.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const layer of this.layers.values()) {
      layer.vertices.reset();
      layer.batches.reset();
    }
  }

  flush(): void {
    const { gl } = this;
    gl.useProgram(this.program);
    gl.uniform2f(this.canvasSizeUniform, this.canvasSize.width, this.canvasSize.height);
    gl.uniform1i(this.textureUniform, 0);

    for (const layer of this.layers.values()) {
      if (layer.batches.list.length === 0) {
        continue;
      }

      gl.bindVertexArray(layer.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, layer.glBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, layer.vertices.view(), gl.DYNAMIC_DRAW);

      for (const span of layer.batches.list) {
        this.textures.bind(span.textureHandle, 0);
        gl.drawArrays(gl.TRIANGLES, span.startVertex, span.vertexCount);
      }
    }
    gl.bindVertexArray(null);
  }
}
