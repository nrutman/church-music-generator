import * as fs from 'fs';
import * as path from 'path';

export interface FileMatch {
  filePath: string;
  score: number;
}

export interface MatchResult {
  query: string;
  candidates: FileMatch[];
  suggestions: FileMatch[];
}

export function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\.(doc|docx)$/i, '')
    .replace(/[^\p{L}\p{N}_\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function longestMatch(
  a: string,
  b: string,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) {
  let bestA = aStart;
  let bestB = bStart;
  let bestSize = 0;
  let previous = new Map<number, number>();
  for (let i = aStart; i < aEnd; i += 1) {
    const current = new Map<number, number>();
    for (let j = bStart; j < bEnd; j += 1) {
      if (a[i] !== b[j]) continue;
      const size = (previous.get(j - 1) ?? 0) + 1;
      current.set(j, size);
      if (size > bestSize) {
        bestA = i - size + 1;
        bestB = j - size + 1;
        bestSize = size;
      }
    }
    previous = current;
  }
  return { a: bestA, b: bestB, size: bestSize };
}

/** Ratcliff/Obershelp ratio used by Python's SequenceMatcher for short strings. */
export function sequenceRatio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const matches: Array<{ a: number; b: number; size: number }> = [];
  const pending = [{ aStart: 0, aEnd: a.length, bStart: 0, bEnd: b.length }];
  while (pending.length) {
    const range = pending.pop()!;
    const match = longestMatch(a, b, range.aStart, range.aEnd, range.bStart, range.bEnd);
    if (!match.size) continue;
    matches.push(match);
    if (range.aStart < match.a && range.bStart < match.b) {
      pending.push({ aStart: range.aStart, aEnd: match.a, bStart: range.bStart, bEnd: match.b });
    }
    if (match.a + match.size < range.aEnd && match.b + match.size < range.bEnd) {
      pending.push({
        aStart: match.a + match.size,
        aEnd: range.aEnd,
        bStart: match.b + match.size,
        bEnd: range.bEnd,
      });
    }
  }
  return (2 * matches.reduce((total, match) => total + match.size, 0)) / (a.length + b.length);
}

export function scoreFilename(query: string, fileName: string): number {
  const normalizedQuery = normalize(query);
  const normalizedFull = normalize(fileName);
  const normalizedWithoutParentheticals = normalize(fileName.replace(/\([^)]*\)/g, ''));
  return Math.max(
    sequenceRatio(normalizedQuery, normalizedFull),
    normalizedWithoutParentheticals === normalizedFull
      ? 0
      : sequenceRatio(normalizedQuery, normalizedWithoutParentheticals),
    normalizedQuery && normalizedFull.includes(normalizedQuery) ? 0.9 : 0,
  );
}

export function findChordSheetFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...findChordSheetFiles(fullPath));
    else if (!entry.name.startsWith('~$') && /\.docx?$/i.test(entry.name)) files.push(fullPath);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function matchTitle(query: string, files: string[], threshold = 0.75): MatchResult {
  const scored = files
    .map((filePath) => ({ filePath, score: scoreFilename(query, path.basename(filePath)) }))
    .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath));
  return {
    query,
    candidates: scored.filter(({ score }) => score >= threshold),
    suggestions: scored.filter(({ score }) => score < threshold).slice(0, 3),
  };
}
