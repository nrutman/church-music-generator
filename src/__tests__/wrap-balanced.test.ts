import { describe, it, expect } from 'vitest';
import { wrapBalanced, splitAtDelimiters } from '../wrap-balanced';

describe('splitAtDelimiters', () => {
  it('returns original text when no delimiters found', () => {
    expect(splitAtDelimiters('no delimiters here', [', '])).toEqual(['no delimiters here']);
  });

  it('splits at the delimiter closest to the midpoint', () => {
    const result = splitAtDelimiters('first part, second part', [', ']);
    expect(result).toEqual(['first part,', 'second part']);
  });

  it('picks best delimiter when multiple exist', () => {
    // "a, bbbbb bbbbb, c" — mid is ~9. Comma+2 at pos 2 vs pos 16.
    const result = splitAtDelimiters('a, bbbbb bbbbb, c', [', ']);
    expect(result[0]).toBe('a,');
  });

  it('works with dash and slash delimiters', () => {
    expect(splitAtDelimiters('A (BMI) – adm. at X.com', [' – '])).toEqual([
      'A (BMI) –',
      'adm. at X.com',
    ]);
    expect(splitAtDelimiters('Getty Music / Hymns', [' / '])).toEqual(['Getty Music /', 'Hymns']);
  });
});

describe('wrapBalanced', () => {
  it('returns short text as single line', () => {
    expect(wrapBalanced('short text', 80)).toEqual(['short text']);
  });

  it('splits real copyright at comma between publisher groups', () => {
    const text =
      '\u00a9 2023 Getty Music Publishing (BMI) / Messenger Hymns (BMI) \u2013 adm. at MusicServices.com, ' +
      'Be Essential Songs (BMI) / BryanFowlerSongs (BMI) \u2013 adm. at EssentialMusicPublishing.com';
    const result = wrapBalanced(text, 88);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('MusicServices.com');
    expect(result[1]).toContain('Be Essential');
  });

  it('falls through to dash/slash split when segment exceeds maxChars', () => {
    const text =
      'Very Long Publisher Name (BMI) / Another Long Publisher (BMI) – adm. at VeryLongDomain.com';
    const result = wrapBalanced(text, 50);
    expect(result).toHaveLength(2);
    // Split should happen at " / " or " – ", keeping entities together
    expect(result[0]).toContain('Publisher');
    expect(result[1]).toContain('adm.');
  });

  it('returns text as-is when no delimiters and exceeds maxChars', () => {
    const text = 'A very long string with no commas or dashes or slashes at all';
    expect(wrapBalanced(text, 30)).toEqual([text]);
  });
});
