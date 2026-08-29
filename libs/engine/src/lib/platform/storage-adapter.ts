/**
 * Key/value persistence, defined by the engine but never implemented by it —
 * concrete adapters (browser localStorage, nw.js filesystem, ...) live in
 * `apps/*` and get injected into `createEngine`. The engine has no idea
 * which platform it's running on.
 */
export interface IStorageAdapter {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
