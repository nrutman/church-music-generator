/**
 * Aligns chord strings so they sit directly above the correct syllables
 * in the lyric line below, accounting for font size differences.
 *
 * Chord lines: 10pt italic Arial
 * Lyric lines: 18pt bold Arial
 */

// Approximate character widths for Arial (units per em at 1000 upm)
const W: Record<string, number> = {
  ' ': 278,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  '0': 556,
  '1': 556,
  '2': 556,
  '3': 556,
  '4': 556,
  '5': 556,
  '6': 556,
  '7': 556,
  '8': 556,
  '9': 556,
  ',': 278,
  '.': 278,
  '-': 333,
  '/': 278,
  '(': 333,
  ')': 333,
  '|': 260,
  '#': 556,
  '\u2019': 222,
  "'": 191,
  '!': 278,
  '?': 556,
  ':': 278,
  ';': 278,
};

const DEFAULT_WIDTH = 556;
const BOLD_FACTOR = 1.08;

function textWidth(text: string, sizePt: number, bold: boolean): number {
  let total = 0;
  for (const ch of text) {
    total += W[ch] ?? DEFAULT_WIDTH;
  }
  if (bold) total *= BOLD_FACTOR;
  return (total * sizePt) / 1000;
}

const CHORD_SPACE_W = (W[' '] * 10) / 1000; // width of one space at 10pt

interface ChordToken {
  text: string;
  pos: number;
}

function parseChordTokens(chordStr: string): ChordToken[] {
  const tokens: ChordToken[] = [];
  let i = 0;
  while (i < chordStr.length) {
    if (chordStr[i] === ' ' || chordStr[i] === '\t') {
      i++;
      continue;
    }
    const start = i;
    while (i < chordStr.length && chordStr[i] !== ' ' && chordStr[i] !== '\t') i++;
    tokens.push({ text: chordStr.slice(start, i), pos: start });
  }
  return tokens;
}

const MIN_SPACES = 3;

/**
 * Realign a chord string to match the physical width of the lyric string below.
 * Chord positions in the input encode which lyric character the chord sits above.
 */
export function alignChordToLyric(chordStr: string, lyricStr: string): string {
  const tokens = parseChordTokens(chordStr);
  if (tokens.length === 0) return chordStr;

  let result = '';

  for (let c = 0; c < tokens.length; c++) {
    const lyricPos = Math.min(tokens[c].pos, lyricStr.length);

    // Physical width of lyrics up to the chord's target position
    const targetWidth = textWidth(lyricStr.slice(0, lyricPos), 18, true);

    // Physical width of chord string built so far
    const currentWidth = textWidth(result, 10, false);

    // How many spaces at 10pt to bridge the gap
    let spaces = Math.max(0, Math.round((targetWidth - currentWidth) / CHORD_SPACE_W));

    // Enforce minimum gap between chords
    if (c > 0 && spaces < MIN_SPACES) spaces = MIN_SPACES;

    result += ' '.repeat(spaces) + tokens[c].text;
  }

  return result;
}
