import { describe, it, expect } from 'vitest';
import { fitTitle } from '../title-fit';
import { fontsAvailable } from '../font-metrics';

const skip = !fontsAvailable();

describe.skipIf(skip)('fitTitle', () => {
  it('returns full size when no capo suffix', () => {
    const result = fitTitle('Your Name Alone Can Save');
    expect(result).toEqual({ strategy: 'single', sizePt: 24 });
  });

  it('returns full size when title + capo fits at 24pt', () => {
    const result = fitTitle('God Is Good', '(Capo 3)');
    expect(result).toEqual({ strategy: 'single', sizePt: 24 });
  });

  it('shrinks capo suffix when title is slightly too long', () => {
    const result = fitTitle('Your Name Alone Can Save', '(Capo 1)');
    expect(result.strategy).toBe('split');
    if (result.strategy === 'split') {
      expect(result.titleSizePt).toBe(24);
      expect(result.capoSizePt).toBeLessThan(24);
      expect(result.capoSizePt).toBeGreaterThanOrEqual(14);
    }
  });

  it('shrinks entire title for very long titles', () => {
    // A title so long that even shrinking the suffix won't help
    const result = fitTitle('A Very Long Song Title That Takes Up A Lot Of Space', '(Capo 5)');
    expect(result.strategy).toBe('single');
    if (result.strategy === 'single') {
      expect(result.sizePt).toBeLessThan(24);
      expect(result.sizePt).toBeGreaterThanOrEqual(18);
    }
  });
});
