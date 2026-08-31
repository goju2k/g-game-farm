export interface ComponentType<T> {
  readonly id: number;
  readonly name: string;
  /** phantom — never assigned, only used by TypeScript to infer T at call sites. */
  readonly __type?: T;
}

export type ComponentTuple<T extends readonly ComponentType<unknown>[]> = {
  [K in keyof T]: T[K] extends ComponentType<infer U> ? Readonly<U> : never;
};

const registeredNames = new Set<string>();
let nextComponentTypeId = 0;

export function defineComponent<T>(name: string): ComponentType<T> {
  if (registeredNames.has(name)) {
    throw new Error(`Component "${name}" is already defined.`);
  }
  registeredNames.add(name);
  return { id: nextComponentTypeId++, name };
}
