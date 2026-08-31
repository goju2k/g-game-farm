import type { IStorageAdapter } from './storage-adapter.js';

class MemoryStorageAdapter implements IStorageAdapter {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key);
  }
}

describe('IStorageAdapter (smoke test via an in-memory implementation)', () => {
  it('is implementable, and get/set/remove behave as a key/value store', async () => {
    const adapter: IStorageAdapter = new MemoryStorageAdapter();

    expect(await adapter.get('missing')).toBeUndefined();

    await adapter.set('key', 'value');
    expect(await adapter.get('key')).toBe('value');

    await adapter.remove('key');
    expect(await adapter.get('key')).toBeUndefined();
  });
});
