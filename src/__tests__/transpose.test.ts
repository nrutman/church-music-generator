import { describe, it, expect } from 'vitest';
import { transposeChord, transposeSections } from '../transpose';

describe('transposeChord', () => {
  it('transposes simple major chords down', () => {
    expect(transposeChord('C', 3, false)).toBe('A');
    expect(transposeChord('G', 2, false)).toBe('F');
    expect(transposeChord('D', 1, false)).toBe('C#');
  });

  it('transposes with flats when requested', () => {
    expect(transposeChord('D', 1, true)).toBe('Db');
    expect(transposeChord('A', 1, true)).toBe('Ab');
  });

  it('transposes chords with qualities', () => {
    expect(transposeChord('Am7', 3, false)).toBe('F#m7');
    expect(transposeChord('Dm7', 3, false)).toBe('Bm7');
    expect(transposeChord('Fadd9', 3, false)).toBe('Dadd9');
  });

  it('transposes slash chords (root and bass)', () => {
    expect(transposeChord('C/E', 3, false)).toBe('A/C#');
    expect(transposeChord('C/G', 3, false)).toBe('A/E');
    expect(transposeChord('Fadd9/A', 3, false)).toBe('Dadd9/F#');
    expect(transposeChord('Gadd9/B', 3, false)).toBe('Eadd9/G#');
  });

  it('transposes E/G# down 2 to D/F#', () => {
    expect(transposeChord('E/G#', 2, false)).toBe('D/F#');
  });

  it('handles wrapping around the chromatic scale', () => {
    expect(transposeChord('C', 1, false)).toBe('B');
    expect(transposeChord('C', 2, false)).toBe('A#');
    expect(transposeChord('C', 2, true)).toBe('Bb');
  });

  it('transposes F/G chord', () => {
    expect(transposeChord('F/G', 3, false)).toBe('D/E');
  });

  it('transposes Am7/G chord', () => {
    expect(transposeChord('Am7/G', 3, false)).toBe('F#m7/E');
  });

  it('passes through non-chord tokens like bar lines', () => {
    expect(transposeChord('|', 3, false)).toBe('|');
  });
});

describe('transposeSections', () => {
  it('transposes all chords in line sections', () => {
    const sections = [
      {
        type: 'verse' as const,
        number: 1,
        lines: [
          {
            chords: [
              ['C', 0],
              ['F', 5],
              ['G', 10],
            ] as [string, number][],
            lyrics: 'Hello world today',
          },
        ],
      },
    ];
    const result = transposeSections(sections, 3);
    expect(result[0]).toHaveProperty('lines');
    const lines = (result[0] as (typeof sections)[0]).lines;
    expect(lines[0].chords).toEqual([
      ['A', 0],
      ['D', 5],
      ['E', 10],
    ]);
    // charIndex values are preserved
    expect(lines[0].lyrics).toBe('Hello world today');
  });

  it('transposes intro sections', () => {
    const sections = [
      {
        type: 'intro' as const,
        chords: ['3/4 Fadd9/A  Gadd9/B|C'],
      },
    ];
    const result = transposeSections(sections, 3);
    const intro = result[0] as (typeof sections)[0];
    // F->D, A->F#, G->E, B->G#, C->A
    expect(intro.chords[0]).toContain('Dadd9/F#');
    expect(intro.chords[0]).toContain('Eadd9/G#');
    expect(intro.chords[0]).toContain('A');
  });

  it('does not mutate the original sections', () => {
    const sections = [
      {
        type: 'verse' as const,
        lines: [{ chords: [['C', 0]] as [string, number][], lyrics: 'Test' }],
      },
    ];
    const original = JSON.stringify(sections);
    transposeSections(sections, 3);
    expect(JSON.stringify(sections)).toBe(original);
  });

  it('uses flats for flat keys', () => {
    // Song in D transposed down 1 → Db (flat key)
    const sections = [
      {
        type: 'verse' as const,
        lines: [
          {
            chords: [
              ['D', 0],
              ['A', 5],
            ] as [string, number][],
            lyrics: 'Hello world',
          },
        ],
      },
    ];
    const result = transposeSections(sections, 1);
    const lines = (result[0] as (typeof sections)[0]).lines;
    expect(lines[0].chords[0][0]).toBe('Db');
    expect(lines[0].chords[1][0]).toBe('Ab');
  });
});
