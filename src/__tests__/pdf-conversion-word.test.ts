import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfConversionSession } from '../pdf-conversion';

function wordState(): string {
  return execFileSync(
    'osascript',
    [
      '-e',
      `if application "Microsoft Word" is running then
    tell application "Microsoft Word" to return name of every document
  else
    return "__CLOSED__"
  end if`,
    ],
    { encoding: 'utf8', timeout: 20_000 },
  ).trim();
}

afterEach(() => vi.unstubAllEnvs());

describe.skipIf(
  process.platform !== 'darwin' ||
    process.env.RUN_WORD_E2E !== '1' ||
    Boolean(process.env.CI) ||
    !(
      fs.existsSync('/Applications/Microsoft Word.app') ||
      fs.existsSync(path.join(os.homedir(), 'Applications/Microsoft Word.app'))
    ),
)('native Word PDF conversion', () => {
  it('exports a fixture without changing the source or pre-existing Word documents', async () => {
    const initial = wordState();
    const source = path.resolve(
      __dirname,
      '../binder/__tests__/fixtures/02-response-one-page.docx',
    );
    const original = fs.readFileSync(source);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'word-conversion-e2e-'));
    vi.stubEnv('PDF_ENGINE', 'word');
    const session = new PdfConversionSession();
    try {
      const output = path.join(directory, 'chart.pdf');
      try {
        await session.convert(source, output);
      } finally {
        session.close();
      }
      expect((await PDFDocument.load(fs.readFileSync(output))).getPageCount()).toBe(1);
      expect(fs.readFileSync(source)).toEqual(original);
      expect(wordState()).toBe(initial);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 180_000);
});
