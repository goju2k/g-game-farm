/**
 * The ancient script (demo level design 31 §0): every character of a
 * record's Korean text maps to one of GLYPH_COUNT glyphs — always the same
 * glyph for the same character, so a sharp eye can spot repeats. Spaces stay
 * gaps; punctuation becomes a small mark. Pure — the panel draws the glyphs
 * (asset room's set, or a geometric stand-in).
 */

export const GLYPH_COUNT = 40;

export type GlyphCell = { readonly kind: 'glyph'; readonly index: number } | { readonly kind: 'space' } | { readonly kind: 'mark' };

const MARKS = new Set([...'.,!?…·:;~\'"“”‘’()-—']);

/** A stable index for a character (FNV-1a on its code point). */
export function glyphIndex(ch: string): number {
  let hash = 0x811c9dc5;
  const code = ch.codePointAt(0) ?? 0;
  for (let shift = 0; shift < 32; shift += 8) {
    hash ^= (code >>> shift) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % GLYPH_COUNT;
}

export function toGlyphs(text: string): GlyphCell[] {
  return [...text].map((ch): GlyphCell => (/\s/.test(ch) ? { kind: 'space' } : MARKS.has(ch) ? { kind: 'mark' } : { kind: 'glyph', index: glyphIndex(ch) }));
}

/**
 * Stand-in drawing for glyph `index` until the asset room's glyph set: a
 * few strokes on a 3x3 grid (P-017's geometric seal family), as SVG line
 * segments in a 0..8 box. Distinct for every index.
 */
export function glyphStrokes(index: number): readonly (readonly [number, number, number, number])[] {
  const strokes: (readonly [number, number, number, number])[] = [
    [1, 1, 7, 1], // top
    [1, 7, 7, 7], // bottom
    [1, 1, 1, 7], // left
    [7, 1, 7, 7], // right
    [1, 1, 7, 7], // \
    [7, 1, 1, 7], // /
    [4, 1, 4, 7], // |
    [1, 4, 7, 4], // -
  ];
  // The index-th byte with 2-4 bits set (enough of them for GLYPH_COUNT distinct shapes).
  let found = -1;
  for (let code = 1; code < 256; code++) {
    const bits = code.toString(2).replace(/0/g, '').length;
    if (bits < 2 || bits > 4) continue;
    found += 1;
    if (found === index % GLYPH_COUNT) return strokes.filter((_, i) => code & (1 << i));
  }
  return strokes.slice(0, 2);
}
