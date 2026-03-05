import { describe, it, expect } from 'vitest';
import { alignChordToLyric } from '../chord-align';
import { fontsAvailable } from '../font-metrics';

const hasFonts = fontsAvailable();

describe.skipIf(!hasFonts)('alignChordToLyric', () => {
  it('returns empty result for empty chord string', () => {
    const result = alignChordToLyric('', 'some lyrics');
    expect(result.text).toBe('');
    expect(result.tabStops).toEqual([]);
  });

  it('returns a single chord with one tab stop', () => {
    const result = alignChordToLyric('G', 'Amazing grace');
    expect(result.text).toBe('G');
    expect(result.tabStops).toHaveLength(1);
    // Position 0 in lyrics → tab stop at the left indent (1440 DXA)
    expect(result.tabStops[0]).toBe(1440);
  });

  it('places chord further right for later lyric positions', () => {
    const atStart = alignChordToLyric('G', 'Amazing grace');
    const atPos8 = alignChordToLyric('        G', 'Amazing grace');
    expect(atPos8.tabStops[0]).toBeGreaterThan(atStart.tabStops[0]);
  });

  it('produces wider tab positions for wider lyric characters', () => {
    const wide = alignChordToLyric('     G', 'WWWWW rest');
    const narrow = alignChordToLyric('     G', 'iiiii rest');
    expect(wide.tabStops[0]).toBeGreaterThan(narrow.tabStops[0]);
  });

  it('returns multiple chords separated by tabs', () => {
    const result = alignChordToLyric('G    C    D', 'Amazing grace how');
    expect(result.text.split('\t')).toEqual(['G', 'C', 'D']);
    expect(result.tabStops).toHaveLength(3);
    // Each successive tab stop is further right
    expect(result.tabStops[1]).toBeGreaterThan(result.tabStops[0]);
    expect(result.tabStops[2]).toBeGreaterThan(result.tabStops[1]);
  });

  it('enforces minimum gap between closely spaced chords', () => {
    // Two chords at nearly adjacent positions
    const result = alignChordToLyric('G C', 'AB');
    expect(result.tabStops[1]).toBeGreaterThan(result.tabStops[0]);
    // The gap should be at least enough to fit the first chord name
    const gapDxa = result.tabStops[1] - result.tabStops[0];
    expect(gapDxa).toBeGreaterThanOrEqual(30);
  });

  it('handles chords past the end of the lyric', () => {
    const result = alignChordToLyric('G                              C', 'Short');
    expect(result.tabStops).toHaveLength(2);
    expect(result.tabStops[1]).toBeGreaterThan(result.tabStops[0]);
  });

  it('uses reduced lyric size for tab stop calculation', () => {
    const defaultSize = alignChordToLyric('     G', 'Hello world');
    const reducedSize = alignChordToLyric('     G', 'Hello world', 15);
    // Smaller lyric font → narrower lyrics → chord tab stop is closer to left
    expect(reducedSize.tabStops[0]).toBeLessThan(defaultSize.tabStops[0]);
  });
});
