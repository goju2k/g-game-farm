import { BatchAccumulator, GrowableFloat32Buffer } from './batching.js';
import type { TextureHandle } from './types.js';

const texA = 0 as TextureHandle;
const texB = 1 as TextureHandle;

describe('GrowableFloat32Buffer', () => {
  it('returns pushed values via view()', () => {
    const buffer = new GrowableFloat32Buffer(4);
    buffer.push(1, 2, 3);
    expect([...buffer.view()]).toEqual([1, 2, 3]);
  });

  it('grows past its initial capacity without losing earlier data', () => {
    const buffer = new GrowableFloat32Buffer(2);
    for (let i = 0; i < 10; i++) {
      buffer.push(i);
    }
    expect([...buffer.view()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('reset() rewinds the cursor to zero', () => {
    const buffer = new GrowableFloat32Buffer(4);
    buffer.push(1, 2, 3);
    buffer.reset();
    expect(buffer.length).toBe(0);
    expect(buffer.view()).toEqual(new Float32Array(0));
  });

  it('can be pushed to again after reset()', () => {
    const buffer = new GrowableFloat32Buffer(4);
    buffer.push(1, 2, 3);
    buffer.reset();
    buffer.push(9);
    expect([...buffer.view()]).toEqual([9]);
  });
});

describe('BatchAccumulator', () => {
  it('merges consecutive submissions of the same texture into one span', () => {
    const acc = new BatchAccumulator();
    acc.submit(texA, 6);
    acc.submit(texA, 6);
    expect(acc.list).toEqual([{ textureHandle: texA, startVertex: 0, vertexCount: 12 }]);
  });

  it('starts a new span when the texture changes', () => {
    const acc = new BatchAccumulator();
    acc.submit(texA, 6);
    acc.submit(texB, 6);
    expect(acc.list).toEqual([
      { textureHandle: texA, startVertex: 0, vertexCount: 6 },
      { textureHandle: texB, startVertex: 6, vertexCount: 6 },
    ]);
  });

  it('does not merge non-consecutive submissions of the same texture (no texture sort)', () => {
    const acc = new BatchAccumulator();
    acc.submit(texA, 6);
    acc.submit(texB, 6);
    acc.submit(texA, 6);
    expect(acc.list).toEqual([
      { textureHandle: texA, startVertex: 0, vertexCount: 6 },
      { textureHandle: texB, startVertex: 6, vertexCount: 6 },
      { textureHandle: texA, startVertex: 12, vertexCount: 6 },
    ]);
  });

  it('reset() clears spans and restarts startVertex at 0', () => {
    const acc = new BatchAccumulator();
    acc.submit(texA, 6);
    acc.reset();
    acc.submit(texB, 3);
    expect(acc.list).toEqual([{ textureHandle: texB, startVertex: 0, vertexCount: 3 }]);
  });
});
