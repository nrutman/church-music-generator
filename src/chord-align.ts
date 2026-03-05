/**
 * Aligns chord strings so they sit directly above the correct syllables
 * in the lyric line below, using tab stops for exact positioning.
 *
 * Returns tab stop positions in DXA and tab-separated chord text.
 */

import { textWidth } from './font-metrics';

export interface AlignedChords {
  text: string;       // chord names separated by \t characters
  tabStops: number[]; // DXA positions for each chord's tab stop
}

const LEFT_INDENT_DXA = 1440;
const PT_TO_DXA = 20;
const MIN_GAP_DXA = 200; // minimum gap between tab stops (~0.14")

interface ChordToken {
  text: string;
  pos: number;
}

function parseChordTokens(chordStr: string): ChordToken[] {
  const tokens: ChordToken[] = [];
  let i = 0;
  while (i < chordStr.length) {
    if (chordStr[i] === ' ' || chordStr[i] === '\t') {
      i++;
      continue;
    }
    const start = i;
    while (i < chordStr.length && chordStr[i] !== ' ' && chordStr[i] !== '\t') i++;
    tokens.push({ text: chordStr.slice(start, i), pos: start });
  }
  return tokens;
}

/**
 * Align chords to lyric positions using real font metrics and tab stops.
 * Returns tab stop positions (DXA) and tab-separated chord text.
 */
export function alignChordToLyric(
  chordStr: string,
  lyricStr: string,
  lyricSizePt: number = 18,
): AlignedChords {
  const tokens = parseChordTokens(chordStr);
  if (tokens.length === 0) return { text: '', tabStops: [] };

  const tabStops: number[] = [];
  const chordNames: string[] = [];

  for (let c = 0; c < tokens.length; c++) {
    const lyricPos = Math.min(tokens[c].pos, lyricStr.length);
    const lyricWidthPt = textWidth(lyricStr.slice(0, lyricPos), lyricSizePt, 'bold');
    let tabDxa = LEFT_INDENT_DXA + Math.round(lyricWidthPt * PT_TO_DXA);

    // Enforce minimum gap from previous chord's tab stop + chord name width
    if (c > 0) {
      const prevChordWidthPt = textWidth(tokens[c - 1].text, 10, 'italic');
      const minPos = tabStops[c - 1] + Math.round(prevChordWidthPt * PT_TO_DXA) + MIN_GAP_DXA;
      if (tabDxa < minPos) tabDxa = minPos;
    }

    tabStops.push(tabDxa);
    chordNames.push(tokens[c].text);
  }

  return { text: chordNames.join('\t'), tabStops };
}
