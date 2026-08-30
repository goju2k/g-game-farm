import type { TextureHandle } from '@g-game-farm/ribs';
import { FLAME_FRAME_SIZE, FLAME_WALL_COLLIDER, PLAYER_FRAME_SIZE, PLAYER_WALL_COLLIDER } from './player-constants.js';
import { spritePropsForForm } from './player-forms.js';

const mageTexture = 0 as TextureHandle;
const flameTexture = 1 as TextureHandle;

describe('spritePropsForForm', () => {
  it('mage form: full clip set, real wall collider, frame0 sourced from the idle clip', () => {
    const { sprite, clips, wallCollider } = spritePropsForForm('mage', { mage: mageTexture, flame: flameTexture });

    expect(clips.idle.frames).toHaveLength(10);
    expect(clips.run.frames).toHaveLength(4);
    expect(wallCollider).toEqual(PLAYER_WALL_COLLIDER);
    expect(sprite).toEqual({
      texture: mageTexture,
      sx: 0,
      sy: 0,
      sWidth: PLAYER_FRAME_SIZE,
      sHeight: PLAYER_FRAME_SIZE,
      width: PLAYER_FRAME_SIZE,
      height: PLAYER_FRAME_SIZE,
    });
  });

  it('flame form: a single-frame idle clip (the stepAnimatorSystem frame-index-diff regression case) and the smaller collider', () => {
    const { sprite, clips, wallCollider } = spritePropsForForm('flame', { mage: mageTexture, flame: flameTexture });

    expect(clips.idle.frames).toHaveLength(1); // never advances on its own — a form-swap MUST write SpriteRender eagerly, not rely on stepAnimatorSystem
    expect(clips.run.frames).toHaveLength(2);
    expect(wallCollider).toEqual(FLAME_WALL_COLLIDER);
    expect(sprite).toEqual({
      texture: flameTexture,
      sx: 0,
      sy: 0,
      sWidth: FLAME_FRAME_SIZE,
      sHeight: FLAME_FRAME_SIZE,
      width: FLAME_FRAME_SIZE,
      height: FLAME_FRAME_SIZE,
    });
  });

  it('each form reads its own entry out of formTextures, not the other one', () => {
    const distinctMage = 5 as TextureHandle;
    const distinctFlame = 6 as TextureHandle;
    const mageResult = spritePropsForForm('mage', { mage: distinctMage, flame: distinctFlame });
    const flameResult = spritePropsForForm('flame', { mage: distinctMage, flame: distinctFlame });

    expect(mageResult.sprite.texture).toBe(distinctMage);
    expect(flameResult.sprite.texture).toBe(distinctFlame);
  });
});
