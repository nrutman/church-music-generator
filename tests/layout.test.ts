import { describe, it, expect } from 'vitest';
import { estimateSectionHeight, planPages, LINE_HEIGHTS, PAGE_HEIGHT } from '../src/layout';
import { Section } from '../src/types';

describe('estimateSectionHeight', () => {
  it('calculates intro height for chord mode', () => {
    const intro: Section = { type: 'intro', chords: ['G  D  G'] };
    expect(estimateSectionHeight(intro, 'chord')).toBe(LINE_HEIGHTS.chords1st);
  });

  it('calculates multi-line intro height for chord mode', () => {
    const intro: Section = { type: 'intro', chords: ['G  D  G', 'C  G  D'] };
    expect(estimateSectionHeight(intro, 'chord')).toBe(LINE_HEIGHTS.chords1st + LINE_HEIGHTS.chord);
  });

  it('returns 0 for intro in lyric mode', () => {
    const intro: Section = { type: 'intro', chords: ['G  D  G'] };
    expect(estimateSectionHeight(intro, 'lyric')).toBe(0);
  });

  it('calculates verse height for chord mode', () => {
    const verse: Section = {
      type: 'verse',
      number: 1,
      lines: [
        { chords: 'G  C  G', lyrics: 'First line' },
        { chords: 'G  D', lyrics: 'Second line' },
        { chords: 'C  G', lyrics: 'Third line' },
      ],
    };
    // chords1st + lyric + (chord + lyric) * 2
    const expected =
      LINE_HEIGHTS.chords1st + LINE_HEIGHTS.lyric + 2 * (LINE_HEIGHTS.chord + LINE_HEIGHTS.lyric);
    expect(estimateSectionHeight(verse, 'chord')).toBe(expected);
  });

  it('calculates verse height for lyric mode', () => {
    const verse: Section = {
      type: 'verse',
      number: 1,
      lines: [
        { chords: 'G  C  G', lyrics: 'First line' },
        { chords: 'G  D', lyrics: 'Second line' },
      ],
    };
    // sectionLabel + (lines - 1) * lyric
    const expected = LINE_HEIGHTS.sectionLabel + LINE_HEIGHTS.lyric;
    expect(estimateSectionHeight(verse, 'lyric')).toBe(expected);
  });

  it('calculates chorus height same as verse', () => {
    const chorus: Section = {
      type: 'chorus',
      lines: [
        { chords: 'C  G  D', lyrics: 'Chorus line 1' },
        { chords: 'G  C', lyrics: 'Chorus line 2' },
      ],
    };
    const expected =
      LINE_HEIGHTS.chords1st + LINE_HEIGHTS.lyric + LINE_HEIGHTS.chord + LINE_HEIGHTS.lyric;
    expect(estimateSectionHeight(chorus, 'chord')).toBe(expected);
  });
});

describe('planPages', () => {
  it('places small content on a single page', () => {
    const sections: Section[] = [
      {
        type: 'verse',
        number: 1,
        lines: [{ chords: 'G', lyrics: 'Line' }],
      },
      {
        type: 'chorus',
        lines: [{ chords: 'C', lyrics: 'Chorus' }],
      },
    ];
    const pages = planPages(sections, 'chord');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(2);
  });

  it('splits content across two pages when needed', () => {
    // Create enough sections to overflow one page
    const sections: Section[] = [];
    for (let i = 1; i <= 4; i++) {
      sections.push({
        type: 'verse',
        number: i,
        lines: Array.from({ length: 8 }, (_, j) => ({
          chords: 'G  C  D',
          lyrics: `Verse ${i} line ${j + 1}`,
        })),
      });
    }
    const pages = planPages(sections, 'chord');
    expect(pages).toHaveLength(2);
  });

  it('skips intros in lyric mode', () => {
    const sections: Section[] = [
      { type: 'intro', chords: ['G  D  G'] },
      {
        type: 'verse',
        number: 1,
        lines: [{ chords: 'G', lyrics: 'Line' }],
      },
    ];
    const pages = planPages(sections, 'lyric');
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1); // only the verse
    expect(pages[0][0].section.type).toBe('verse');
  });

  it('uses reduced gap when page 2 is tight', () => {
    // Create sections that barely fit with reduced gap on page 2
    const makeBigVerse = (num: number): Section => ({
      type: 'verse',
      number: num,
      lines: Array.from({ length: 8 }, (_, j) => ({
        chords: 'G  C  D',
        lyrics: `Verse ${num} line ${j + 1}`,
      })),
    });

    const sections: Section[] = [makeBigVerse(1), makeBigVerse(2), makeBigVerse(3)];

    const pages = planPages(sections, 'chord');
    expect(pages.length).toBeLessThanOrEqual(2);
  });
});

describe('constants', () => {
  it('has reasonable page height', () => {
    expect(PAGE_HEIGHT).toBe(670);
  });

  it('has consistent line height values', () => {
    expect(LINE_HEIGHTS.lyric).toBeGreaterThan(LINE_HEIGHTS.chord);
    expect(LINE_HEIGHTS.empty).toBe(LINE_HEIGHTS.lyric);
  });
});
