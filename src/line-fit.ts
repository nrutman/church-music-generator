/**
 * Determines the fitted lyric font size (in half-points) for a line,
 * ensuring both lyrics and chords fit within the available page width.
 */

import { textWidth } from './font-metrics';
import { alignChordToLyric } from './chord-align';

// Available text width for BodyText: page 8.5" - 1" left/right margins - 0.5" left indent - 0.5" firstLine indent = 5.5" = 396pt
const BODY_TEXT_WIDTH_PT = 396;
const MIN_LYRIC_SIZE_PT = 15;
// Maximum DXA position for content (page width minus both margins): 12240 - 1440 - 1440
const PAGE_TEXT_WIDTH_DXA = 9360;
const PT_TO_DXA = 20;
// Word-compatible renderers need a little room inside the final table cell or
// a chord that mathematically reaches the page edge can wrap at a slash.
const FINAL_CHORD_END_BUFFER_DXA = 100;

/**
 * Returns the fitted lyric font size in half-points, or undefined if the
 * default 18pt base size works. Checks both lyric text width and chord line
 * width (when chords are provided) to prevent either from wrapping.
 */
export function fittedLyricSizeHalfPts(
  text: string,
  baseSizePt: number,
  chords?: [string, number][],
): number | undefined {
  let sizePt = baseSizePt;

  // Check lyric width
  const w = textWidth(text, sizePt, 'bold');
  if (w > BODY_TEXT_WIDTH_PT) {
    sizePt = Math.max(MIN_LYRIC_SIZE_PT, Math.floor(baseSizePt * (BODY_TEXT_WIDTH_PT / w)));
  }

  // Check chord line width — reduce further if chords would overflow the page
  if (chords && chords.length > 0) {
    while (sizePt > MIN_LYRIC_SIZE_PT) {
      const aligned = alignChordToLyric(chords, text, sizePt);
      const lastIdx = aligned.positions.length - 1;
      const lastChordName = chords[lastIdx][0];
      const lastChordWidthDxa = Math.round(textWidth(lastChordName, 10, 'italic') * PT_TO_DXA);
      if (
        aligned.positions[lastIdx] + lastChordWidthDxa + FINAL_CHORD_END_BUFFER_DXA <=
        PAGE_TEXT_WIDTH_DXA
      )
        break;
      sizePt--;
    }
    sizePt = Math.max(MIN_LYRIC_SIZE_PT, sizePt);
  }

  if (sizePt < baseSizePt) return sizePt * 2;
  return baseSizePt !== 18 ? baseSizePt * 2 : undefined;
}
