/**
 * Aligns chord strings so they sit directly above the correct words
 * in the lyric line below, using tab stops for exact positioning.
 *
 * Chords are mapped to words by index (0-based), then positioned
 * using real font metrics to compute the physical width of the lyrics
 * up to each target word.
 *
 * Returns tab stop positions in DXA and tab-separated chord text.
 */

import { textWidth } from './font-metrics';

export interface AlignedChords {
  text: string; // chord names separated by \t characters
  tabStops: number[]; // DXA positions for each chord's tab stop
}

const LEFT_INDENT_DXA = 1440;
const PT_TO_DXA = 20;
const MIN_GAP_DXA = 200; // minimum gap between tab stops (~0.14")

/**
 * Align chords to lyric character positions using real font metrics and tab stops.
 *
 * @param chords Array of [chordName, charIndex] pairs
 * @param lyricStr The lyrics text
 * @param lyricSizePt Font size of the lyrics in points (default 18)
 */
export function alignChordToLyric(
  chords: [string, number][],
  lyricStr: string,
  lyricSizePt: number = 18,
): AlignedChords {
  if (chords.length === 0) return { text: '', tabStops: [] };

  const tabStops: number[] = [];
  const chordNames: string[] = [];

  for (let c = 0; c < chords.length; c++) {
    const [name, charIdx] = chords[c];
    const charPos = Math.min(charIdx, lyricStr.length);
    const lyricWidthPt = textWidth(lyricStr.slice(0, charPos), lyricSizePt, 'bold');
    let tabDxa = LEFT_INDENT_DXA + Math.round(lyricWidthPt * PT_TO_DXA);

    // Enforce minimum gap from previous chord's tab stop + chord name width
    if (c > 0) {
      const prevChordWidthPt = textWidth(chordNames[c - 1], 10, 'italic');
      const minPos = tabStops[c - 1] + Math.round(prevChordWidthPt * PT_TO_DXA) + MIN_GAP_DXA;
      if (tabDxa < minPos) tabDxa = minPos;
    }

    tabStops.push(tabDxa);
    chordNames.push(name);
  }

  return { text: chordNames.join('\t'), tabStops };
}
