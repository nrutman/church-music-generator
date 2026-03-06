import { Section, LinesSection, SheetMode, LayoutItem } from './types';

export const LINE_HEIGHTS = {
  title: 36,
  lyric: 22,
  chord: 14,
  chords1st: 14,
  empty: 22,
  sectionLabel: 22,
};

export const PAGE_HEIGHT = 670;

function isLinesSection(section: Section): section is LinesSection {
  return 'lines' in section;
}

export function estimateSectionHeight(section: Section, mode: SheetMode): number {
  let h = 0;
  if (mode === 'chord') {
    if (!isLinesSection(section)) {
      h += LINE_HEIGHTS.chords1st;
      if (section.chords.length > 1) h += (section.chords.length - 1) * LINE_HEIGHTS.chord;
    } else {
      h += LINE_HEIGHTS.chords1st;
      h += section.lines[0] ? LINE_HEIGHTS.lyric : 0;
      for (let i = 1; i < section.lines.length; i++) {
        h += LINE_HEIGHTS.chord + LINE_HEIGHTS.lyric;
      }
    }
  } else {
    if (!isLinesSection(section)) return 0;
    h += LINE_HEIGHTS.sectionLabel;
    h += (section.lines.length - 1) * LINE_HEIGHTS.lyric;
  }
  return h;
}

export function planPages(sections: Section[], mode: SheetMode): LayoutItem[][] {
  const gapSize = mode === 'chord' ? 2 * LINE_HEIGHTS.empty : LINE_HEIGHTS.empty;
  const titleBlock = LINE_HEIGHTS.empty + LINE_HEIGHTS.title + LINE_HEIGHTS.empty;
  const pageTopPadding = 2 * LINE_HEIGHTS.empty;

  const items: LayoutItem[] = [];
  for (const sec of sections) {
    const h = estimateSectionHeight(sec, mode);
    if (h > 0) items.push({ section: sec, height: h });
  }

  const pages: LayoutItem[][] = [[]];
  let currentHeight = titleBlock;
  let isFirstOnPage = true;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const gapBefore = isFirstOnPage ? 0 : gapSize;
    const needed = gapBefore + item.height;

    if (currentHeight + needed <= PAGE_HEIGHT) {
      pages[pages.length - 1].push(item);
      currentHeight += needed;
      isFirstOnPage = false;
    } else if (pages.length < 2) {
      pages.push([item]);
      currentHeight = pageTopPadding + item.height;
      isFirstOnPage = false;
    } else {
      const reducedGap = LINE_HEIGHTS.empty;
      const reducedNeeded = (isFirstOnPage ? 0 : reducedGap) + item.height;
      if (currentHeight + reducedNeeded <= PAGE_HEIGHT) {
        item.reducedGap = true;
        pages[pages.length - 1].push(item);
        currentHeight += reducedNeeded;
        isFirstOnPage = false;
      } else {
        console.warn(`WARNING: Content may overflow 2 pages in ${mode} sheet`);
        pages[pages.length - 1].push(item);
        currentHeight += needed;
        isFirstOnPage = false;
      }
    }
  }

  return pages;
}
