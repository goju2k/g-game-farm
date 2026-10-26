import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset, type LoadedAnimAsset } from '../anim/anim-asset.js';
import { clipForAction } from './combat-systems.js';
import { createEmberClips } from './ember-clips.js';

const load = (id: string, texture: number): LoadedAnimAsset => {
  const asset = parseAnimAsset(JSON.parse(readFileSync(resolve(__dirname, `../../../public/game/characters/${id}/${id}.anim.json`), 'utf8')), id);
  return { asset, texture: texture as TextureHandle, clips: clipsFromAnimAsset(asset, texture as TextureHandle) };
};

describe('the ember dash (player-ember v2, D-044)', () => {
  const clips = createEmberClips(load('player-child', 1), load('player-ember', 2));
  const dash = { kind: 'dash', phase: 'travel', framesLeft: 5, dirX: 1, dirY: 0 } as const;

  it('uses its own single dash clip, from its own sheet, with the three phase tags', () => {
    expect(clips['dash']?.texture).toBe(2);
    const tags = (clips['dash']?.frames ?? []).flatMap((f) => f.tags ?? []);
    expect(tags).toEqual(expect.arrayContaining(['dash:charge', 'dash:travel', 'dash:recover']));
    expect(clipForAction('ember', dash, 'dash' in clips)).toBe('dash');
  });
  it('without that art, the borrowed phase clips', () => {
    expect(clipForAction('ember', dash)).toBe('travel');
  });
});
