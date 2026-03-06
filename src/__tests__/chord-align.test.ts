import { describe, it, expect } from 'vitest';
import { alignChordToLyric } from '../chord-align';
import { fontsAvailable } from '../font-metrics';

const hasFonts = fontsAvailable();

describe.skipIf(!hasFonts)('alignChordToLyric', () => {
  it('returns empty result for empty chord array', () => {
    const result = alignChordToLyric([], 'some lyrics');
    expect(result.text).toBe('');
    expect(result.tabStops).toEqual([]);
  });

  it('returns a single chord with tab stop at left indent for charIndex 0', () => {
    const result = alignChordToLyric([['G', 0]], 'Amazing grace');
    expect(result.text).toBe('G');
    expect(result.tabStops).toHaveLength(1);
    expect(result.tabStops[0]).toBe(1440);
  });

  it('places chord further right for later character positions', () => {
    const atStart = alignChordToLyric([['G', 0]], 'Amazing grace');
    // charIndex 8 = start of "grace"
    const atGrace = alignChordToLyric([['G', 8]], 'Amazing grace');
    expect(atGrace.tabStops[0]).toBeGreaterThan(atStart.tabStops[0]);
  });

  it('produces wider tab positions for wider lyric characters', () => {
    const wide = alignChordToLyric([['G', 6]], 'WWWWW rest');
    const narrow = alignChordToLyric([['G', 6]], 'iiiii rest');
    expect(wide.tabStops[0]).toBeGreaterThan(narrow.tabStops[0]);
  });

  it('returns multiple chords separated by tabs', () => {
    const result = alignChordToLyric(
      [['G', 0], ['C', 8], ['D', 14]],
      'Amazing grace how',
    );
    expect(result.text.split('\t')).toEqual(['G', 'C', 'D']);
    expect(result.tabStops).toHaveLength(3);
    expect(result.tabStops[1]).toBeGreaterThan(result.tabStops[0]);
    expect(result.tabStops[2]).toBeGreaterThan(result.tabStops[1]);
  });

  it('enforces minimum gap between close chords', () => {
    const result = alignChordToLyric(
      [['G', 0], ['C', 3]],
      'AB CD',
    );
    expect(result.tabStops[1]).toBeGreaterThan(result.tabStops[0]);
    const gapDxa = result.tabStops[1] - result.tabStops[0];
    expect(gapDxa).toBeGreaterThanOrEqual(30);
  });

  it('handles charIndex past end of lyrics', () => {
    const result = alignChordToLyric(
      [['G', 0], ['C', 100]],
      'Short',
    );
    expect(result.tabStops).toHaveLength(2);
    expect(result.tabStops[1]).toBeGreaterThan(result.tabStops[0]);
  });

  it('uses reduced lyric size for tab stop calculation', () => {
    const defaultSize = alignChordToLyric([['G', 6]], 'Hello world');
    const reducedSize = alignChordToLyric([['G', 6]], 'Hello world', 15);
    expect(reducedSize.tabStops[0]).toBeLessThan(defaultSize.tabStops[0]);
  });

  it('supports mid-word chord placement', () => {
    // Chord on "dom" (char 4) of "Kingdom come"
    const atKing = alignChordToLyric([['G', 0]], 'Kingdom come');
    const atDom = alignChordToLyric([['G', 4]], 'Kingdom come');
    expect(atDom.tabStops[0]).toBeGreaterThan(atKing.tabStops[0]);
    // "dom" is before "come" (char 8)
    const atCome = alignChordToLyric([['G', 8]], 'Kingdom come');
    expect(atDom.tabStops[0]).toBeLessThan(atCome.tabStops[0]);
  });
});
