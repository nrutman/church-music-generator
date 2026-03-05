#!/usr/bin/env node
//
// Usage: node generate.js songs/song-name.json
//
// Reads a song JSON file and generates both:
//   ../generated/Song Name - Chord.docx
//   ../generated/Song Name - Lyric.docx
//

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  AlignmentType,
  TabStopType,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import { Song, Section, LinesSection } from './types';
import { planPages } from './layout';
import { alignChordToLyric } from './chord-align';

// ---------------------------------------------------------------------------
// Read song data
// ---------------------------------------------------------------------------
const songFile = process.argv[2];
if (!songFile) {
  console.error('Usage: node generate.js songs/song-name.json');
  process.exit(1);
}
const song: Song = JSON.parse(fs.readFileSync(songFile, 'utf8'));
const outDir = path.resolve(__dirname, '..', 'generated');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function makeHeader(): Header {
  const today = new Date();
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const dateStr = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
  return new Header({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: 4320 },
          { type: TabStopType.RIGHT, position: 8640 },
        ],
        children: [
          new TextRun({
            text: `Providence Church (Updated ${dateStr})`,
            font: 'Arial',
            size: 16,
          }),
          new TextRun({ text: '\t' }),
          new TextRun({ text: '\tPage ', font: 'Arial', size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 16 }),
          new TextRun({ text: ' of ', font: 'Arial', size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 16 }),
        ],
      }),
    ],
  });
}

/**
 * Split text into balanced lines, preferring breaks at entity boundaries
 * to avoid splitting names or company names mid-line.
 *
 * Hierarchy: first split at ", " (between entity groups), then split
 * long segments further at " – " or " / " (within groups).
 */
function wrapBalanced(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  // Split at commas first (highest-level entity boundary)
  const segments = splitAtDelimiters(text, [', ']);

  // If any segment is still too long, split further at " – " or " / "
  const lines: string[] = [];
  for (const seg of segments) {
    if (seg.length <= maxChars) {
      lines.push(seg);
    } else {
      lines.push(...splitAtDelimiters(seg, [' – ', ' - ', ' / ']));
    }
  }
  return lines;
}

function splitAtDelimiters(text: string, delimiters: string[]): string[] {
  // Find all break points
  const breakPoints: number[] = [];
  for (let i = 0; i < text.length; i++) {
    for (const d of delimiters) {
      if (text.slice(i, i + d.length) === d) {
        breakPoints.push(i + d.length);
        break;
      }
    }
  }
  if (breakPoints.length === 0) return [text];

  // Pick the break point closest to the midpoint for balanced halves
  const mid = text.length / 2;
  let bestBp = breakPoints[0];
  let bestDiff = Infinity;
  for (const bp of breakPoints) {
    const diff = Math.abs(bp - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBp = bp;
    }
  }
  return [text.slice(0, bestBp).trimEnd(), text.slice(bestBp).trimStart()];
}

function makeFooter(): Footer {
  // Title + composers: always break between title credit and composer names
  const titleCredit = `${song.title.toUpperCase()} Words and Music by`;
  const titleLines =
    `${titleCredit} ${song.composers}`.length <= 70
      ? [`${titleCredit} ${song.composers}`]
      : [titleCredit, song.composers];
  // Copyright: break at entity boundaries — 88 chars fits 10pt Arial in 6.5" width
  const copyrightLines = wrapBalanced(song.copyright, 88);

  const titleRuns: TextRun[] = [];
  for (let i = 0; i < titleLines.length; i++) {
    if (i > 0)
      titleRuns.push(new TextRun({ break: 1, text: titleLines[i], font: 'Arial', size: 20 }));
    else titleRuns.push(new TextRun({ text: titleLines[i], font: 'Arial', size: 20 }));
  }

  const copyrightRuns: TextRun[] = [];
  for (let i = 0; i < copyrightLines.length; i++) {
    if (i > 0)
      copyrightRuns.push(
        new TextRun({ break: 1, text: copyrightLines[i], font: 'Arial', size: 20 }),
      );
    else copyrightRuns.push(new TextRun({ text: copyrightLines[i], font: 'Arial', size: 20 }));
  }
  copyrightRuns.push(new TextRun({ break: 1, text: 'CCLI #1210714', font: 'Arial', size: 20 }));

  return new Footer({
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: titleRuns }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: copyrightRuns }),
    ],
  });
}

function pageProps() {
  return {
    page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 720, right: 1440, bottom: 720, left: 1440 },
    },
  };
}

// Chord sheet styles
const chordStyles = [
  {
    id: 'Title',
    name: 'Title',
    basedOn: 'Normal',
    next: 'Normal',
    quickFormat: true,
    paragraph: { alignment: AlignmentType.CENTER },
    run: { font: 'Arial', bold: true, allCaps: true, size: 48 },
  },
  {
    id: 'BodyText',
    name: 'Body Text',
    basedOn: 'Normal',
    next: 'Normal',
    paragraph: { indent: { left: 720, firstLine: 720 } },
    run: { font: 'Arial', bold: true, size: 36 },
  },
  {
    id: 'Chords1stLine',
    name: 'Chords - 1st Line',
    basedOn: 'Normal',
    next: 'Normal',
    run: { font: 'Arial', italics: true, size: 20 },
  },
  {
    id: 'Chords',
    name: 'Chords',
    basedOn: 'Normal',
    next: 'Normal',
    paragraph: { indent: { left: 1440 } },
    run: { font: 'Arial', italics: true, size: 20 },
  },
];

// ---------------------------------------------------------------------------
// Paragraph builders
// ---------------------------------------------------------------------------

function chords1stLine(label: string, chordStr?: string): Paragraph {
  const children = [
    new TextRun({
      text: label.toUpperCase(),
      bold: true,
      italics: false,
      allCaps: true,
      size: 24,
      font: 'Arial',
    }),
  ];
  if (chordStr) {
    children.push(new TextRun({ text: '\t' + chordStr, font: 'Arial' }));
  }
  return new Paragraph({
    style: 'Chords1stLine',
    tabStops: [{ type: TabStopType.LEFT, position: 1440 }],
    children,
  });
}

function chordsLine(chordStr: string): Paragraph {
  return new Paragraph({
    style: 'Chords',
    children: [new TextRun({ text: chordStr, font: 'Arial' })],
  });
}

function lyricLine(text: string, sizeHalfPts?: number): Paragraph {
  const run: { text: string; font: string; size?: number } = { text, font: 'Arial' };
  if (sizeHalfPts) run.size = sizeHalfPts;
  return new Paragraph({ style: 'BodyText', children: [new TextRun(run)] });
}

function lyricSectionStart(label: string, firstLyric: string): Paragraph {
  return new Paragraph({
    style: 'BodyText',
    indent: { left: 0, firstLine: 0 },
    children: [
      new TextRun({ text: label.toUpperCase(), allCaps: true, size: 24, font: 'Arial' }),
      new TextRun({ text: '\t' + firstLyric, font: 'Arial' }),
    ],
  });
}

function emptyLine(): Paragraph {
  return new Paragraph({
    style: 'BodyText',
    indent: { left: 0, firstLine: 0 },
    children: [],
  });
}

// ---------------------------------------------------------------------------
// Section label helper
// ---------------------------------------------------------------------------
function sectionLabel(section: Section): string {
  if (section.type === 'intro') return 'Intro';
  if (section.type === 'chorus') return 'Chorus';
  if (section.type === 'bridge') return 'Bridge';
  return `Verse ${section.number}`;
}

// ---------------------------------------------------------------------------
// Chord sheet builder
// ---------------------------------------------------------------------------
function buildChordSection(section: Section): Paragraph[] {
  const paras: Paragraph[] = [];
  if (section.type === 'intro') {
    paras.push(chords1stLine('Intro', section.chords[0]));
    for (let i = 1; i < section.chords.length; i++) {
      paras.push(chordsLine(section.chords[i]));
    }
  } else {
    const label = sectionLabel(section);
    const aligned0 = alignChordToLyric(section.lines[0].chords, section.lines[0].lyrics);
    paras.push(chords1stLine(label, aligned0));
    paras.push(lyricLine(section.lines[0].lyrics));
    for (let i = 1; i < section.lines.length; i++) {
      const aligned = alignChordToLyric(section.lines[i].chords, section.lines[i].lyrics);
      paras.push(chordsLine(aligned));
      paras.push(lyricLine(section.lines[i].lyrics));
    }
  }
  return paras;
}

function generateChordSheet(): Document {
  const pages = planPages(song.sections, 'chord');

  for (let p = 0; p < pages.length; p++) {
    const names = pages[p].map((it) => sectionLabel(it.section));
    console.log(`  Chord page ${p + 1}: ${names.join(' + ')}`);
  }

  const allChildren: Paragraph[] = [];

  allChildren.push(new Paragraph({ style: 'BodyText', children: [] }));
  allChildren.push(new Paragraph({ style: 'Title', children: [new TextRun(song.title)] }));
  allChildren.push(new Paragraph({ style: 'BodyText', children: [] }));

  for (let p = 0; p < pages.length; p++) {
    if (p > 0) {
      allChildren.push(new Paragraph({ children: [new PageBreak()] }));
      allChildren.push(emptyLine());
      allChildren.push(emptyLine());
    }
    for (let i = 0; i < pages[p].length; i++) {
      if (i > 0) {
        if (pages[p][i].reducedGap) {
          allChildren.push(emptyLine());
        } else {
          allChildren.push(emptyLine());
          allChildren.push(emptyLine());
        }
      }
      allChildren.push(...buildChordSection(pages[p][i].section));
    }
  }

  return new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: chordStyles,
    },
    sections: [
      {
        properties: pageProps(),
        headers: { default: makeHeader() },
        footers: { default: makeFooter() },
        children: allChildren,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Lyric sheet builder
// ---------------------------------------------------------------------------
function buildLyricSection(section: Section): Paragraph[] {
  if (section.type === 'intro') return [];
  const paras: Paragraph[] = [];
  const label = sectionLabel(section);
  paras.push(lyricSectionStart(label, (section as LinesSection).lines[0].lyrics));
  for (let i = 1; i < (section as LinesSection).lines.length; i++) {
    paras.push(lyricLine((section as LinesSection).lines[i].lyrics));
  }
  return paras;
}

function generateLyricSheet(): Document {
  const pages = planPages(song.sections, 'lyric');

  for (let p = 0; p < pages.length; p++) {
    const names = pages[p].map((it) => sectionLabel(it.section));
    console.log(`  Lyric page ${p + 1}: ${names.join(' + ')}`);
  }

  const allChildren: Paragraph[] = [];

  allChildren.push(new Paragraph({ style: 'BodyText', children: [] }));
  allChildren.push(new Paragraph({ style: 'Title', children: [new TextRun(song.title)] }));
  allChildren.push(new Paragraph({ style: 'BodyText', children: [] }));

  for (let p = 0; p < pages.length; p++) {
    if (p > 0) {
      allChildren.push(new Paragraph({ children: [new PageBreak()] }));
      allChildren.push(emptyLine());
      allChildren.push(emptyLine());
    }
    for (let i = 0; i < pages[p].length; i++) {
      if (i > 0) {
        allChildren.push(emptyLine());
      }
      const sectionParas = buildLyricSection(pages[p][i].section);
      allChildren.push(...sectionParas);
    }
  }

  return new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 20 } } },
      paragraphStyles: chordStyles.slice(0, 2),
    },
    sections: [
      {
        properties: pageProps(),
        headers: { default: makeHeader() },
        footers: { default: makeFooter() },
        children: allChildren,
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Generating sheets for: ${song.title}`);

  const chordDoc = generateChordSheet();
  const chordPath = path.join(outDir, `${song.title} - Chord.docx`);
  const chordBuf = await Packer.toBuffer(chordDoc);
  fs.writeFileSync(chordPath, chordBuf);
  console.log(`  -> ${chordPath}`);

  const lyricDoc = generateLyricSheet();
  const lyricPath = path.join(outDir, `${song.title} - Lyric.docx`);
  const lyricBuf = await Packer.toBuffer(lyricDoc);
  fs.writeFileSync(lyricPath, lyricBuf);
  console.log(`  -> ${lyricPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
