/**
 * A narrow read interface, not the flag store itself — the engine has no
 * idea what a "flag" means to any given game, only that a game can answer
 * "is this named boolean true." A game's own flag storage (ECS component,
 * plain object, whatever) implements this.
 */
export interface FlagReader {
  get(flag: string): boolean;
}

export interface FlagWriter extends FlagReader {
  set(flag: string, value: boolean): void;
}

/**
 * Boolean expression tree over named flags — the condition vocabulary a
 * scenario's `waitUntil`/`if` and a game's own gating logic (e.g. a locked
 * door) both read. Deliberately just boolean flags, no numeric/string
 * comparisons yet — nothing in this design has needed more than "is this
 * true," and adding richer comparisons later is an additive variant on
 * this union, not a redesign.
 */
export type Condition =
  | { readonly kind: 'flag'; readonly flag: string; readonly equals?: boolean }
  | { readonly kind: 'not'; readonly condition: Condition }
  | { readonly kind: 'all'; readonly conditions: readonly Condition[] }
  | { readonly kind: 'any'; readonly conditions: readonly Condition[] };

export function evaluateCondition(condition: Condition, flags: FlagReader): boolean {
  switch (condition.kind) {
    case 'flag':
      return flags.get(condition.flag) === (condition.equals ?? true);
    case 'not':
      return !evaluateCondition(condition.condition, flags);
    case 'all':
      return condition.conditions.every((c) => evaluateCondition(c, flags));
    case 'any':
      return condition.conditions.some((c) => evaluateCondition(c, flags));
  }
}
