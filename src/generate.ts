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
import { Song, Section, IntroSection, LinesSection } from './types';
import { planPages } from './layout';
import { alignChordToLyric, AlignedChords } from './chord-align';
import { textWidth } from './font-metrics';
import { wrapBalanced } from './wrap-balanced';

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
fs.mkdirSync(outDir, { recursive: true });

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

function chords1stLine(label: string, aligned?: AlignedChords): Paragraph {
  const children: TextRun[] = [
    new TextRun({
      text: label.toUpperCase(),
      bold: true,
      italics: false,
      allCaps: true,
      size: 24,
      font: 'Arial',
    }),
  ];
  const tabStopDefs: { type: typeof TabStopType.LEFT; position: number }[] = [];
  if (aligned) {
    const chords = aligned.text.split('\t');
    for (let i = 0; i < chords.length; i++) {
      children.push(new TextRun({ text: '\t', font: 'Arial' }));
      children.push(new TextRun({ text: chords[i], font: 'Arial' }));
    }
    for (let i = 0; i < aligned.tabStops.length; i++) {
      tabStopDefs.push({ type: TabStopType.LEFT, position: aligned.tabStops[i] });
    }
  }
  return new Paragraph({
    style: 'Chords1stLine',
    tabStops: tabStopDefs,
    children,
  });
}

function chordsLine(aligned: AlignedChords): Paragraph {
  const chords = aligned.text.split('\t');
  const children: TextRun[] = [];
  for (let i = 0; i < chords.length; i++) {
    children.push(new TextRun({ text: '\t', font: 'Arial' }));
    children.push(new TextRun({ text: chords[i], font: 'Arial' }));
  }
  return new Paragraph({
    style: 'Chords',
    indent: { left: 0 },
    tabStops: aligned.tabStops.map((pos) => ({ type: TabStopType.LEFT, position: pos })),
    children,
  });
}

function lyricLine(text: string, sizeHalfPts?: number): Paragraph {
  const run: { text: string; font: string; size?: number } = { text, font: 'Arial' };
  if (sizeHalfPts) run.size = sizeHalfPts;
  return new Paragraph({ style: 'BodyText', children: [new TextRun(run)] });
}

function lyricSectionStart(label: string, firstLyric: string, sizeHalfPts?: number): Paragraph {
  const lyricRun: { text: string; font: string; size?: number } = {
    text: '\t' + firstLyric,
    font: 'Arial',
  };
  if (sizeHalfPts) lyricRun.size = sizeHalfPts;
  return new Paragraph({
    style: 'BodyText',
    indent: { left: 0, firstLine: 0 },
    children: [
      new TextRun({ text: label.toUpperCase(), allCaps: true, size: 24, font: 'Arial' }),
      new TextRun(lyricRun),
    ],
  });
}

// Available text width for BodyText: page 8.5" - 1" left margin - 1" right margin - 0.5" left indent - 0.5" firstLine indent = 5.5" = 396pt
const BODY_TEXT_WIDTH_PT = 396;
const DEFAULT_LYRIC_SIZE_PT = 18;
const MIN_LYRIC_SIZE_PT = 15;

function fittedLyricSizeHalfPts(text: string): number | undefined {
  const w = textWidth(text, DEFAULT_LYRIC_SIZE_PT, 'bold');
  if (w <= BODY_TEXT_WIDTH_PT) return undefined; // default size, no override needed
  const needed = DEFAULT_LYRIC_SIZE_PT * (BODY_TEXT_WIDTH_PT / w);
  const fitted = Math.max(MIN_LYRIC_SIZE_PT, Math.floor(needed));
  if (fitted < DEFAULT_LYRIC_SIZE_PT) {
    return fitted * 2; // convert to half-points
  }
  return undefined;
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
  const name = section.type.charAt(0).toUpperCase() + section.type.slice(1);
  if ('number' in section && section.number != null) return `${name} ${section.number}`;
  return name;
}

// ---------------------------------------------------------------------------
// Chord sheet builder
// ---------------------------------------------------------------------------
function alignLine(line: { chords: [string, number][]; lyrics: string }): AlignedChords {
  const sizeHp = fittedLyricSizeHalfPts(line.lyrics);
  return alignChordToLyric(line.chords, line.lyrics, sizeHp ? sizeHp / 2 : undefined);
}

function isLinesSection(section: Section): section is LinesSection {
  return 'lines' in section;
}

function buildChordSection(section: Section): Paragraph[] {
  const paras: Paragraph[] = [];
  if (!isLinesSection(section)) {
    const intro = section as IntroSection;
    paras.push(chords1stLine('Intro', { text: intro.chords[0], tabStops: [1440] }));
    for (let i = 1; i < intro.chords.length; i++) {
      paras.push(chordsLine({ text: intro.chords[i], tabStops: [1440] }));
    }
  } else {
    const label = sectionLabel(section);
    const size0 = fittedLyricSizeHalfPts(section.lines[0].lyrics);
    paras.push(chords1stLine(label, alignLine(section.lines[0])));
    paras.push(lyricLine(section.lines[0].lyrics, size0));
    for (let i = 1; i < section.lines.length; i++) {
      const sizeI = fittedLyricSizeHalfPts(section.lines[i].lyrics);
      paras.push(chordsLine(alignLine(section.lines[i])));
      paras.push(lyricLine(section.lines[i].lyrics, sizeI));
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
  if (!isLinesSection(section)) return [];
  const paras: Paragraph[] = [];
  const label = sectionLabel(section);
  const size0 = fittedLyricSizeHalfPts(section.lines[0].lyrics);
  paras.push(lyricSectionStart(label, section.lines[0].lyrics, size0));
  for (let i = 1; i < section.lines.length; i++) {
    paras.push(lyricLine(section.lines[i].lyrics, fittedLyricSizeHalfPts(section.lines[i].lyrics)));
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
