import type { DigitalState } from './types.js';

/**
 * Diffs "what's held now" against "what was held last poll" to produce
 * edges. `previousHeld` is `undefined` on the very first poll — everything
 * currently held is naturally `justPressed` in that case (no special-casing
 * needed) and nothing is `justReleased` (there's no prior state to compare
 * against).
 */
export function computeDigitalState<K>(
  previousHeld: ReadonlySet<K> | undefined,
  currentHeld: ReadonlySet<K>,
): DigitalState<K> {
  const held = new Set(currentHeld);
  const justPressed = new Set<K>();
  const justReleased = new Set<K>();

  for (const key of currentHeld) {
    if (!previousHeld?.has(key)) {
      justPressed.add(key);
    }
  }
  if (previousHeld) {
    for (const key of previousHeld) {
      if (!currentHeld.has(key)) {
        justReleased.add(key);
      }
    }
  }

  return { held, justPressed, justReleased };
}
