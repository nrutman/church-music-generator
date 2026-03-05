#!/usr/bin/env node
//
// Usage: node verify.js <file.docx> [file2.docx ...]
//
// Verifies .docx files fit within 2 pages by counting paragraphs
// and estimating content height per page.
//

import * as fs from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { PAGE_HEIGHT } from './layout';

const LINE_HEIGHTS = {
  title: 36,
  bodyText: 22,
  bodyTextSmall: 18,
  chord: 14,
  empty: 22,
};

function verify(filePath: string): boolean {
  const name = path.basename(filePath);
  console.log(`\nVerifying: ${name}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
  try {
    execSync(`unzip -o -q "${filePath}" word/document.xml -d "${tmpDir}"`, { stdio: 'pipe' });
  } catch {
    console.error(`  ERROR: Could not extract ${filePath}`);
    return false;
  }

  const xml = fs.readFileSync(path.join(tmpDir, 'word', 'document.xml'), 'utf8');

  const parts = xml.split(/w:type="page"/);
  const pageCount = parts.length;

  let allOk = true;
  for (let p = 0; p < pageCount; p++) {
    const part = parts[p];

    const titleCount = (part.match(/pStyle w:val="Title"/g) || []).length;
    const bodyCount = (part.match(/pStyle w:val="BodyText"/g) || []).length;
    const chords1stCount = (part.match(/pStyle w:val="Chords1stLine"/g) || []).length;
    const chordsCount = (part.match(/pStyle w:val="Chords"/g) || []).length;
    const totalParas = (part.match(/<w:p[ >]/g) || []).length;

    const h =
      titleCount * LINE_HEIGHTS.title +
      bodyCount * LINE_HEIGHTS.bodyText +
      chords1stCount * LINE_HEIGHTS.chord +
      chordsCount * LINE_HEIGHTS.chord;

    const status = h <= PAGE_HEIGHT ? 'OK' : `OVERFLOW by ${h - PAGE_HEIGHT}pt`;
    const pageLabel = `Page ${p + 1}`;
    console.log(
      `  ${pageLabel}: ~${h}pt / ${PAGE_HEIGHT}pt [${status}] ` +
        `(${totalParas} paras: ${titleCount} title, ${bodyCount} body, ` +
        `${chords1stCount + chordsCount} chord)`,
    );

    if (h > PAGE_HEIGHT) allOk = false;
  }

  if (pageCount > 2) {
    console.log(`  FAIL: ${pageCount} pages detected (max 2)`);
    allOk = false;
  } else {
    console.log(`  Pages: ${pageCount} ✓`);
  }

  execSync(`rm -rf "${tmpDir}"`);

  return allOk;
}

// Main
const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node verify.js <file.docx> [file2.docx ...]');
  process.exit(1);
}

let allOk = true;
for (const f of files) {
  if (!verify(f)) allOk = false;
}

console.log(allOk ? '\nAll checks passed.' : '\nSome checks FAILED.');
process.exit(allOk ? 0 : 1);
