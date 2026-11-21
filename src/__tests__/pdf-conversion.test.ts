import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfConversionSession } from '../pdf-conversion';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});
const run = vi.mocked(execFileSync);
const platform = process.platform;
let directory: string;
let bytes: Uint8Array;
let running: boolean;
let failExport: boolean;
let failCleanup: boolean;
let staged: string;

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-conversion-test-'));
  fs.writeFileSync(path.join(directory, 'source.docx'), 'original');
  const pdf = await PDFDocument.create();
  pdf.addPage();
  bytes = await pdf.save();
  running = false;
  failExport = false;
  failCleanup = false;
  staged = '';
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  vi.stubEnv('PDF_ENGINE', 'auto');
  vi.mocked(fs.existsSync).mockImplementation((file) => {
    if (String(file).endsWith('Microsoft Word.app')) return true;
    try {
      fs.statSync(file);
      return true;
    } catch {
      return false;
    }
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  run.mockImplementation(((command: string, args: string[]) => {
    if (command === 'osascript') {
      if (args[1].startsWith('return application')) return String(running);
      if (args[1].includes('set inputFile')) {
        staged = args[2];
        if (failExport) throw new Error('Word export denied');
        fs.writeFileSync(args[4], bytes);
      } else {
        if (failCleanup) throw new Error('Word unresponsive');
      }
      return 'ok';
    }
    const input = args[args.length - 1];
    fs.writeFileSync(
      path.join(path.dirname(input), path.basename(input, path.extname(input)) + '.pdf'),
      bytes,
    );
    return '';
  }) as typeof execFileSync);
});

afterEach(() => {
  for (const [command, args] of run.mock.calls) {
    const input =
      command === 'osascript'
        ? String(args?.[1]).includes('set inputFile')
          ? String(args?.[2])
          : undefined
        : String(args?.[args.length - 1]);
    if (input) {
      fs.rmSync(input, { force: true });
      fs.rmSync(input.replace(/\.docx?$/i, '.pdf'), { force: true });
    }
  }
  fs.rmSync(directory, { recursive: true, force: true });
  Object.defineProperty(process, 'platform', { value: platform });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  run.mockReset();
});

async function convert(session: PdfConversionSession) {
  await session.convert(path.join(directory, 'source.docx'), path.join(directory, 'output.pdf'));
}

describe('PDF conversion session', () => {
  it.each([true, false])('preserves initial Word running state %s', async (alreadyRunning) => {
    running = alreadyRunning;
    const session = new PdfConversionSession('soffice');
    await convert(session);
    session.close();
    const cleanup = run.mock.calls.find(([, args]) =>
      String(args?.[1]).includes('repeat with documentName'),
    );
    expect(cleanup?.[1]?.[2]).toBe(alreadyRunning ? 'keep' : 'quit');
    const exportCall = run.mock.calls.find(([, args]) =>
      String(args?.[1]).includes('set inputFile'),
    );
    const stagingParent = path.resolve(__dirname, '../../generated/word-conversion');
    expect(path.dirname(String(exportCall?.[1]?.[2]))).toBe(stagingParent);
    expect(path.dirname(String(exportCall?.[1]?.[4]))).toBe(stagingParent);
    expect(fs.readFileSync(path.join(directory, 'source.docx'), 'utf8')).toBe('original');
    expect(fs.existsSync(staged)).toBe(false);
    expect(fs.existsSync(staged.replace(/\.docx?$/i, '.pdf'))).toBe(false);
    expect(
      (await PDFDocument.load(fs.readFileSync(path.join(directory, 'output.pdf')))).getPageCount(),
    ).toBe(1);
  });

  it('falls back once for the rest of the batch after Word export fails', async () => {
    failExport = true;
    const session = new PdfConversionSession('soffice');
    await convert(session);
    await convert(session);
    session.close();
    expect(
      run.mock.calls.filter(([, args]) => String(args?.[1]).includes('set inputFile')),
    ).toHaveLength(1);
    expect(run.mock.calls.filter(([cmd]) => cmd === 'soffice')).toHaveLength(2);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Word export failed'));
  });

  it('uses LibreOffice automatically on machines without Word', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const session = new PdfConversionSession('soffice');
    await convert(session);
    session.close();
    expect(run.mock.calls.map(([cmd]) => cmd)).toEqual(['soffice']);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Word unavailable'));
  });

  it('does not automate Word when LibreOffice is forced', async () => {
    vi.stubEnv('PDF_ENGINE', 'libreoffice');
    const session = new PdfConversionSession('soffice');
    await convert(session);
    session.close();
    expect(run.mock.calls.map(([cmd]) => cmd)).toEqual(['soffice']);
  });

  it('does not fall back when Word is explicitly required', async () => {
    vi.stubEnv('PDF_ENGINE', 'word');
    failExport = true;
    const session = new PdfConversionSession('soffice');
    await expect(convert(session)).rejects.toThrow('Word export denied');
    session.close();
    expect(run.mock.calls.some(([cmd]) => cmd === 'soffice')).toBe(false);
  });

  it('rejects strict Word mode on unsupported machines', async () => {
    vi.stubEnv('PDF_ENGINE', 'word');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const session = new PdfConversionSession('soffice');
    await expect(convert(session)).rejects.toThrow('Word is unavailable');
    session.close();
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects malformed output instead of copying it to the destination', async () => {
    vi.stubEnv('PDF_ENGINE', 'libreoffice');
    bytes = Buffer.from('invalid PDF');
    const session = new PdfConversionSession('soffice');
    await expect(convert(session)).rejects.toThrow();
    session.close();
    expect(fs.existsSync(path.join(directory, 'output.pdf'))).toBe(false);
  });

  it('retains staging when Word cleanup cannot complete', async () => {
    vi.stubEnv('PDF_ENGINE', 'word');
    const session = new PdfConversionSession('soffice');
    await convert(session);
    failCleanup = true;
    expect(() => session.close()).toThrow('staging retained');
    expect(fs.existsSync(staged.replace(/\.docx?$/i, '.pdf'))).toBe(true);
  });

  it('falls back and retains staging when both Word export and cleanup fail', async () => {
    failExport = true;
    failCleanup = true;
    const session = new PdfConversionSession('soffice');
    await convert(session);
    session.close();
    expect(run.mock.calls.some(([cmd]) => cmd === 'soffice')).toBe(true);
    expect(fs.existsSync(staged)).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('staging retained'));
  });

  it('does not start Word for an unused session', () => {
    new PdfConversionSession('soffice').close();
    expect(run).not.toHaveBeenCalled();
  });

  it('removes only its own run files from the shared staging folder', async () => {
    vi.stubEnv('PDF_ENGINE', 'libreoffice');
    const first = new PdfConversionSession('soffice');
    const second = new PdfConversionSession('soffice');
    await convert(first);
    await convert(second);
    const inputs = run.mock.calls
      .filter(([command]) => command === 'soffice')
      .map(([, args]) => String(args?.[args.length - 1]));
    first.close();
    expect(fs.existsSync(inputs[0].replace(/\.docx?$/i, '.pdf'))).toBe(false);
    expect(fs.existsSync(inputs[1].replace(/\.docx?$/i, '.pdf'))).toBe(true);
    expect(fs.existsSync(path.dirname(inputs[0]))).toBe(true);
    second.close();
  });

  it('rejects unknown engine settings', () => {
    vi.stubEnv('PDF_ENGINE', 'other');
    expect(() => new PdfConversionSession('soffice')).toThrow('Invalid PDF_ENGINE');
  });
});
