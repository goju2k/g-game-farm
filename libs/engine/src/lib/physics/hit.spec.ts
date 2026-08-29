import { TickEventBus } from '../runtime/event-bus.js';
import type { AABB } from './aabb.js';
import { HitDetected } from './events.js';
import { checkHit, type HitCandidate } from './hit.js';

const box = (x: number, y: number, width: number, height: number): AABB => ({ x, y, width, height });
const candidate = (entity: number, b: AABB): HitCandidate => ({ entity: entity as never, box: b });

describe('checkHit', () => {
  it('returns one HitEvent when the attacker overlaps exactly one target', () => {
    const attacker = candidate(1, box(0, 0, 10, 10));
    const targets = [candidate(2, box(5, 5, 10, 10)), candidate(3, box(100, 100, 10, 10))];

    const hits = checkHit(attacker, targets);

    expect(hits).toEqual([{ attacker: 1, target: 2, overlap: box(5, 5, 5, 5) }]);
  });

  it('returns every overlapping target, not just the first — no built-in penetration flag', () => {
    const attacker = candidate(1, box(0, 0, 10, 10));
    const targets = [candidate(2, box(5, 5, 10, 10)), candidate(3, box(-5, -5, 10, 10))];

    const hits = checkHit(attacker, targets);

    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.target)).toEqual([2, 3]);
  });

  it('returns an empty array when nothing overlaps', () => {
    const attacker = candidate(1, box(0, 0, 10, 10));
    const targets = [candidate(2, box(100, 100, 10, 10))];

    expect(checkHit(attacker, targets)).toEqual([]);
  });

  it('returns an empty array for an empty targets list', () => {
    expect(checkHit(candidate(1, box(0, 0, 10, 10)), [])).toEqual([]);
  });

  it('does not auto-exclude the attacker from targets — a self-overlapping entry produces a self-hit', () => {
    const self = candidate(1, box(0, 0, 10, 10));

    const hits = checkHit(self, [self]);

    expect(hits).toEqual([{ attacker: 1, target: 1, overlap: box(0, 0, 10, 10) }]);
  });

  it('returns hits in the same order as targets', () => {
    const attacker = candidate(1, box(0, 0, 100, 100));
    const targets = [candidate(3, box(3, 3, 1, 1)), candidate(1, box(1, 1, 1, 1)), candidate(2, box(2, 2, 1, 1))];

    const hits = checkHit(attacker, targets);

    expect(hits.map((hit) => hit.target)).toEqual([3, 1, 2]);
  });
});

describe('integration: wiring checkHit results into an EventBus (the pattern game code will use)', () => {
  it('round-trips attacker/target/overlap through emit and read', () => {
    const bus = new TickEventBus();
    const attacker = candidate(10, box(0, 0, 10, 10));
    const targets = [candidate(20, box(5, 5, 10, 10))];

    for (const hit of checkHit(attacker, targets)) {
      bus.emit(HitDetected, hit);
    }

    expect(bus.read(HitDetected)).toEqual([{ attacker: 10, target: 20, overlap: box(5, 5, 5, 5) }]);
  });
});

describe('read-only enforcement (type-level)', () => {
  it('does not typecheck if code tries to mutate the targets array passed to checkHit', () => {
    const illegalMutation = () => {
      const targets: readonly HitCandidate[] = [];
      // @ts-expect-error — readonly array; push() doesn't exist on it.
      targets.push(candidate(1, box(0, 0, 1, 1)));
    };
    expect(typeof illegalMutation).toBe('function');
  });

  it('does not typecheck if code tries to mutate an AABB field', () => {
    const illegalMutation = () => {
      const b = box(0, 0, 10, 10);
      // @ts-expect-error — AABB fields are readonly.
      b.x = 5;
    };
    expect(typeof illegalMutation).toBe('function');
  });
});
