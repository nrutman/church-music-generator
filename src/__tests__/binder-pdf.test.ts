import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it } from 'vitest';
import { mergeBinder } from '../binder/pdf';

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
        { sourcePath: 'first.docx', pdfPath: first, rawPages: 2, pages: 2, trimmed: 0 },
        { sourcePath: 'second.docx', pdfPath: second, rawPages: 1, pages: 1, trimmed: 0 },
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
