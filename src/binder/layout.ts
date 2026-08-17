export interface LayoutEntry {
  blankBefore: boolean;
  binderStart: number;
  binderEnd: number;
}

export function planBinderLayout(pageCounts: number[]): LayoutEntry[] {
  let position = 1;
  return pageCounts.map((pages) => {
    if (pages !== 1 && pages !== 2) throw new Error(`Expected 1 or 2 pages, received ${pages}`);
    const blankBefore = pages === 2 && position % 2 === 1;
    if (blankBefore) position += 1;
    const binderStart = position;
    position += pages;
    return { blankBefore, binderStart, binderEnd: position - 1 };
  });
}

export function normalizePageLine(line: string): string {
  return line.toLocaleLowerCase().trim().replace(/\d+/g, '#').replace(/\s+/g, ' ');
}

function isChromeLine(line: string): boolean {
  const normalized = normalizePageLine(line);
  return (
    /\bpage # of #\b/.test(normalized) ||
    normalized.startsWith('providence church') ||
    /\bccli\s*#/.test(normalized) ||
    normalized.startsWith('©') ||
    normalized.includes('copyright') ||
    normalized.includes('words and music by')
  );
}

export function effectivePageCount(pageLines: string[][]) {
  if (pageLines.length <= 1) return { effectivePages: pageLines.length, trimmed: 0 };
  let trimmed = 0;
  for (let index = pageLines.length - 1; index > 0; index -= 1) {
    const prior = new Set(
      pageLines.slice(0, index).flatMap((lines) => lines.map(normalizePageLine).filter(Boolean)),
    );
    const normalized = pageLines[index].map(normalizePageLine).filter(Boolean);
    // Repetition alone is not enough: a repeated chorus may duplicate an
    // earlier page. Require every line to be recognizable document chrome.
    if (
      !normalized.length ||
      normalized.some((line) => !prior.has(line)) ||
      pageLines[index].some((line) => !isChromeLine(line))
    ) {
      break;
    }
    trimmed += 1;
  }
  return { effectivePages: pageLines.length - trimmed, trimmed };
}
