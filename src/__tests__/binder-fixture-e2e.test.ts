import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildBinder } from '../binder/build';
import { resolveSoffice } from '../binder/config';

const fixtureDirectory = path.join(__dirname, 'fixtures', 'binder');

const hasBinderDependencies = (() => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
    execFileSync(resolveSoffice(process.env.SOFFICE_PATH), ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasBinderDependencies)('binder fixture E2E', () => {
  it('builds the stored setlist in order with both required blank pages', async () => {
    const outputDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'binder-fixture-e2e-'));
    try {
      const sourcePaths = [
        '01-opening-two-pages.docx',
        '02-response-one-page.docx',
        '03-closing-two-pages.docx',
      ].map((name) => path.join(fixtureDirectory, name));

      const result = await buildBinder(sourcePaths, 'Fixture Setlist', {
        outputDirectory,
        sofficePath: resolveSoffice(process.env.SOFFICE_PATH),
      });

      expect(
        result.placements.map(({ blankBefore, binderStart, binderEnd, pages }) => ({
          blankBefore,
          binderStart,
          binderEnd,
          pages,
        })),
      ).toEqual([
        { blankBefore: true, binderStart: 2, binderEnd: 3, pages: 2 },
        { blankBefore: false, binderStart: 4, binderEnd: 4, pages: 1 },
        { blankBefore: true, binderStart: 6, binderEnd: 7, pages: 2 },
      ]);

      const binder = await PDFDocument.load(fs.readFileSync(result.outputPath));
      expect(binder.getPageCount()).toBe(7);

      const text = execFileSync('pdftotext', ['-layout', result.outputPath, '-'], {
        encoding: 'utf8',
      });
      expect(text.indexOf('OPENING SONG')).toBeLessThan(text.indexOf('RESPONSE SONG'));
      expect(text.indexOf('RESPONSE SONG')).toBeLessThan(text.indexOf('CLOSING SONG'));
    } finally {
      fs.rmSync(outputDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});
