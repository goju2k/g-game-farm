import type { TextureHandle } from './types.js';

/**
 * A growable vertex staging buffer. `reset()` only rewinds the write cursor
 * — capacity is kept across frames so a typical frame doesn't reallocate.
 */
export class GrowableFloat32Buffer {
  private data: Float32Array;
  private used = 0;

  constructor(initialCapacity = 256 * 8) {
    this.data = new Float32Array(initialCapacity);
  }

  get length(): number {
    return this.used;
  }

  push(...values: readonly number[]): void {
    this.ensureCapacity(this.used + values.length);
    this.data.set(values, this.used);
    this.used += values.length;
  }

  reset(): void {
    this.used = 0;
  }

  /** The written portion only — safe to hand to bufferData/bufferSubData as-is. */
  view(): Float32Array {
    return this.data.subarray(0, this.used);
  }

  private ensureCapacity(minCapacity: number): void {
    if (minCapacity <= this.data.length) {
      return;
    }
    let newCapacity = Math.max(this.data.length, 1) * 2;
    while (newCapacity < minCapacity) {
      newCapacity *= 2;
    }
    const next = new Float32Array(newCapacity);
    next.set(this.data);
    this.data = next;
  }
}

export interface BatchSpan {
  readonly textureHandle: TextureHandle;
  readonly startVertex: number;
  readonly vertexCount: number;
}

/**
 * Turns a sequence of (texture, vertexCount) submissions into draw-call
 * spans, merging only *consecutive* same-texture submissions. Submission
 * order is never reordered by texture — a layer that draws A, B, A again
 * gets three spans, not two, because draw order (e.g. a top-down game's
 * Y-sort) carries meaning that a texture-sorted batcher would destroy.
 */
export class BatchAccumulator {
  private readonly spans: BatchSpan[] = [];
  private cursor = 0;

  submit(textureHandle: TextureHandle, vertexCount: number): void {
    const last = this.spans[this.spans.length - 1];
    if (last && last.textureHandle === textureHandle) {
      this.spans[this.spans.length - 1] = { ...last, vertexCount: last.vertexCount + vertexCount };
    } else {
      this.spans.push({ textureHandle, startVertex: this.cursor, vertexCount });
    }
    this.cursor += vertexCount;
  }

  reset(): void {
    this.spans.length = 0;
    this.cursor = 0;
  }

  get list(): readonly BatchSpan[] {
    return this.spans;
  }
}
