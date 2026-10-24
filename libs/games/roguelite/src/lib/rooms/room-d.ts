import { startAnimator } from '../anim/play-clip.js';
import { Animator, Position, SpriteRender } from '../components.js';
import { dungeonPart0SampleTileMap } from './maps/dungeon-part0-sample.generated.js';
import type { RoomDefinition } from './room-types.js';
import { roomDataFromTileMap } from './tiled-room.js';

const ROOM_ID = 'room-d';
const { tiles, entryPoints, exits } = roomDataFromTileMap(ROOM_ID, dungeonPart0SampleTileMap);

/** The art-check stand-in: the child mage, once facing each way, beside the entry. Not interactive. */
const REFERENCE_ASSET = 'player-child';
const REFERENCE_CLIP = 'float';

/**
 * The first dungeon room — ribs-assets' dungeon-part0 sample map
 * (maps/dungeon-part0-sample.tmj), used as-is to check the Act 1 tileset
 * against the real characters. Not linked to the other rooms yet (open it
 * with ?room=room-d); its corridor ends are deliberately walled off in the
 * sample until it is.
 *
 * Until the child mage becomes the playable character, two of it stand
 * beside the entry (as authored + flipped) so size and colour can be
 * judged against the tiles at game zoom.
 */
export const roomD: RoomDefinition = {
  id: ROOM_ID,
  tiles,
  exits,
  entryPoints,
  populate: (world, ctx) => {
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
    }
  },
};
