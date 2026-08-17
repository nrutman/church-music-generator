import { describe, expect, it } from 'vitest';
import { matchTitle, normalize, scoreFilename } from '../binder/fuzzy';

describe('binder fuzzy matching', () => {
  it('normalizes extensions, punctuation, case, and whitespace', () => {
    expect(normalize("It's   Your-name.DOCX")).toBe('it s your name');
  });

  it.each([
    ['Amazing Grace', 'Amazing Grace.docx', 0.99],
    ['Amazing Grace', 'Amazing Grace (Capo 3).docx', 0.9],
    ['Grace', 'Amazing Grace.docx', 0.9],
    ['How Great', 'How Great Thou Art.docx', 0.75],
    ['How Great', 'How Great Is Our God.docx', 0.75],
  ])('scores %s against %s above the expected threshold', (query, file, threshold) => {
    expect(scoreFilename(query, file)).toBeGreaterThanOrEqual(threshold);
  });

  it('keeps unrelated or weakly related songs below the threshold', () => {
    expect(scoreFilename('Amazing Grace', 'Holy Holy Holy.docx')).toBeLessThan(0.5);
    expect(scoreFilename('Amazing Grace', 'Grace Like Rain.docx')).toBeLessThan(0.75);
  });

  it('surfaces standard and Capo files rather than silently selecting one', () => {
    const result = matchTitle('Amazing Grace', [
      '/music/Amazing Grace.docx',
      '/music/Amazing Grace (Capo 3).docx',
    ]);
    expect(result.candidates.map(({ filePath }) => filePath)).toHaveLength(2);
  });
});
