import { textWidth } from './font-metrics';

// Page text width: 8.5" - 2×1" margins = 6.5" = 468pt
const PAGE_TEXT_WIDTH_PT = 468;
const TITLE_SIZE_PT = 24;
// Minimum sizes when shrinking to fit title on one line
const CAPO_MIN_SIZE_PT = 14;
const TITLE_MIN_SIZE_PT = 18;

export type TitleSizing =
  | { strategy: 'single'; sizePt: number }
  | { strategy: 'split'; titleSizePt: number; capoSizePt: number };

/**
 * Determine the font sizes needed to fit a title with an optional capo suffix
 * on a single line. Returns sizing info without creating any docx objects.
 *
 * Strategies (in priority order):
 * 1. Full size (24pt) if it fits
 * 2. Shrink just the capo suffix (down to 14pt)
 * 3. Shrink the whole title (down to 18pt)
 */
export function fitTitle(title: string, capoSuffix?: string): TitleSizing {
  if (!capoSuffix) {
    return { strategy: 'single', sizePt: TITLE_SIZE_PT };
  }

  const titleUpper = title.toUpperCase();
  const suffixUpper = ` ${capoSuffix.toUpperCase()}`;
  const fullUpper = titleUpper + suffixUpper;

  // Check if it fits at full size
  if (textWidth(fullUpper, TITLE_SIZE_PT, 'bold') <= PAGE_TEXT_WIDTH_PT) {
    return { strategy: 'single', sizePt: TITLE_SIZE_PT };
  }

  // Strategy 1: Shrink just the capo suffix
  for (let capoSize = TITLE_SIZE_PT - 2; capoSize >= CAPO_MIN_SIZE_PT; capoSize -= 2) {
    const mainW = textWidth(titleUpper + ' ', TITLE_SIZE_PT, 'bold');
    const suffixW = textWidth(capoSuffix.toUpperCase(), capoSize, 'bold');
    if (mainW + suffixW <= PAGE_TEXT_WIDTH_PT) {
      return { strategy: 'split', titleSizePt: TITLE_SIZE_PT, capoSizePt: capoSize };
    }
  }

  // Strategy 2: Shrink the whole title
  for (let titleSize = TITLE_SIZE_PT - 2; titleSize >= TITLE_MIN_SIZE_PT; titleSize -= 2) {
    if (textWidth(fullUpper, titleSize, 'bold') <= PAGE_TEXT_WIDTH_PT) {
      return { strategy: 'single', sizePt: titleSize };
    }
  }

  // Fallback: use minimum size
  return { strategy: 'single', sizePt: TITLE_MIN_SIZE_PT };
}
