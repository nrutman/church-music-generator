import { Section, LinesSection, SheetMode, LayoutItem, PagePlan } from './types';

export const LINE_HEIGHTS = {
  title: 36,
  lyric: 22,
  chord: 14,
  chords1st: 14,
  empty: 22,
  sectionLabel: 22,
};

export const GAP_HEIGHTS = {
  standard: 28, // single gap line at 28pt
  reduced: 18, // single gap line at 18pt
};

export const PAGE_HEIGHT = 670;

function lyricHeight(lyricSizePt?: number): number {
  if (!lyricSizePt || lyricSizePt === 18) return LINE_HEIGHTS.lyric;
  return Math.round(lyricSizePt * (LINE_HEIGHTS.lyric / 18));
}

function isLinesSection(section: Section): section is LinesSection {
  return 'lines' in section;
}

export function estimateSectionHeight(
  section: Section,
  mode: SheetMode,
  lyricSizePt?: number,
): number {
  const lh = lyricHeight(lyricSizePt);
  let h = 0;
  if (mode === 'chord') {
    if (!isLinesSection(section)) {
      h += LINE_HEIGHTS.chords1st;
      if (section.chords.length > 1) h += (section.chords.length - 1) * LINE_HEIGHTS.chord;
    } else if (section.lyricsOnly) {
      h += LINE_HEIGHTS.sectionLabel;
      h += (section.lines.length - 1) * lh;
    } else {
      h += LINE_HEIGHTS.chords1st;
      h += section.lines[0] ? lh : 0;
      for (let i = 1; i < section.lines.length; i++) {
        h += LINE_HEIGHTS.chord + lh;
      }
    }
  } else {
    if (!isLinesSection(section)) return 0;
    h += LINE_HEIGHTS.sectionLabel;
    h += (section.lines.length - 1) * lh;
  }
  return h;
}

/** Filter out sections marked with lyricHide for lyric sheet generation. */
export function filterForLyricSheet(sections: Section[]): Section[] {
  return sections.filter((s) => !('lyricHide' in s && s.lyricHide));
}

export function planPages(
  sections: Section[],
  mode: SheetMode,
  lyricSizePt?: number,
  maxPages?: number,
): PagePlan {
  const pageLimit = maxPages ?? 2;
  const gapSize = GAP_HEIGHTS.standard;
  const titleBlock = LINE_HEIGHTS.empty + LINE_HEIGHTS.title + LINE_HEIGHTS.empty;
  const pageTopPadding = 2 * LINE_HEIGHTS.empty;

  const items: LayoutItem[] = [];
  for (const sec of sections) {
    const h = estimateSectionHeight(sec, mode, lyricSizePt);
    if (h > 0) items.push({ section: sec, height: h });
  }

  // First pass: try with standard gaps
  const result = tryLayout(items, pageLimit, gapSize, titleBlock, pageTopPadding);
  if (result) return { pages: result, reducedGaps: false };

  // Second pass: retry with reduced gaps uniformly
  const reducedResult = tryLayout(
    items,
    pageLimit,
    GAP_HEIGHTS.reduced,
    titleBlock,
    pageTopPadding,
  );
  if (reducedResult) return { pages: reducedResult, reducedGaps: true };

  // Still doesn't fit — force it with standard gaps and warn
  console.warn(`WARNING: Content may overflow ${pageLimit} pages in ${mode} sheet`);
  const forced = tryLayout(items, pageLimit, gapSize, titleBlock, pageTopPadding, true);
  return { pages: forced!, reducedGaps: false };
}

function tryLayout(
  items: LayoutItem[],
  pageLimit: number,
  gapSize: number,
  titleBlock: number,
  pageTopPadding: number,
  force?: boolean,
): LayoutItem[][] | null {
  const pages: LayoutItem[][] = [[]];
  let currentHeight = titleBlock;
  let isFirstOnPage = true;

  for (const item of items) {
    const gapBefore = isFirstOnPage ? 0 : gapSize;
    const needed = gapBefore + item.height;

    if (currentHeight + needed <= PAGE_HEIGHT) {
      pages[pages.length - 1].push(item);
      currentHeight += needed;
      isFirstOnPage = false;
    } else if (pages.length < pageLimit) {
      pages.push([item]);
      currentHeight = pageTopPadding + item.height;
      isFirstOnPage = false;
    } else if (force) {
      pages[pages.length - 1].push(item);
      currentHeight += needed;
      isFirstOnPage = false;
    } else {
      return null; // doesn't fit
    }
  }

  return pages;
}
