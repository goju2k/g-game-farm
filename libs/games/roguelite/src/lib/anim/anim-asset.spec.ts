import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TextureHandle } from '@g-game-farm/ribs';
import { describe, expect, it } from 'vitest';
import { clipsFromAnimAsset, parseAnimAsset } from './anim-asset.js';

const PLAYER_CHILD = resolve(__dirname, '../../../public/game/characters/player-child/player-child.anim.json');
const playerChildJson = (): Record<string, unknown> => JSON.parse(readFileSync(PLAYER_CHILD, 'utf8'));

describe('parseAnimAsset', () => {
  it('accepts the delivered player-child asset', () => {
    const asset = parseAnimAsset(playerChildJson(), 'player-child');
    expect(asset.id).toBe('player-child');
    expect(asset.frameSize).toEqual([48, 24]);
    expect(Object.keys(asset.clips)).toEqual(['float', 'dash', 'parry']);
  });

  it('lists every problem in one error', () => {
    const json = playerChildJson();
    json['contract'] = 2;
    delete json['anchor'];
    const clips = json['clips'] as Record<string, { frames: Record<string, unknown>[] }>;
    clips['dash'].frames[3]['sWidth'] = 47;
    clips['parry'].frames[0]['tags'] = ['flash'];
    expect(() => parseAnimAsset(json, 'bad.anim.json')).toThrowError(
      /bad\.anim\.json[\s\S]*contract must be 1[\s\S]*anchor[\s\S]*clips\.dash\.frames\[3\]: size 47x24[\s\S]*clips\.parry\.frames\[0\]\.tags/,
    );
  });

  it('rejects an anchor outside the frame', () => {
    const json = playerChildJson();
    json['anchor'] = [49, 0];
    expect(() => parseAnimAsset(json, 'x')).toThrowError(/anchor 49,0 is outside the 48x24 frame/);
  });
});

describe('clipsFromAnimAsset', () => {
  it('maps each clip 1:1 onto a SpriteAnimation named <id>:<clip>', () => {
    const texture = 9 as TextureHandle;
    const clips = clipsFromAnimAsset(parseAnimAsset(playerChildJson(), 'player-child'), texture);
    expect(clips['dash'].name).toBe('player-child:dash');
    expect(clips['dash'].texture).toBe(texture);
    expect(clips['dash'].loop).toBe(false);
    expect(clips['float'].loop).toBe(true);
    expect(clips['dash'].frames[2]).toEqual({ sx: 96, sy: 24, sWidth: 48, sHeight: 24, durationMs: 56, tags: ['dash:travel'] });
  });
});
