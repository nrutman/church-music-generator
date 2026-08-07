import { describe, expect, it } from 'vitest';
import { chordTableColumns, PAGE_TEXT_WIDTH_DXA } from '../chord-table';

describe('chordTableColumns', () => {
  it('converts absolute chord positions into page-width columns', () => {
    const columns = chordTableColumns(
      { chordNames: ['C', 'G', 'D'], positions: [1440, 3600, 7200] },
      'VERSE 1',
    );

    expect(columns).toEqual([
      { text: 'VERSE 1', width: 1440 },
      { text: 'C', width: 2160 },
      { text: 'G', width: 3600 },
      { text: 'D', width: 2160 },
    ]);
    expect(columns.reduce((total, column) => total + column.width, 0)).toBe(PAGE_TEXT_WIDTH_DXA);
  });

  it('keeps repeated trailing chords in separate columns', () => {
    const columns = chordTableColumns({
      chordNames: ['C', '|', 'D', 'G/B'],
      positions: [4101, 4741, 4993, 5337],
    });

    expect(columns.map((column) => column.text)).toEqual(['', 'C', '|', 'D', 'G/B']);
    expect(columns.every((column) => column.width > 0)).toBe(true);
  });

  it('rejects invalid chord positions', () => {
    expect(() => chordTableColumns({ chordNames: ['C', 'D'], positions: [1440, 1440] })).toThrow(
      'must increase',
    );
    expect(() => chordTableColumns({ chordNames: ['C'], positions: [] })).toThrow(
      'one position per chord',
    );
  });
});
