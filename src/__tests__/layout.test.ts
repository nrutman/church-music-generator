import { describe, it, expect } from 'vitest';
import { estimateSectionHeight, planPages, LINE_HEIGHTS } from '../layout';
import { Section } from '../types';

describe('estimateSectionHeight', () => {
  it('calculates intro height for chord mode', () => {
    expect(estimateSectionHeight({ type: 'intro', chords: ['G  D  G'] }, 'chord')).toBe(
      LINE_HEIGHTS.chords1st,
    );
  });

  it('calculates multi-line intro height for chord mode', () => {
    expect(estimateSectionHeight({ type: 'intro', chords: ['G  D  G', 'C  G  D'] }, 'chord')).toBe(
      LINE_HEIGHTS.chords1st + LINE_HEIGHTS.chord,
    );
  });

  it('returns 0 for intro in lyric mode', () => {
    expect(estimateSectionHeight({ type: 'intro', chords: ['G  D  G'] }, 'lyric')).toBe(0);
  });

  it('calculates verse height for chord mode', () => {
    const verse: Section = {
      type: 'verse',
      number: 1,
      lines: [
        {
          chords: [
            ['G', 0],
            ['C', 1],
            ['G', 2],
          ],
          lyrics: 'First line words',
        },
        {
          chords: [
            ['G', 0],
            ['D', 1],
          ],
          lyrics: 'Second line',
        },
        {
          chords: [
            ['C', 0],
            ['G', 1],
          ],
          lyrics: 'Third line',
        },
      ],
    };
    const expected =
      LINE_HEIGHTS.chords1st + LINE_HEIGHTS.lyric + 2 * (LINE_HEIGHTS.chord + LINE_HEIGHTS.lyric);
    expect(estimateSectionHeight(verse, 'chord')).toBe(expected);
  });

  it('calculates verse height for lyric mode', () => {
    const verse: Section = {
      type: 'verse',
      number: 1,
      lines: [
        {
          chords: [
            ['G', 0],
            ['C', 1],
            ['G', 2],
          ],
          lyrics: 'First line words',
        },
        {
          chords: [
            ['G', 0],
            ['D', 1],
          ],
          lyrics: 'Second line',
        },
      ],
    };
    expect(estimateSectionHeight(verse, 'lyric')).toBe(
      LINE_HEIGHTS.sectionLabel + LINE_HEIGHTS.lyric,
    );
  });

  it('calculates bridge height same as verse', () => {
    const bridge: Section = {
      type: 'bridge',
      lines: [
        {
          chords: [
            ['Am', 0],
            ['F', 1],
          ],
          lyrics: 'Bridge line 1',
        },
        {
          chords: [
            ['C', 0],
            ['G', 1],
          ],
          lyrics: 'Bridge line 2',
        },
      ],
    };
    const expected =
      LINE_HEIGHTS.chords1st + LINE_HEIGHTS.lyric + LINE_HEIGHTS.chord + LINE_HEIGHTS.lyric;
    expect(estimateSectionHeight(bridge, 'chord')).toBe(expected);
  });
});

describe('planPages', () => {
  it('places small content on a single page', () => {
    const sections: Section[] = [
      { type: 'verse', number: 1, lines: [{ chords: [['G', 0]], lyrics: 'Line' }] },
      { type: 'chorus', lines: [{ chords: [['C', 0]], lyrics: 'Chorus' }] },
    ];
    const pages = planPages(sections, 'chord');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(2);
  });

  it('splits content across two pages when needed', () => {
    const sections: Section[] = Array.from({ length: 4 }, (_, i) => ({
      type: 'verse' as const,
      number: i + 1,
      lines: Array.from({ length: 8 }, (_, j) => ({
        chords: [
          ['G', 0],
          ['C', 1],
          ['D', 2],
        ],
        lyrics: `Verse ${i + 1} line ${j + 1}`,
      })),
    }));
    const pages = planPages(sections, 'chord');
    expect(pages).toHaveLength(2);
  });

  it('skips intros in lyric mode', () => {
    const sections: Section[] = [
      { type: 'intro', chords: ['G  D  G'] },
      { type: 'verse', number: 1, lines: [{ chords: [['G', 0]], lyrics: 'Line' }] },
    ];
    const pages = planPages(sections, 'lyric');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
    expect(pages[0][0].section.type).toBe('verse');
  });

  it('plans lyric mode pages with multiple sections', () => {
    const sections: Section[] = [
      {
        type: 'verse',
        number: 1,
        lines: Array.from({ length: 8 }, (_, j) => ({
          chords: [['G', 0]],
          lyrics: `Line ${j + 1}`,
        })),
      },
      {
        type: 'chorus',
        lines: Array.from({ length: 4 }, (_, j) => ({
          chords: [['C', 0]],
          lyrics: `Chorus ${j + 1}`,
        })),
      },
    ];
    const pages = planPages(sections, 'lyric');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(2);
  });

  it('uses reduced gap when page 2 is tight', () => {
    const makeBigVerse = (num: number): Section => ({
      type: 'verse',
      number: num,
      lines: Array.from({ length: 8 }, (_, j) => ({
        chords: [
          ['G', 0],
          ['C', 1],
          ['D', 2],
        ],
        lyrics: `Verse ${num} line ${j + 1}`,
      })),
    });
    const pages = planPages([makeBigVerse(1), makeBigVerse(2), makeBigVerse(3)], 'chord');
    expect(pages.length).toBeLessThanOrEqual(2);
  });
});
