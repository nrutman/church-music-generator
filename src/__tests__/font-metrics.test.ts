import { describe, it, expect } from 'vitest';
import { textWidth, fontsAvailable } from '../font-metrics';

const hasFonts = fontsAvailable();

describe.skipIf(!hasFonts)('textWidth', () => {
  it('returns 0 for empty string', () => {
    expect(textWidth('', 18, 'bold')).toBe(0);
  });

  it('returns a positive width for non-empty text', () => {
    const w = textWidth('Hello', 18, 'bold');
    expect(w).toBeGreaterThan(0);
  });

  it('scales linearly with font size', () => {
    const w18 = textWidth('Hello', 18, 'bold');
    const w9 = textWidth('Hello', 9, 'bold');
    expect(w18).toBeCloseTo(w9 * 2, 1);
  });

  it('bold text is wider than italic text at the same size', () => {
    const bold = textWidth('Hello world', 10, 'bold');
    const italic = textWidth('Hello world', 10, 'italic');
    expect(bold).toBeGreaterThan(italic);
  });

  it('wider characters produce wider measurements', () => {
    const wide = textWidth('WWWWW', 18, 'bold');
    const narrow = textWidth('iiiii', 18, 'bold');
    expect(wide).toBeGreaterThan(narrow);
  });

  it('handles smart apostrophes and special characters', () => {
    const w = textWidth('Father\u2019s', 18, 'bold');
    expect(w).toBeGreaterThan(0);
  });
});
