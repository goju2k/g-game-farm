import { describe, expect, it } from 'vitest';
import { DepthRun } from './depth-run.js';

describe('DepthRun', () => {
  it('draws a run in ascending depth, equal depths in submission order', () => {
    const run = new DepthRun<string>();
    run.add(30, 'front');
    run.add(10, 'back');
    run.add(20, 'mid-a');
    run.add(20, 'mid-b');
    const out: string[] = [];
    run.drain((s) => out.push(s));
    expect(out).toEqual(['back', 'mid-a', 'mid-b', 'front']);
  });

  it('starts empty again after a drain', () => {
    const run = new DepthRun<number>();
    run.add(1, 1);
    run.drain(() => undefined);
    const out: number[] = [];
    run.drain((n) => out.push(n));
    expect(out).toEqual([]);
  });
});
