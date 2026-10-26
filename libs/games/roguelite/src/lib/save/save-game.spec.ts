import type { IStorageAdapter } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { createRogueliteSession } from '../session.js';
import { createSaveStore, DEFAULT_PREFERENCES, parsePreferences, parseSave, resetSession, restoreCheckpoint } from './save-game.js';

const ROOMS = ['opening-wake', 'zone-4'];

function memoryStorage(): IStorageAdapter & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  };
}

describe('save game', () => {
  it('round-trips a checkpoint', async () => {
    const storage = memoryStorage();
    const store = createSaveStore(storage, ROOMS, () => 1234);
    expect(await store.loadSave()).toBeUndefined();
    await store.writeCheckpoint({ room: 'zone-4', entry: 'west', form: 'ember', seenEvents: ['opening-wake:wake'] });
    expect(await store.loadSave()).toEqual({ version: 1, savedAt: 1234, checkpoint: { room: 'zone-4', entry: 'west', form: 'ember', seenEvents: ['opening-wake:wake'] } });
    await store.clearSave();
    expect(await store.loadSave()).toBeUndefined();
  });

  it('ignores anything that is not a valid save for a known room', () => {
    expect(parseSave('not json', ROOMS)).toBeUndefined();
    expect(parseSave(JSON.stringify({ version: 2, checkpoint: { room: 'zone-4', seenEvents: [] } }), ROOMS)).toBeUndefined();
    expect(parseSave(JSON.stringify({ version: 1, checkpoint: { room: 'gone-room', seenEvents: [] } }), ROOMS)).toBeUndefined();
    expect(parseSave(JSON.stringify({ version: 1, checkpoint: { room: 'zone-4', seenEvents: [1] } }), ROOMS)).toBeUndefined();
  });

  it('keeps working without storage, or when storage throws', async () => {
    const none = createSaveStore(undefined, ROOMS);
    await none.writeCheckpoint({ room: 'zone-4', seenEvents: [] });
    expect(await none.loadSave()).toBeUndefined();
    expect(await none.loadPreferences()).toEqual(DEFAULT_PREFERENCES);

    const broken: IStorageAdapter = {
      get: async () => {
        throw new Error('blocked');
      },
      set: async () => {
        throw new Error('quota');
      },
      remove: async () => undefined,
    };
    const store = createSaveStore(broken, ROOMS);
    await expect(store.writeCheckpoint({ room: 'zone-4', seenEvents: [] })).resolves.toBeUndefined();
    expect(await store.loadSave()).toBeUndefined();
  });

  it('preferences clamp volumes and fall back to defaults', () => {
    expect(parsePreferences(JSON.stringify({ sound: { bgm: 2, sfx: 0.25 }, seenControls: true }))).toEqual({ sound: { bgm: 1, sfx: 0.25 }, seenControls: true });
    expect(parsePreferences('{')).toEqual(DEFAULT_PREFERENCES);
  });

  it('restoring puts the seen events and entry back; resetting clears them', () => {
    const session = createRogueliteSession();
    session.seenEvents.add('stale');
    const room = restoreCheckpoint(session, { room: 'zone-4', entry: 'west', seenEvents: ['a', 'b'] });
    expect(room).toBe('zone-4');
    expect([...session.seenEvents]).toEqual(['a', 'b']);
    expect(session.pendingEntryId).toBe('west');
    resetSession(session);
    expect(session.seenEvents.size).toBe(0);
    expect(session.pendingEntryId).toBeUndefined();
  });
});
