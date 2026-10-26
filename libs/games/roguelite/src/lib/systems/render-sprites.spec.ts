import { describe, expect, it } from 'vitest';
import type { TextureHandle } from '@g-game-farm/ribs';
import type { SpriteRender } from '../components.js';
import { ABOVE_ACTORS, spriteDepth } from './render-sprites.js';

const sprite = (extra: Partial<SpriteRender> = {}): SpriteRender => ({ texture: 0 as TextureHandle, layer: 'gameplay', sx: 0, sy: 0, sWidth: 16, sHeight: 24, width: 16, height: 24, ...extra });

describe('3/4 draw order by the feet (D-042)', () => {
  it('an anchored sprite: its Position is its feet', () => {
    expect(spriteDepth({ x: 10, y: 50 }, sprite({ originX: 8, originY: 23 }))).toBe(50);
  });
  it('a top-left sprite: the bottom of its rect', () => {
    expect(spriteDepth({ x: 10, y: 50 }, sprite())).toBe(74);
  });
  it('a character beside a door, a step lower on screen, is drawn in front of it', () => {
    const door = spriteDepth({ x: 100, y: 48 }, sprite({ originX: 24, originY: 39 }));
    const player = spriteDepth({ x: 80, y: 52 }, sprite({ originX: 8, originY: 23 }));
    expect(player).toBeGreaterThan(door);
  });
  it('an effect in the air sorts over everyone', () => {
    expect(spriteDepth({ x: 0, y: 0 }, sprite({ originX: 0, originY: 0, depthOffset: ABOVE_ACTORS }))).toBeGreaterThan(10_000);
  });
});
