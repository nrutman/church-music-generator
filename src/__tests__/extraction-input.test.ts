import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { extractWords, parseBbox, parseOcrTsv, runExtractionCli } from '../extraction-input';
import goldenInput from './fixtures/extraction-input-golden.json';

vi.mock('child_process', () => ({ execFileSync: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(execFileSync).mockReset();
  process.exitCode = 0;
});
const xml =
  '<html xmlns="http://www.w3.org/1999/xhtml"><body><doc><page height="800"><word xMin="10" yMin="20" xMax="30" yMax="40">A&amp;B&#x2019;&#233;</word></page><page height="600"><word xMin="1" yMin="2" xMax="3" yMax="4">Next</word></page></doc></body></html>';
const tsv =
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n1\t1\t0\t0\t0\t0\t0\t0\t600\t800\t-1\t\n5\t1\t1\t1\t1\t1\t10\t20\t30\t12\t95\tHello\n5\t1\t1\t1\t1\t2\t50\t20\t10\t12\t0\t   \n';
describe('extraction input', () => {
  it('rejects invalid numeric bbox data', () => {
    expect(() => parseBbox('<html><page><word xMin="bad">Hello</word></page></html>')).toThrow(
      'Invalid bbox coordinates',
    );
  });
  it('rejects unknown XML entities', () => {
    expect(() => parseBbox('<html><page><word>&unknown;</word></page></html>')).toThrow(
      'Unknown XML entity',
    );
  });
  it('rejects invalid numeric OCR data', () => {
    expect(() => parseOcrTsv(tsv.replace('\t10\t20\t30\t12\t95', '\tbad\t20\t30\t12\t95'))).toThrow(
      'Invalid OCR coordinates',
    );
  });
  it('cleans rendered images when Tesseract fails', () => {
    let directory = '';
    vi.mocked(execFileSync).mockImplementation((cmd, args) => {
      if (cmd === 'pdftoppm') {
        const prefix = String(args![args!.length - 1]);
        directory = prefix.replace(/\/page$/, '');
        fs.writeFileSync(prefix + '-1.png', '');
        return '';
      }
      throw new Error('OCR failed');
    });
    expect(() => extractWords('test.pdf', 'ocr')).toThrow('OCR failed');
    expect(fs.existsSync(directory)).toBe(false);
  });
  it('parses frozen Poppler XML exactly like Python', () => {
    expect(parseBbox(goldenInput.bbox)).toEqual(goldenInput.textWords);
  });
  it('parses frozen Tesseract pages exactly like Python', () => {
    let offset = 0;
    const words = goldenInput.tsvPages.flatMap((tsv) => {
      const page = parseOcrTsv(tsv, offset);
      offset += page.height + 100;
      return page.words;
    });
    expect(words).toEqual(goldenInput.ocrWords);
  });
  it('decodes XML entities and preserves Python mixed-page height offsets', () => {
    expect(parseBbox(xml)).toEqual([
      { text: 'A&B’é', xMin: 10, yMin: 20, xMax: 30, yMax: 40 },
      { text: 'Next', xMin: 1, yMin: 602, xMax: 3, yMax: 604 },
    ]);
  });
  it('accepts an empty bbox document', () =>
    expect(parseBbox('<html><body></body></html>')).toEqual([]));
  it('rejects malformed bbox output', () =>
    expect(() => parseBbox('not XML')).toThrow('Invalid pdftotext'));
  it('uses only OCR word rows and ignores blank words', () => {
    expect(parseOcrTsv(tsv, 100)).toEqual({
      words: [{ text: 'Hello', xMin: 10, yMin: 120, xMax: 40, yMax: 132 }],
      height: 32,
    });
  });
  it('passes PDF paths as arguments without shell interpretation', () => {
    const spy = vi.mocked(execFileSync).mockReturnValue(xml);
    expect(extractWords('a file; echo nope.pdf')).toHaveLength(2);
    expect(spy).toHaveBeenCalledWith(
      'pdftotext',
      ['-bbox', 'a file; echo nope.pdf', '-'],
      expect.any(Object),
    );
  });
  it('cleans temporary OCR files after a tool failure', () => {
    let directory = '';
    vi.mocked(execFileSync).mockImplementation((_cmd, args) => {
      directory = String(args![args!.length - 1]).replace(/\/page$/, '');
      throw new Error('render failed');
    });
    expect(() => extractWords('test.pdf', 'ocr')).toThrow('render failed');
    expect(fs.existsSync(directory)).toBe(false);
  });
  it('parses multiple OCR pages and cleans up after success', () => {
    let directory = '';
    const spy = vi.mocked(execFileSync).mockImplementation((cmd, args) => {
      if (cmd === 'pdftoppm') {
        const prefix = String(args![args!.length - 1]);
        directory = prefix.replace(/\/page$/, '');
        fs.writeFileSync(prefix + '-2.png', '');
        fs.writeFileSync(prefix + '-1.png', '');
        return '';
      }
      return tsv;
    });
    expect(extractWords('test.pdf', 'ocr').map((w) => w.yMin)).toEqual([20, 152]);
    expect(spy.mock.calls.slice(1).map((c) => c[1]![0])).toEqual(['page-1.png', 'page-2.png']);
    expect(fs.existsSync(directory)).toBe(false);
  });
  it('does not emit a partial success report when extraction fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('tool unavailable');
    });
    const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    runExtractionCli('text', ['missing.pdf']);
    expect(process.exitCode).toBe(1);
    expect(out).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('tool unavailable'));
  });
  it('reports usage without invoking external tools', () => {
    const spy = vi.mocked(execFileSync);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    runExtractionCli('ocr', []);
    expect(process.exitCode).toBe(1);
    expect(spy).not.toHaveBeenCalled();
  });
});
