import { describe, it, expect } from 'vitest';
import { alignChordToLyric } from '../chord-align';
import { fontsAvailable } from '../font-metrics';

const hasFonts = fontsAvailable();

describe.skipIf(!hasFonts)('alignChordToLyric', () => {
  it('returns empty result for empty chord array', () => {
    const result = alignChordToLyric([], 'some lyrics');
    expect(result.chordNames).toEqual([]);
    expect(result.positions).toEqual([]);
  });

  it('returns a single chord at the left indent for charIndex 0', () => {
    const result = alignChordToLyric([['G', 0]], 'Amazing grace');
    expect(result.chordNames).toEqual(['G']);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toBe(1440);
  });

  it('places chord further right for later character positions', () => {
    const atStart = alignChordToLyric([['G', 0]], 'Amazing grace');
    // charIndex 8 = start of "grace"
    const atGrace = alignChordToLyric([['G', 8]], 'Amazing grace');
    expect(atGrace.positions[0]).toBeGreaterThan(atStart.positions[0]);
  });

  it('produces wider positions for wider lyric characters', () => {
    const wide = alignChordToLyric([['G', 6]], 'WWWWW rest');
    const narrow = alignChordToLyric([['G', 6]], 'iiiii rest');
    expect(wide.positions[0]).toBeGreaterThan(narrow.positions[0]);
  });

  it('returns multiple chord names and positions', () => {
    const result = alignChordToLyric(
      [
        ['G', 0],
        ['C', 8],
        ['D', 14],
      ],
      'Amazing grace how',
    );
    expect(result.chordNames).toEqual(['G', 'C', 'D']);
    expect(result.positions).toHaveLength(3);
    expect(result.positions[1]).toBeGreaterThan(result.positions[0]);
    expect(result.positions[2]).toBeGreaterThan(result.positions[1]);
  });

  it('enforces minimum gap between close chords', () => {
    const result = alignChordToLyric(
      [
        ['G', 0],
        ['C', 3],
      ],
      'AB CD',
    );
    expect(result.positions[1]).toBeGreaterThan(result.positions[0]);
    const gapDxa = result.positions[1] - result.positions[0];
    expect(gapDxa).toBeGreaterThanOrEqual(30);
  });

  it('handles charIndex past end of lyrics', () => {
    const result = alignChordToLyric(
      [
        ['G', 0],
        ['C', 100],
      ],
      'Short',
    );
    expect(result.positions).toHaveLength(2);
    expect(result.positions[1]).toBeGreaterThan(result.positions[0]);
  });

  it('uses reduced lyric size for position calculation', () => {
    const defaultSize = alignChordToLyric([['G', 6]], 'Hello world');
    const reducedSize = alignChordToLyric([['G', 6]], 'Hello world', 15);
    expect(reducedSize.positions[0]).toBeLessThan(defaultSize.positions[0]);
  });

  it('supports mid-word chord placement', () => {
    // Chord on "dom" (char 4) of "Kingdom come"
    const atKing = alignChordToLyric([['G', 0]], 'Kingdom come');
    const atDom = alignChordToLyric([['G', 4]], 'Kingdom come');
    expect(atDom.positions[0]).toBeGreaterThan(atKing.positions[0]);
    // "dom" is before "come" (char 8)
    const atCome = alignChordToLyric([['G', 8]], 'Kingdom come');
    expect(atDom.positions[0]).toBeLessThan(atCome.positions[0]);
  });
});
