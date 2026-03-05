#!/usr/bin/env node
//
// Usage: node generate.js songs/song-name.json
//
// Reads a song JSON file and generates both:
//   ../Song Name - Chord.docx
//   ../Song Name - Lyric.docx
//

const { Document, Packer, Paragraph, TextRun, Header, Footer, PageNumber, PageBreak,
        AlignmentType, TabStopType } = require('docx');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Read song data
// ---------------------------------------------------------------------------
const songFile = process.argv[2];
if (!songFile) {
  console.error('Usage: node generate.js songs/song-name.json');
  process.exit(1);
}
const song = JSON.parse(fs.readFileSync(songFile, 'utf8'));
const outDir = path.resolve(__dirname, '..', 'generated');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function makeHeader() {
  const today = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;
  return new Header({
    children: [
      new Paragraph({
        tabStops: [
          { type: TabStopType.CENTER, position: 4320 },
          { type: TabStopType.RIGHT, position: 8640 },
        ],
        children: [
          new TextRun({ text: `Providence Church (Updated ${dateStr})`, font: "Arial", size: 16 }),
          new TextRun({ text: "\t" }),
          new TextRun({ text: "\tPage ", font: "Arial", size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16 }),
          new TextRun({ text: " of ", font: "Arial", size: 16 }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16 }),
        ],
      }),
    ],
  });
}

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: song.title.toUpperCase(), font: "Arial", size: 20 }),
          new TextRun({ text: ` Words and Music by ${song.composers}`, font: "Arial", size: 20 }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: song.copyright, font: "Arial", size: 20 }),
          new TextRun({ break: 1, text: "CCLI #1210714", font: "Arial", size: 20 }),
        ],
      }),
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
    id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true,
    paragraph: { alignment: AlignmentType.CENTER },
    run: { font: "Arial", bold: true, allCaps: true, size: 48 },
  },
  {
    id: "BodyText", name: "Body Text", basedOn: "Normal", next: "Normal",
    paragraph: { indent: { left: 720, firstLine: 720 } },
    run: { font: "Arial", bold: true, size: 36 },
  },
  {
    id: "Chords1stLine", name: "Chords - 1st Line", basedOn: "Normal", next: "Normal",
    run: { font: "Arial", italics: true, size: 20 },
  },
  {
    id: "Chords", name: "Chords", basedOn: "Normal", next: "Normal",
    paragraph: { indent: { left: 1440 } },
    run: { font: "Arial", italics: true, size: 20 },
  },
];

// ---------------------------------------------------------------------------
// Paragraph builders
// ---------------------------------------------------------------------------

// Chord line with section label at the start
function chords1stLine(label, chordStr) {
  const children = [
    new TextRun({ text: label.toUpperCase(), bold: true, italics: false, allCaps: true, size: 24, font: "Arial" }),
  ];
  if (chordStr) {
    children.push(new TextRun({ text: "\t\t" + chordStr, font: "Arial" }));
  }
  return new Paragraph({ style: "Chords1stLine", children });
}

// Chord line (no label)
function chordsLine(chordStr) {
  return new Paragraph({ style: "Chords", children: [new TextRun({ text: chordStr, font: "Arial" })] });
}

// Lyric line
function lyricLine(text, sizeHalfPts) {
  const run = { text, font: "Arial" };
  if (sizeHalfPts) run.size = sizeHalfPts;
  return new Paragraph({ style: "BodyText", children: [new TextRun(run)] });
}

// Section label + first lyric (for lyric sheets)
function lyricSectionStart(label, firstLyric) {
  return new Paragraph({
    style: "BodyText",
    indent: { left: 0, firstLine: 0 },
    children: [
      new TextRun({ text: label.toUpperCase(), allCaps: true, size: 24, font: "Arial" }),
      new TextRun({ text: "\t" + firstLyric, font: "Arial" }),
    ],
  });
}

function emptyLine() {
  return new Paragraph({ style: "BodyText", indent: { left: 0, firstLine: 0 }, children: [] });
}

// ---------------------------------------------------------------------------
// Height estimation (in points)
// ---------------------------------------------------------------------------
const LINE_HEIGHTS = {
  title: 36,
  lyric: 22,      // BodyText 18pt + spacing
  chord: 14,      // Chords 10pt + spacing
  chords1st: 14,  // Chords-1stLine 10pt + spacing
  empty: 22,      // empty BodyText line
  sectionLabel: 22, // lyric sheet section start line
};
const PAGE_HEIGHT = 670; // usable points per page

function estimateSectionHeight(section, mode) {
  let h = 0;
  if (mode === 'chord') {
    if (section.type === 'intro') {
      h += LINE_HEIGHTS.chords1st; // label + chords
      if (section.chords.length > 1) h += (section.chords.length - 1) * LINE_HEIGHTS.chord;
    } else {
      // label line (chords1st) + for each line: chord + lyric
      h += LINE_HEIGHTS.chords1st;
      h += section.lines[0] ? LINE_HEIGHTS.lyric : 0; // first lyric
      for (let i = 1; i < section.lines.length; i++) {
        h += LINE_HEIGHTS.chord + LINE_HEIGHTS.lyric;
      }
    }
  } else { // lyric
    if (section.type === 'intro') return 0; // skip intros in lyric sheets
    // section start line + remaining lyrics
    h += LINE_HEIGHTS.sectionLabel;
    h += (section.lines.length - 1) * LINE_HEIGHTS.lyric;
  }
  return h;
}

// ---------------------------------------------------------------------------
// Layout planner
// ---------------------------------------------------------------------------
function planPages(sections, mode) {
  const gapSize = mode === 'chord' ? 2 * LINE_HEIGHTS.empty : LINE_HEIGHTS.empty;
  const titleBlock = LINE_HEIGHTS.empty + LINE_HEIGHTS.title + LINE_HEIGHTS.empty;
  const pageTopPadding = 2 * LINE_HEIGHTS.empty; // space at top of subsequent pages

  // Build list of renderable sections with heights
  const items = [];
  for (const sec of sections) {
    const h = estimateSectionHeight(sec, mode);
    if (h > 0) items.push({ section: sec, height: h });
  }

  // Greedy page packing
  const pages = [[]];
  let currentHeight = titleBlock; // page 1 starts with title
  let isFirstOnPage = true;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const gapBefore = isFirstOnPage ? 0 : gapSize;
    const needed = gapBefore + item.height;

    if (currentHeight + needed <= PAGE_HEIGHT) {
      pages[pages.length - 1].push(item);
      currentHeight += needed;
      isFirstOnPage = false;
    } else if (pages.length < 2) {
      // Start page 2
      pages.push([item]);
      currentHeight = pageTopPadding + item.height;
      isFirstOnPage = false;
    } else {
      // Page 2 overflow — try reducing gap
      const reducedGap = LINE_HEIGHTS.empty; // single gap instead of double
      const reducedNeeded = (isFirstOnPage ? 0 : reducedGap) + item.height;
      if (currentHeight + reducedNeeded <= PAGE_HEIGHT) {
        item.reducedGap = true;
        pages[pages.length - 1].push(item);
        currentHeight += reducedNeeded;
        isFirstOnPage = false;
      } else {
        console.warn(`WARNING: Content may overflow 2 pages in ${mode} sheet`);
        pages[pages.length - 1].push(item);
        currentHeight += needed;
        isFirstOnPage = false;
      }
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Chord sheet builder
// ---------------------------------------------------------------------------
function buildChordSection(section) {
  const paras = [];
  if (section.type === 'intro') {
    paras.push(chords1stLine("Intro", section.chords[0]));
    for (let i = 1; i < section.chords.length; i++) {
      paras.push(chordsLine(section.chords[i]));
    }
  } else {
    const label = section.type === 'chorus' ? 'Chorus'
                : section.type === 'bridge' ? 'Bridge'
                : `Verse ${section.number}`;
    // First line: label + chords
    paras.push(chords1stLine(label, section.lines[0].chords));
    paras.push(lyricLine(section.lines[0].lyrics));
    // Remaining lines
    for (let i = 1; i < section.lines.length; i++) {
      paras.push(chordsLine(section.lines[i].chords));
      paras.push(lyricLine(section.lines[i].lyrics));
    }
  }
  return paras;
}

function generateChordSheet() {
  const pages = planPages(song.sections, 'chord');

  // Report layout
  for (let p = 0; p < pages.length; p++) {
    const names = pages[p].map(it => {
      const s = it.section;
      return s.type === 'intro' ? 'Intro' : s.type === 'chorus' ? 'Chorus' : `Verse ${s.number}`;
    });
    console.log(`  Chord page ${p + 1}: ${names.join(' + ')}`);
  }

  const allChildren = [];

  // Page 1: title block
  allChildren.push(new Paragraph({ style: "BodyText", children: [] }));
  allChildren.push(new Paragraph({ style: "Title", children: [new TextRun(song.title)] }));
  allChildren.push(new Paragraph({ style: "BodyText", children: [] }));

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

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
      paragraphStyles: chordStyles,
    },
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader() },
      footers: { default: makeFooter() },
      children: allChildren,
    }],
  });

  return doc;
}

// ---------------------------------------------------------------------------
// Lyric sheet builder
// ---------------------------------------------------------------------------
function buildLyricSection(section) {
  if (section.type === 'intro') return []; // skip intros
  const paras = [];
  const label = section.type === 'chorus' ? 'Chorus'
              : section.type === 'bridge' ? 'Bridge'
              : `Verse ${section.number}`;
  paras.push(lyricSectionStart(label, section.lines[0].lyrics));
  for (let i = 1; i < section.lines.length; i++) {
    paras.push(lyricLine(section.lines[i].lyrics));
  }
  return paras;
}

function generateLyricSheet() {
  const pages = planPages(song.sections, 'lyric');

  for (let p = 0; p < pages.length; p++) {
    const names = pages[p].map(it => {
      const s = it.section;
      return s.type === 'intro' ? 'Intro' : s.type === 'chorus' ? 'Chorus' : `Verse ${s.number}`;
    });
    console.log(`  Lyric page ${p + 1}: ${names.join(' + ')}`);
  }

  const allChildren = [];

  // Page 1: title block
  allChildren.push(new Paragraph({ style: "BodyText", children: [] }));
  allChildren.push(new Paragraph({ style: "Title", children: [new TextRun(song.title)] }));
  allChildren.push(new Paragraph({ style: "BodyText", children: [] }));

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

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
      paragraphStyles: chordStyles.slice(0, 2), // Title + BodyText only
    },
    sections: [{
      properties: pageProps(),
      headers: { default: makeHeader() },
      footers: { default: makeFooter() },
      children: allChildren,
    }],
  });

  return doc;
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

main().catch(err => { console.error(err); process.exit(1); });
