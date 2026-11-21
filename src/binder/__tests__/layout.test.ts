import { describe, expect, it } from 'vitest';
import { effectivePageCount, findSuspiciousPageBreaks, planBinderLayout } from '../layout';

describe('binder spread layout', () => {
  it('keeps every two-page song on a facing spread while preserving order', () => {
    expect(planBinderLayout([2, 1, 2, 1, 1])).toEqual([
      { blankBefore: true, binderStart: 2, binderEnd: 3 },
      { blankBefore: false, binderStart: 4, binderEnd: 4 },
      { blankBefore: true, binderStart: 6, binderEnd: 7 },
      { blankBefore: false, binderStart: 8, binderEnd: 8 },
      { blankBefore: false, binderStart: 9, binderEnd: 9 },
    ]);
  });

  it.each([{ counts: [2, 1, 2] }, { counts: [1, 2, 1, 2] }, { counts: [2, 2, 1, 1, 2] }])(
    'never starts a two-page song on an odd page: $counts',
    ({ counts }) => {
      planBinderLayout(counts).forEach((entry, index) => {
        if (counts[index] === 2) expect(entry.binderStart % 2).toBe(0);
      });
    },
  );
});

describe('trailing chrome detection', () => {
  it('trims recurring headers and footers while preserving the first page', () => {
    expect(
      effectivePageCount([
        [
          'Providence Church Page 1 of 2',
          'HOLY HOLY HOLY Words and Music by John Doe',
          'Verse content here',
          '© Public Domain',
          'CCLI #1210714',
        ],
        [
          'Providence Church Page 2 of 2',
          'HOLY HOLY HOLY Words and Music by John Doe',
          '© Public Domain',
          'CCLI #1210714',
        ],
      ]),
    ).toEqual({ effectivePages: 1, trimmed: 1 });
    expect(effectivePageCount([[]])).toEqual({ effectivePages: 1, trimmed: 0 });
  });

  it('keeps short repeated musical content unless every line is recurring chrome', () => {
    const shared = ['Repeating header'];
    expect(effectivePageCount([shared, [...shared, 'one two three four']])).toEqual({
      effectivePages: 2,
      trimmed: 0,
    });
    expect(effectivePageCount([shared, shared])).toEqual({ effectivePages: 2, trimmed: 0 });
    expect(effectivePageCount([shared, []])).toEqual({ effectivePages: 2, trimmed: 0 });
  });
});

describe('split-section detection', () => {
  it('flags a lone lyric after recurring header text', () => {
    expect(
      findSuspiciousPageBreaks([
        ['BRIDGE', 'Yesterday today and tomorrow'],
        ['Providence Church Page 2 of 2', 'Until the day You return', 'CCLI #1210714'],
      ]),
    ).toEqual([{ page: 2, firstLine: 'Until the day You return' }]);
  });

  it.each([
    'VERSE 3   C G',
    'Chorus 2',
    'PRE-CHORUS',
    'Post Chorus',
    'BRIDGE',
    'TAG',
    'INTRO',
    'OUTRO',
    'INTERLUDE',
    'REFRAIN',
  ])('accepts a page starting with %s', (label) => {
    expect(findSuspiciousPageBreaks([['Verse 1'], ['Providence Church', label, 'Lyrics']])).toEqual(
      [],
    );
  });

  it('flags chord-only continuation rows even when a new section occurs later', () => {
    expect(
      findSuspiciousPageBreaks([['VERSE 1'], ['C    G/B    Am', 'Continued lyric', 'CHORUS']]),
    ).toEqual([{ page: 2, firstLine: 'C    G/B    Am' }]);
  });

  it('does not classify first pages or chrome-only pages as split sections', () => {
    expect(
      findSuspiciousPageBreaks([
        ['Unlabelled opening lyric'],
        ['Providence Church', 'CCLI #1210714'],
        [],
      ]),
    ).toEqual([]);
  });
});
