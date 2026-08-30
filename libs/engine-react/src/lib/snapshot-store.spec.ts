import { createSnapshotStore } from './snapshot-store.js';

describe('createSnapshotStore', () => {
  it('getSnapshot returns the initial value before any set()', () => {
    const store = createSnapshotStore(0);
    expect(store.getSnapshot()).toBe(0);
  });

  it('set() updates the value returned by getSnapshot()', () => {
    const store = createSnapshotStore(0);
    store.set(5);
    expect(store.getSnapshot()).toBe(5);
  });

  it('notifies subscribers when the value actually changes', () => {
    const store = createSnapshotStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(1);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify subscribers when set() is called with an Object.is-equal value', () => {
    const store = createSnapshotStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(0);

    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple independent subscribers', () => {
    const store = createSnapshotStore(0);
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);

    store.set(1);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe (the function subscribe() returns) stops further notifications', () => {
    const store = createSnapshotStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.set(1);

    expect(listener).not.toHaveBeenCalled();
  });

  it('repeated set() calls with the same value across ticks stay silent after the first change', () => {
    const store = createSnapshotStore(0);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(3);
    store.set(3);
    store.set(3);

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
