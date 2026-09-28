import type { TileMap } from '@g-game-farm/engine-tilemap';

/** maps/<name>.tmj -> src/lib/rooms/maps/<name>.generated.ts, relative to this package's root. */
export function generatedModulePathFor(mapFileName: string): string {
  return `src/lib/rooms/maps/${mapFileName.replace(/\.tmj$/, '')}.generated.ts`;
}

/** "test" -> "testTileMap", "room-c" -> "roomCTileMap". */
export function exportNameFor(mapFileName: string): string {
  const base = mapFileName.replace(/\.tmj$/, '');
  const camel = base.replace(/[-_ ]+([a-zA-Z0-9])/g, (_, next: string) => next.toUpperCase());
  return `${camel}TileMap`;
}

/**
 * The generated module's full source text. Deterministic (same TileMap in,
 * byte-identical text out) so a test can regenerate in memory and diff
 * against the committed file. One tile placement per line, so a map edit
 * shows up as a readable diff instead of one giant changed line.
 */
export function tileMapModuleSource(mapFileName: string, map: TileMap): string {
  const json = JSON.stringify(map, null, 2).replace(
    /\{\s+"column": (\d+),\s+"row": (\d+),\s+"tileId": (\d+)\s+\}/g,
    '{ "column": $1, "row": $2, "tileId": $3 }',
  );
  return [
    `// GENERATED from maps/${mapFileName} by scripts/build-maps.ts — do not edit by hand.`,
    '// Edit the map in Tiled, then run: npx nx run roguelite:build-maps',
    "import type { TileMap } from '@g-game-farm/engine-tilemap';",
    '',
    `export const ${exportNameFor(mapFileName)}: TileMap = ${json};`,
    '',
  ].join('\n');
}
