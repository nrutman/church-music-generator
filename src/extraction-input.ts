import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExtractionMode, formatReport, Word } from './extraction';

function decodeXml(text: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (_match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number(entity.slice(1)));
    if (!(entity in entities)) throw new Error(`Unknown XML entity: ${entity}`);
    return entities[entity];
  });
}

/** Parses the page/word elements emitted by pdftotext -bbox. */
export function parseBbox(xml: string): Word[] {
  if (!/<html\b/.test(xml) || !/<\/html>/.test(xml))
    throw new Error('Invalid pdftotext bbox document');
  const words: Word[] = [];
  let index = 0;
  for (const page of xml.matchAll(/<page\b([^>]*)>([\s\S]*?)<\/page>/g)) {
    const attrs = Object.fromEntries(
      Array.from(page[1].matchAll(/(\w+)="([^"]*)"/g), (m) => [m[1], m[2]]),
    );
    // Preserve the Python page-index offset, including mixed page heights.
    const offset = index++ * Number(attrs.height ?? 1000);
    for (const match of page[2].matchAll(/<word\b([^>]*?)(?:\/>|>([\s\S]*?)<\/word>)/g)) {
      const a = Object.fromEntries(
        Array.from(match[1].matchAll(/(\w+)="([^"]*)"/g), (m) => [m[1], m[2]]),
      );
      const word = {
        text: decodeXml(match[2] ?? ''),
        xMin: Number(a.xMin ?? 0),
        yMin: Number(a.yMin ?? 0) + offset,
        xMax: Number(a.xMax ?? 0),
        yMax: Number(a.yMax ?? 0) + offset,
      };
      if (![word.xMin, word.yMin, word.xMax, word.yMax].every(Number.isFinite))
        throw new Error('Invalid bbox coordinates');
      words.push(word);
    }
  }
  return words;
}

/** Parses Tesseract word rows and returns the greatest word bottom coordinate. */
export function parseOcrTsv(tsv: string, offset = 0): { words: Word[]; height: number } {
  const words: Word[] = [];
  let height = 0;
  for (const line of tsv.trim().split('\n').slice(1)) {
    const p = line.split('\t');
    if (p.length < 12 || Number(p[0]) !== 5 || !p[11].trim()) continue;
    const [left, top, width, h] = p.slice(6, 10).map(Number);
    if (![left, top, width, h].every(Number.isFinite)) throw new Error('Invalid OCR coordinates');
    height = Math.max(height, top + h);
    words.push({
      text: p[11].trim(),
      xMin: left,
      yMin: top + offset,
      xMax: left + width,
      yMax: top + h + offset,
    });
  }
  return { words, height };
}

export function extractWords(pdfPath: string, mode: ExtractionMode = 'text'): Word[] {
  const options = { encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024 };
  if (mode === 'text')
    return parseBbox(execFileSync('pdftotext', ['-bbox', pdfPath, '-'], options));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-extract-'));
  try {
    execFileSync('pdftoppm', ['-r', '300', '-png', pdfPath, path.join(directory, 'page')], options);
    const files = fs
      .readdirSync(directory)
      .filter((f) => f.endsWith('.png'))
      .sort();
    const words: Word[] = [];
    let offset = 0;
    for (const file of files) {
      // Relative image paths avoid the macOS /tmp-path problem without placing
      // shared filenames in the project root or risking concurrent-run collisions.
      const tsv = execFileSync(
        'tesseract',
        [file, 'stdout', '--psm', '4', '-c', 'tessedit_create_tsv=1'],
        { ...options, cwd: directory },
      );
      const page = parseOcrTsv(tsv, offset);
      words.push(...page.words);
      offset += page.height + 100;
    }
    return words;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export function runExtractionCli(mode: ExtractionMode, args = process.argv.slice(2)): void {
  if (!args.length) {
    console.error(`Usage: pnpm extract-chords${mode === 'ocr' ? '-ocr' : ''} <path-to-source-pdf>`);
    process.exitCode = 1;
    return;
  }
  try {
    process.stdout.write(formatReport(extractWords(args[0], mode), mode));
  } catch (error) {
    console.error(
      `Error extracting chords: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
