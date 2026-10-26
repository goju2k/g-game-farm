import { describe, expect, it } from 'vitest';
import { buildGrayboxRoom } from './graybox-room.js';
import { ROOM_TILE_SIZE } from './tile-layout.js';

/** The tile drawn at a cell (the first sprite there — walls draw one each). */
function tileAt(room: ReturnType<typeof buildGrayboxRoom>, column: number, row: number): number | undefined {
  const sprite = room.tiles.sprites.find((s) => s.x === column * ROOM_TILE_SIZE && s.y === row * ROOM_TILE_SIZE);
  return sprite ? (sprite.sy / ROOM_TILE_SIZE) * 10 + sprite.sx / ROOM_TILE_SIZE : undefined;
}

describe('wall top autotile (D-041)', () => {
  // Built: 0 top over the face, 1 upper face, 2 lower face, 3 floor, 4 bottom wall.
  const room = buildGrayboxRoom('t', ['#######', '#######', '#..E..#', '#######']);

  it('a top over the face: joined N/E/W, its edge on the face side', () => {
    expect(tileAt(room, 3, 0)).toBe(126); // mask 199 = N NE E W NW
  });
  it('a side wall beside the face: its edge toward the face (east)', () => {
    expect(tileAt(room, 0, 2)).toBe(132); // mask 241 = N S SW W NW
  });
  it('the face rows keep their face tiles', () => {
    expect(tileAt(room, 3, 1)).toBe(20);
    expect(tileAt(room, 3, 2)).toBe(22);
  });
  it('a bottom wall: its edge toward the floor above', () => {
    expect(tileAt(room, 3, 4)).toBe(121); // mask 124 = E SE S SW W
  });
  it('the bottom-left corner: the floor is only at its north-east', () => {
    expect(tileAt(room, 0, 4)).toBe(135); // mask 253
  });
});

describe('standing faces sort among the actors (D-042)', () => {
  const room = buildGrayboxRoom('t', ['#######', '#######', '#..E..#', '#######']);
  const depthAt = (column: number, row: number) => room.tiles.sprites.find((s) => s.x === column * ROOM_TILE_SIZE && s.y === row * ROOM_TILE_SIZE)?.depth;

  it('both face rows carry the line where the wall meets the floor', () => {
    expect(depthAt(3, 1)).toBe(3 * ROOM_TILE_SIZE);
    expect(depthAt(3, 2)).toBe(3 * ROOM_TILE_SIZE);
  });
  it('tops and floors lie flat (no depth)', () => {
    expect(depthAt(3, 0)).toBeUndefined();
    expect(depthAt(3, 3)).toBeUndefined();
    expect(depthAt(3, 4)).toBeUndefined();
  });
});
