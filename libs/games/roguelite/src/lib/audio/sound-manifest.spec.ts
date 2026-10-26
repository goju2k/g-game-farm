import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX } from './sound-director.js';
import { parseSoundManifest } from './sound-manifest.js';

const publicDir = resolve(__dirname, '../../../public/game');
const manifest = parseSoundManifest(JSON.parse(readFileSync(resolve(publicDir, 'data/sounds.json'), 'utf8')));

/** Sound ids the code plays directly (sound director, event commands, dialogue chatter, menus). */
const USED_IN_CODE = [...Object.values(SFX), 'emote', 'form-change', 'companion-blip-a', 'companion-blip-b', 'companion-blip-c', 'ui-confirm', 'record-open', 'record-close'];

describe('sounds.json', () => {
  it('every listed file exists', () => {
    for (const entry of [...Object.values(manifest.sfx), ...Object.values(manifest.bgm)]) for (const file of entry.files) expect(existsSync(resolve(publicDir, file)), file).toBe(true);
  });

  it('every sound the code or a tag plays has a file', () => {
    for (const id of [...USED_IN_CODE, ...Object.values(manifest.tags)]) expect(manifest.sfx[id], id).toBeDefined();
  });
});

describe('room music', () => {
  it('names only real rooms', async () => {
    const { ROGUELITE_ROOM_IDS } = await import('../bootstrap.js');
    for (const room of Object.keys(manifest.rooms)) expect(ROGUELITE_ROOM_IDS, room).toContain(room);
  });

  it('every room track has a file', () => {
    for (const id of Object.values(manifest.rooms)) if (id !== '') expect(manifest.bgm[id], id).toBeDefined(); // "": silence
  });
});
