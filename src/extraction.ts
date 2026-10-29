export type ExtractionMode = 'text' | 'ocr';
export interface Word {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

const CHORD_RE =
  /^[A-G][#b♯♭]?(?:m(?:aj|in)?|M|dim|aug|sus[24]?|add|dom)?[0-9]*(?:\/[A-G][#b♯♭]?)?$/;
const LABELS = new Set(['VERSE', 'CHORUS', 'BRIDGE', 'INTRO', 'INTRO:', 'TAG', 'OUTRO']);
const OCR_LABELS = new Set([
  ...LABELS,
  'STANZA',
  'TURN',
  '[INTRO]',
  '[CHORUS',
  '[BRIDGE',
  '[TURN',
  '[STANZA',
  '[VERSE',
  '[TAG',
  '[OUTRO',
]);
const ANNOTATIONS = new Set(['(to', 'CHORUS)', '3X)', '2X)']);
// Python str.isdigit includes Unicode Digit characters beyond decimal numbers.
// Keep circled/superscript section numbers without accepting fractions or Romans.
const isDigits = (text: string) =>
  /^[\p{Decimal_Number}\u{b2}-\u{b3}\u{b9}\u{1369}-\u{1371}\u{19da}\u{2070}\u{2074}-\u{2079}\u{2080}-\u{2089}\u{2460}-\u{2468}\u{2474}-\u{247c}\u{2488}-\u{2490}\u{24ea}\u{24f5}-\u{24fd}\u{24ff}\u{2776}-\u{277e}\u{2780}-\u{2788}\u{278a}-\u{2792}\u{10a40}-\u{10a43}\u{10e60}-\u{10e68}\u{11052}-\u{1105a}\u{1f100}-\u{1f10a}]+$/u.test(
    text,
  );

export function isChord(text: string, mode: ExtractionMode = 'text'): boolean {
  if (text === '|' || (mode === 'ocr' && text === '/')) return true;
  return CHORD_RE.test(mode === 'ocr' ? text.replace(/^[()[\]]+|[()[\]]+$/g, '') : text);
}

export function isLabelOrAnnotation(text: string, mode: ExtractionMode = 'text'): boolean {
  if (mode === 'text') return LABELS.has(text) || ANNOTATIONS.has(text) || isDigits(text);
  if (ANNOTATIONS.has(text) || text === '(F)' || text === '(Bb)') return true;
  if (OCR_LABELS.has(text) || OCR_LABELS.has(text.replace(/[:\]]+$/, '').replace(/^\[+/, '')))
    return true;
  const stripped = text.replace(/^\[+|\]+$/g, '');
  return (
    OCR_LABELS.has(stripped) ||
    OCR_LABELS.has(stripped.replace(/:+$/, '')) ||
    isDigits(text.replace(/\]+$/, '')) ||
    isDigits(text)
  );
}

export function groupIntoLines(
  words: Word[],
  mode: ExtractionMode = 'text',
  tolerance = mode === 'text' ? 5 : 15,
): Word[][] {
  if (!words.length) return [];
  const center = (w: Word) => (w.yMin + w.yMax) / 2;
  const sorted = [...words].sort((a, b) => center(a) - center(b) || a.xMin - b.xMin);
  const lines: Word[][] = [];
  let current = [sorted[0]];
  for (const word of sorted.slice(1)) {
    if (Math.abs(center(word) - center(current[0])) < tolerance) current.push(word);
    else {
      lines.push(current.sort((a, b) => a.xMin - b.xMin));
      current = [word];
    }
  }
  lines.push(current.sort((a, b) => a.xMin - b.xMin));
  return lines;
}

export function classifyLine(
  words: Word[],
  mode: ExtractionMode = 'text',
): 'chord' | 'lyric' | 'other' {
  const nonLabel = words.filter((w) => !isLabelOrAnnotation(w.text, mode));
  if (!nonLabel.length) return 'other';
  if (nonLabel.filter((w) => isChord(w.text, mode)).length / nonLabel.length > 0.5) return 'chord';
  return words.length > 1 &&
    words.some((w) => Array.from(w.text).length > 1 && /\p{Lowercase}/u.test(w.text))
    ? 'lyric'
    : 'other';
}

export function buildCharMap(words: Word[]): { text: string; positions: [number, number][] } {
  let text = '';
  const positions: [number, number][] = [];
  words.forEach((word, i) => {
    if (i > 0) {
      text += ' ';
      positions.push([words[i - 1].xMax, word.xMin]);
    }
    // Python indices count Unicode code points, not UTF-16 code units.
    const chars = Array.from(word.text);
    const width = (word.xMax - word.xMin) / Math.max(chars.length, 1);
    chars.forEach((ch, j) => {
      text += ch;
      positions.push([word.xMin + j * width, word.xMin + (j + 1) * width]);
    });
  });
  return { text, positions };
}

export function mapChordToChar(
  x: number,
  text: string,
  positions: [number, number][],
  mode: ExtractionMode = 'text',
): [number, string] {
  const chars = Array.from(text);
  if (positions.length && x > positions[positions.length - 1][1] + (mode === 'text' ? 5 : 15))
    return [chars.length, '(trailing)'];
  let best = 0,
    distance = Infinity;
  for (let i = 0; i < positions.length; i++) {
    const [left, right] = positions[i];
    if (left <= x && x <= right) return [i, chars[i]];
    const d = Math.min(Math.abs(x - left), Math.abs(x - right));
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return [best, chars[best] ?? '(trailing)'];
}

function pythonFixed(value: number, digits: number): string {
  // Python formats the exact binary float with ties-to-even; JS toFixed rounds
  // ties differently. Integer arithmetic preserves the original report output.
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(Math.abs(value));
  const bits = buffer.readBigUInt64BE();
  const exponent = Number((bits >> 52n) & 2047n);
  const mantissa = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const shift = (exponent ? exponent - 1023 : 1 - 1023) - 52;
  let numerator = mantissa * 10n ** BigInt(digits),
    denominator = 1n;
  if (shift >= 0) numerator <<= BigInt(shift);
  else denominator <<= BigInt(-shift);
  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n === 1n))
    rounded++;
  const raw = rounded.toString().padStart(digits + 1, '0');
  return (
    (value < 0 || Object.is(value, -0) ? '-' : '') +
    (digits ? raw.slice(0, -digits) + '.' + raw.slice(-digits) : raw)
  );
}

export function formatReport(words: Word[], mode: ExtractionMode = 'text'): string {
  const lines = groupIntoLines(words, mode);
  const output =
    mode === 'ocr'
      ? ['Rendering PDF pages and running OCR...', `Found ${words.length} words across all pages.`]
      : [];
  output.push(
    '='.repeat(78),
    `CHORD POSITION EXTRACTION${mode === 'ocr' ? ' (OCR)' : ''}`,
    '='.repeat(78),
  );
  for (let i = 0; i < lines.length; i++) {
    if (
      classifyLine(lines[i], mode) !== 'chord' ||
      i + 1 >= lines.length ||
      classifyLine(lines[i + 1], mode) !== 'lyric'
    )
      continue;
    const chords = lines[i].filter(
      (w) => isChord(w.text, mode) && w.text !== '|' && (mode !== 'ocr' || w.text !== '/'),
    );
    const lyrics = lines[i + 1].filter((w) => !isLabelOrAnnotation(w.text, mode));
    if (lyrics.length) {
      const { text, positions } = buildCharMap(lyrics),
        chars = Array.from(text);
      output.push('', `LYRIC: "${text}"`);
      const parts: string[] = [];
      for (const chord of chords) {
        const name = mode === 'ocr' ? chord.text.replace(/^\(+|\)+$/g, '') : chord.text;
        let [index, ch] = mapChordToChar(chord.xMin, text, positions, mode);
        const trailing = index >= chars.length ? ' (TRAILING)' : '';
        if (ch === ' ' && index + 1 < chars.length) {
          index++;
          ch = chars[index];
        }
        output.push(
          `  ${name.padStart(8)} → charIndex=${String(index).padStart(3)}  char='${ch}'  x=${pythonFixed(chord.xMin, mode === 'ocr' ? 0 : 1)}${trailing}`,
        );
        parts.push(`["${name}", ${index}]`);
      }
      output.push(`  "chords": [${parts.join(', ')}]`);
    }
    i++;
  }
  return output.join('\n') + '\n';
}
