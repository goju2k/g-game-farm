import { NullRenderer, World, type SpriteDraw, type TextureHandle } from '@g-game-farm/ribs';
import { buildGrayboxRoom } from '../rooms/graybox-room.js';
import { PlayerControlled, Position, RoomTileLayout, SpriteRender } from '../components.js';
import { createLetterboxSystem } from './camera-follow-player.js';

/** The rock beyond the room (D-048): drawn over the visible area outside the map, on the lit ground layer, never inside. */
describe('outside the room (D-048)', () => {
  it('fills the view beyond a small room with its rock tile, under the same light; the room itself is left alone', () => {
    const world = new World();
    const room = buildGrayboxRoom('t', ['#######', '#..E..#', '#######']);
    world.set(world.createEntity(), RoomTileLayout, room.tiles);
    const player = world.createEntity();
    world.set(player, Position, { x: 50, y: 30 });
    world.set(player, SpriteRender, { texture: 0 as TextureHandle, layer: 'gameplay', sx: 0, sy: 0, sWidth: 16, sHeight: 16, width: 16, height: 16 });
    world.set(player, PlayerControlled, {} as never);

    const drawn: SpriteDraw[] = [];
    const renderer = new NullRenderer();
    renderer.resize(1920, 1080); // 480 x 270 world
    renderer.submitSprite = (draw: SpriteDraw) => void drawn.push(draw);
    createLetterboxSystem(1 as TextureHandle, { 'dungeon-part0': 9 as TextureHandle }).run({ world, renderer } as never);

    const rock = room.tiles.outside;
    expect(rock).toBeDefined();
    expect(drawn.length).toBeGreaterThan((480 / 16) * (270 / 16) - 7 * 4); // nearly the whole view, in tiles
    expect(drawn.every((d) => d.layer === 'ground' && d.texture === 9 && d.sx === rock?.sx && d.sy === rock?.sy)).toBe(true);
    const width = 7 * 16;
    const height = 4 * 16; // three rows + the wall row the builder adds on top
    expect(drawn.some((d) => d.x >= 0 && d.x < width && d.y >= 0 && d.y < height)).toBe(false);
  });
});
