import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  effectivePageCount,
  findSuspiciousPageBreaks,
  planBinderLayout,
  SuspiciousPageBreak,
} from './layout';

export interface PreparedSong {
  sourcePath: string;
  pdfPath: string;
  rawPages: number;
  pages: number;
  trimmed: number;
  suspiciousPageBreaks: SuspiciousPageBreak[];
}

export interface SongPlacement extends PreparedSong {
  binderStart: number;
  binderEnd: number;
  blankBefore: boolean;
}

export function extractPageLines(pdfPath: string, pageNumber: number): string[] {
  const text = execFileSync(
    'pdftotext',
    ['-f', String(pageNumber), '-l', String(pageNumber), '-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  );
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function prepareSong(sourcePath: string, pdfPath: string): Promise<PreparedSong> {
  const pdf = await PDFDocument.load(fs.readFileSync(pdfPath));
  const rawPages = pdf.getPageCount();
  const pageLines = Array.from({ length: rawPages }, (_, index) =>
    extractPageLines(pdfPath, index + 1),
  );
  const { effectivePages: pages, trimmed } = effectivePageCount(pageLines);
  if (pages < 1) throw new BinderPageCountError(sourcePath, pages);
  if (pages > 2) throw new BinderPageCountError(sourcePath, pages);
  return {
    sourcePath,
    pdfPath,
    rawPages,
    pages,
    trimmed,
    suspiciousPageBreaks: findSuspiciousPageBreaks(pageLines.slice(0, pages)),
  };
}

/** Formats advisory split-section warnings with source and binder page numbers. */
export function formatPageBreakWarnings(song: SongPlacement): string[] {
  return song.suspiciousPageBreaks.map(({ page, firstLine }) => {
    const advice = /\.docx?$/i.test(song.sourcePath)
      ? 'Review the source pagination in Word and keep each unit together. Export this song to PDF in Word after correcting its layout and rebuild using that reviewed PDF.'
      : 'Review this PDF in its source application and supply a corrected PDF if needed.';
    return `⚠ POSSIBLE_SPLIT_SECTION: ${path.basename(song.sourcePath)}: source page ${page} (binder page ${song.binderStart + page - 1}) starts with ${JSON.stringify(firstLine)} instead of a recognized section label. Keep each verse, chorus, or other unit on one page. ${advice}`;
  });
}

export class BinderPageCountError extends Error {
  constructor(
    public readonly sourcePath: string,
    public readonly pages: number,
  ) {
    super(`UNEXPECTED_PAGE_COUNT: ${path.basename(sourcePath)} produced ${pages} effective pages`);
  }
}

export async function mergeBinder(
  songs: PreparedSong[],
  outputPath: string,
): Promise<SongPlacement[]> {
  const output = await PDFDocument.create();
  const layout = planBinderLayout(songs.map(({ pages }) => pages));
  const placements: SongPlacement[] = [];
  for (let songIndex = 0; songIndex < songs.length; songIndex += 1) {
    const song = songs[songIndex];
    const source = await PDFDocument.load(fs.readFileSync(song.pdfPath));
    const entry = layout[songIndex];
    if (entry.blankBefore) {
      const firstPage = source.getPage(0);
      output.addPage([firstPage.getWidth(), firstPage.getHeight()]);
    }
    const copied = await output.copyPages(
      source,
      Array.from({ length: song.pages }, (_, i) => i),
    );
    copied.forEach((page) => output.addPage(page));
    placements.push({ ...song, ...entry });
  }
  fs.writeFileSync(outputPath, await output.save());
  return placements;
}
