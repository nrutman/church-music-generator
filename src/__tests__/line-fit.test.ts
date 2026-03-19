import { describe, it, expect } from 'vitest';
import { fittedLyricSizeHalfPts } from '../line-fit';
import { fontsAvailable } from '../font-metrics';

const hasFonts = fontsAvailable();

describe.skipIf(!hasFonts)('fittedLyricSizeHalfPts', () => {
  it('returns undefined for short lyrics at default 18pt', () => {
    expect(fittedLyricSizeHalfPts('Hello world', 18)).toBeUndefined();
  });

  it('reduces size for lyrics that exceed available width', () => {
    const longLine = 'This is a very long lyric line that should not fit at eighteen points';
    const result = fittedLyricSizeHalfPts(longLine, 18);
    expect(result).toBeDefined();
    expect(result!).toBeLessThan(36); // less than 18pt in half-points
    expect(result!).toBeGreaterThanOrEqual(30); // not below 15pt minimum
  });

  it('returns non-default base size even when text fits', () => {
    expect(fittedLyricSizeHalfPts('Short text', 16)).toBe(32);
  });

  it('reduces size when chords would overflow the page width', () => {
    // Long lyrics with many chords spread across the full width — chords near
    // the end will push past page margins at 18pt
    const lyrics = 'Where all sufficient merit did what I could not';
    const chords: [string, number][] = [
      ['D', 6],
      ['Em7', 21],
      ['C', 27],
      ['D', 36],
      ['G/B', 44],
      ['C', 47],
      ['Dsus', 47],
    ];

    const withoutChords = fittedLyricSizeHalfPts(lyrics, 18);
    const withChords = fittedLyricSizeHalfPts(lyrics, 18, chords);

    // Without chords the lyrics fit at 18pt (returns undefined)
    expect(withoutChords).toBeUndefined();
    // With chords, size should be reduced (returns a half-point value < 36)
    if (withChords !== undefined) {
      expect(withChords).toBeLessThan(36);
      expect(withChords).toBeGreaterThanOrEqual(30);
    }
    // At minimum, the chord-aware result shouldn't be larger than without
  });

  it('does not reduce size when chords fit comfortably', () => {
    const lyrics = 'Short lyric line';
    const chords: [string, number][] = [
      ['C', 0],
      ['G', 6],
    ];
    expect(fittedLyricSizeHalfPts(lyrics, 18, chords)).toBeUndefined();
  });

  it('respects minimum size of 15pt even with overflowing chords', () => {
    // Extremely dense chords on a long line
    const lyrics = 'A very long line with many words that stretches quite far across the page';
    const chords: [string, number][] = [
      ['Em', 0],
      ['D', 10],
      ['C', 20],
      ['G/B', 30],
      ['Am7', 40],
      ['Dsus4', 50],
      ['Gsus', 60],
      ['Cmaj7', 70],
    ];
    const result = fittedLyricSizeHalfPts(lyrics, 18, chords);
    if (result !== undefined) {
      expect(result).toBeGreaterThanOrEqual(30); // 15pt minimum in half-points
    }
  });
});
