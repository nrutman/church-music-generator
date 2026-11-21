import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { extractPageLines, formatPageBreakWarnings, mergeBinder, prepareSong } from '../pdf';

const directories: string[] = [];

async function pdfWithPages(filePath: string, count: number) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < count; index += 1) pdf.addPage([612, 792]);
  fs.writeFileSync(filePath, await pdf.save());
}

afterEach(() => {
  directories
    .splice(0)
    .forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('binder PDF merge', () => {
  it('inserts blanks before two-page songs according to the layout plan', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'binder-pdf-test-'));
    directories.push(directory);
    const first = path.join(directory, 'first.pdf');
    const second = path.join(directory, 'second.pdf');
    const output = path.join(directory, 'binder.pdf');
    await pdfWithPages(first, 2);
    await pdfWithPages(second, 1);

    const placements = await mergeBinder(
      [
        {
          sourcePath: 'first.docx',
          pdfPath: first,
          rawPages: 2,
          pages: 2,
          trimmed: 0,
          suspiciousPageBreaks: [],
        },
        {
          sourcePath: 'second.docx',
          pdfPath: second,
          rawPages: 1,
          pages: 1,
          trimmed: 0,
          suspiciousPageBreaks: [],
        },
      ],
      output,
    );

    expect((await PDFDocument.load(fs.readFileSync(output))).getPageCount()).toBe(4);
    expect(placements.map(({ binderStart, binderEnd }) => [binderStart, binderEnd])).toEqual([
      [2, 3],
      [4, 4],
    ]);
  });
});

describe('split-section reporting', () => {
  it('detects an orphaned lyric through PDF extraction and preserves it in the binder', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'binder-split-test-'));
    directories.push(directory);
    const source = path.join(directory, 'song.pdf');
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const line of ['BRIDGE From generation to generation', 'Until the day You return']) {
      pdf.addPage([612, 792]).drawText(line, { x: 72, y: 700, size: 12, font });
    }
    fs.writeFileSync(source, await pdf.save());
    const prepared = await prepareSong('song.doc', source);
    const placements = await mergeBinder([prepared], path.join(directory, 'binder.pdf'));
    expect(placements[0]).toMatchObject({
      pages: 2,
      suspiciousPageBreaks: [{ page: 2, firstLine: 'Until the day You return' }],
    });
    expect(extractPageLines(path.join(directory, 'binder.pdf'), 3)).toContain(
      'Until the day You return',
    );
  });

  it.each(['song.doc', 'song.docx', 'song.pdf'])(
    'reports actionable page references for %s',
    (sourcePath) => {
      const warnings = formatPageBreakWarnings({
        sourcePath,
        pdfPath: 'song.pdf',
        rawPages: 2,
        pages: 2,
        trimmed: 0,
        binderStart: 4,
        binderEnd: 5,
        blankBefore: false,
        suspiciousPageBreaks: [{ page: 2, firstLine: 'Until the day You return' }],
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('POSSIBLE_SPLIT_SECTION');
      expect(warnings[0]).toContain('source page 2 (binder page 5)');
      expect(warnings[0]).toContain('Until the day You return');
      expect(warnings[0]).toContain(
        sourcePath.endsWith('.pdf') ? 'Review this PDF' : 'Export this song to PDF in Word',
      );
    },
  );
});
