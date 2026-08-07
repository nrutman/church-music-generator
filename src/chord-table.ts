import { AlignedChords } from './chord-align';

export const PAGE_TEXT_WIDTH_DXA = 9360;

export interface ChordTableColumn {
  text: string;
  width: number;
}

/**
 * Converts absolute chord positions into fixed-width table columns.
 *
 * The first column reserves the space before the first chord. Each remaining
 * column starts at a chord position and extends to the next chord or page edge.
 */
export function chordTableColumns(
  aligned: AlignedChords,
  leadingText: string = '',
): ChordTableColumn[] {
  if (aligned.positions.length === 0 || aligned.chordNames.length !== aligned.positions.length) {
    throw new Error('Chord table requires one position per chord');
  }

  const positions = aligned.positions;
  for (let i = 0; i < positions.length; i++) {
    const previous = i === 0 ? 0 : positions[i - 1];
    if (positions[i] <= previous || positions[i] >= PAGE_TEXT_WIDTH_DXA) {
      throw new Error('Chord table positions must increase within the page width');
    }
  }

  return [
    { text: leadingText, width: positions[0] },
    ...aligned.chordNames.map((text, index) => ({
      text,
      width:
        index + 1 < positions.length
          ? positions[index + 1] - positions[index]
          : PAGE_TEXT_WIDTH_DXA - positions[index],
    })),
  ];
}
