import { startAnimator } from '../anim/play-clip.js';
import { Animator, DropShadow, LightEmitter, Position, SpriteRender } from '../components.js';
import { DUNGEON_LIGHTING, MAGE_HAND_FLAME } from '../lighting/dungeon-lighting.js';
import { spawnTileLights } from '../lighting/tile-lights.js';
import { dungeonPart0SampleTileMap } from './maps/dungeon-part0-sample.generated.js';
import type { RoomDefinition } from './room-types.js';
import { roomDataFromTileMap } from './tiled-room.js';

const ROOM_ID = 'room-d';
const { tiles, entryPoints, exits } = roomDataFromTileMap(ROOM_ID, dungeonPart0SampleTileMap);

/** The art-check stand-in: the child mage, once facing each way, beside the entry. Not interactive. */
const REFERENCE_ASSET = 'player-child';
const REFERENCE_CLIP = 'float';
/** ribs-assets' shadow spec for player-child: 8/6px rows, 6/4px while float lifts (frames 2-4), black at 40%. */
const CHILD_MAGE_SHADOW: DropShadow = { widths: [8, 6], alpha: 0.4, lifted: { clip: 'float', frames: [2, 3, 4], widths: [6, 4] } };

/**
 * The first dungeon room — ribs-assets' dungeon-part0 sample map
 * (maps/dungeon-part0-sample.tmj), used as-is to check the Act 1 tileset
 * against the real characters. Not linked to the other rooms yet (open it
 * with ?room=room-d); its corridor ends are deliberately walled off in the
 * sample until it is.
 *
 * Lit as an Act 1 dungeon (lighting/dungeon-lighting.ts): dark ambient,
 * cold light from the seal lamps/seal/remains tiles, warm light from the
 * mage's hand flame. Until the child mage becomes the playable character,
 * two of it stand beside the entry (as authored + flipped) so size, colour
 * and light can be judged against the tiles at game zoom.
 */
export const roomD: RoomDefinition = {
  id: ROOM_ID,
  tiles,
  exits,
  entryPoints,
  lighting: DUNGEON_LIGHTING,
  populate: (world, ctx) => {
    spawnTileLights(world, dungeonPart0SampleTileMap);
    const reference = ctx.animAssets[REFERENCE_ASSET];
    if (!reference) {
      return; // headless tests load no anim assets
    }
    const [frameWidth, frameHeight] = reference.asset.frameSize;
    const feetY = ctx.entryPosition.y + 18; // the current player sprite is 18 tall; stand on the same line
    for (const [dx, flipX] of [
      [-28, false],
      [46, true],
    ] as const) {
      const mage = world.createEntity();
      const animator = startAnimator(reference.clips, REFERENCE_CLIP);
      const frame = reference.clips[REFERENCE_CLIP].frames[0];
      world.set(mage, Position, { x: ctx.entryPosition.x + dx, y: feetY });
      world.set(mage, SpriteRender, {
        texture: reference.texture,
        layer: 'gameplay',
        sx: frame.sx,
        sy: frame.sy,
        sWidth: frameWidth,
        sHeight: frameHeight,
        width: frameWidth,
        height: frameHeight,
        flipX,
        originX: reference.asset.anchor[0],
        originY: reference.asset.anchor[1],
      });
      world.set(mage, Animator, animator);
      world.set(mage, DropShadow, CHILD_MAGE_SHADOW);
      world.set(mage, LightEmitter, MAGE_HAND_FLAME);
    }
  },
};
