import { describe, expect, it } from 'vitest';
import { GLYPH_COUNT, glyphIndex, glyphStrokes, toGlyphs } from './glyphs.js';

describe('ancient glyphs (31 §0)', () => {
  it('the same character is always the same glyph; spaces stay gaps, punctuation a mark', () => {
    const cells = toGlyphs('작은 것을 두려워하라. 작은');
    expect(cells[0]).toEqual(cells[13]);
    expect(cells[1]).toEqual(cells[14]);
    expect(cells[2]).toEqual({ kind: 'space' });
    expect(cells[11]).toEqual({ kind: 'mark' });
    for (const cell of cells) if (cell.kind === 'glyph') expect(cell.index).toBeLessThan(GLYPH_COUNT);
  });

  it('glyph indices are stable', () => {
    expect(glyphIndex('빛')).toBe(glyphIndex('빛'));
  });

  it('every glyph index has its own stand-in drawing', () => {
    const shapes = new Set(Array.from({ length: GLYPH_COUNT }, (_, i) => JSON.stringify(glyphStrokes(i))));
    expect(shapes.size).toBe(GLYPH_COUNT);
  });
});
