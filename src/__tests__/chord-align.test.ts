import { describe, it, expect } from 'vitest';
import { alignChordToLyric } from '../chord-align';

describe('alignChordToLyric', () => {
  it('returns empty or whitespace chord strings unchanged', () => {
    expect(alignChordToLyric('', 'some lyrics')).toBe('');
    expect(alignChordToLyric('   ', 'some lyrics')).toBe('   ');
  });

  it('places chord at position 0 with no leading spaces', () => {
    expect(alignChordToLyric('G', 'Amazing grace')).toBe('G');
  });

  it('adds extra spaces to compensate for wider bold lyrics', () => {
    // Chord at pos 5 needs MORE than 5 spaces because
    // 18pt bold lyrics are wider per character than 10pt chord spaces
    const result = alignChordToLyric('     G', 'Amazing grace');
    const leadingSpaces = result.match(/^ */)?.[0].length ?? 0;
    expect(leadingSpaces).toBeGreaterThan(5);
  });

  it('enforces minimum 3-space gap between chords', () => {
    const result = alignChordToLyric('G C', 'AB');
    const match = result.match(/G( +)C/);
    expect(match).toBeTruthy();
    expect(match![1].length).toBeGreaterThanOrEqual(3);
  });

  it('aligns multiple chords over a real lyric line', () => {
    const result = alignChordToLyric('     Fadd9/A Gadd9/B C', 'O let not this world of sorrows');
    // All chords present in order with at least 3-space gaps
    const parts = result.trim().split(/\s{3,}/);
    expect(parts).toEqual(['Fadd9/A', 'Gadd9/B', 'C']);
  });

  it('handles chords past the end of the lyric', () => {
    const result = alignChordToLyric('G                              C', 'Short');
    expect(result).toMatch(/G\s{3,}C/);
  });

  it('produces wider spacing for wider lyric characters', () => {
    const wideSpaces = alignChordToLyric('     G', 'WWWWW rest').match(/^ */)?.[0].length ?? 0;
    const narrowSpaces = alignChordToLyric('     G', 'iiiii rest').match(/^ */)?.[0].length ?? 0;
    expect(wideSpaces).toBeGreaterThan(narrowSpaces);
  });

  it('aligns chord over mid-word syllable', () => {
    // Pos 4 = 't' in "downtown" (chord over the "town" syllable)
    const leadingSpaces = alignChordToLyric('    G', 'downtown').match(/^ */)?.[0].length ?? 0;
    expect(leadingSpaces).toBeGreaterThan(4);
  });
});
