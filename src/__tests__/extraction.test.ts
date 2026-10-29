import { describe, expect, it } from 'vitest';
import golden from './fixtures/extraction-python-golden.json';
import {
  buildCharMap,
  classifyLine,
  formatReport,
  groupIntoLines,
  isChord,
  isLabelOrAnnotation,
  mapChordToChar,
  ExtractionMode,
  Word,
} from '../extraction';

const word = (text: string, xMin = 100, yMin = 50, width = text.length * 8): Word => ({
  text,
  xMin,
  yMin,
  xMax: xMin + width,
  yMax: yMin + 12,
});
const words = (texts: string[]) => texts.map((text, i) => word(text, 50 + i * 80));

describe('ported Python extraction tests', () => {
  it.each(['VERSE', 'CHORUS', 'BRIDGE', 'INTRO', 'TAG', 'OUTRO', '1', '2', '3', '4'])(
    'recognizes label %s',
    (text) => {
      expect(isLabelOrAnnotation(text)).toBe(true);
    },
  );
  it.each(['Holy', 'Am'])('does not treat %s as a label', (text) => {
    expect(isLabelOrAnnotation(text)).toBe(false);
  });
  it.each([
    [['D', 'G', 'Em', 'A'], 'chord'],
    [['Holy', 'Spirit', 'living', 'breath'], 'lyric'],
    [['VERSE', '1', 'D', 'G', 'A'], 'chord'],
    [['INTRO'], 'other'],
    [['A', 'mighty', 'fortress'], 'lyric'],
    [[], 'other'],
  ] as const)('classifies %j as %s', (texts, expected) => {
    expect(classifyLine(words([...texts]))).toBe(expected);
  });
  it('maps a single word', () => {
    expect(buildCharMap([word('Hello', 100, 50, 50)])).toEqual({
      text: 'Hello',
      positions: [
        [100, 110],
        [110, 120],
        [120, 130],
        [130, 140],
        [140, 150],
      ],
    });
  });
  it('inserts a character interval spanning the space between words', () => {
    const result = buildCharMap([word('Holy', 100, 50, 40), word('Spirit', 150, 50, 60)]);
    expect(result.text).toBe('Holy Spirit');
    expect(result.positions).toHaveLength(11);
    expect(result.positions[4]).toEqual([140, 150]);
  });
  it('maps an empty lyric', () => {
    expect(buildCharMap([])).toEqual({ text: '', positions: [] });
  });
  it('maps an exact character hit', () => {
    const text = 'Hello world';
    const positions = Array.from(text, (_, i): [number, number] => [100 + i * 10, 110 + i * 10]);
    expect(mapChordToChar(165, text, positions)).toEqual([6, 'w']);
  });
  it('maps a trailing chord to the lyric length', () => {
    const { text, positions } = buildCharMap([word('Hello', 100, 50, 50)]);
    expect(mapChordToChar(200, text, positions)).toEqual([5, '(trailing)']);
  });
  it('preserves Python first-match behavior for an equidistant gap', () => {
    expect(
      mapChordToChar(115, 'AB', [
        [100, 110],
        [120, 130],
      ]),
    ).toEqual([0, 'A']);
  });
  it('groups nearby words together', () => {
    expect(groupIntoLines([word('A', 10, 100, 10), word('B', 30, 101, 10)])).toHaveLength(1);
  });
  it('separates different lines', () => {
    expect(groupIntoLines([word('top', 10, 100), word('bottom', 10, 200)])).toHaveLength(2);
  });
  it('groups empty input', () => expect(groupIntoLines([])).toEqual([]));
  it('sorts grouped words by x', () => {
    expect(
      groupIntoLines([word('second', 200, 100), word('first', 50, 101)])[0].map((w) => w.text),
    ).toEqual(['first', 'second']);
  });
});

for (const corpus of golden.modes) {
  const mode = corpus.mode as ExtractionMode;
  describe(`Python golden parity (${mode})`, () => {
    it.each(corpus.detections)('detects "$text" exactly like Python', (c) => {
      expect({ chord: isChord(c.text, mode), label: isLabelOrAnnotation(c.text, mode) }).toEqual({
        chord: c.chord,
        label: c.label,
      });
    });
    it.each(corpus.classifications)('classifies $texts exactly like Python', (c) => {
      expect(classifyLine(words(c.texts), mode)).toBe(c.result);
    });
    it.each(corpus.groups)('groups coordinates %# exactly like Python', (c) => {
      expect(groupIntoLines(c.words, mode).map((line) => line.map((w) => w.text))).toEqual(
        c.result,
      );
    });
    it.each(corpus.mappings)('maps characters %# exactly like Python', (c) => {
      const result = buildCharMap(c.words);
      expect(result.text).toBe(c.text);
      expect(result.positions).toEqual(c.positions);
      for (const hit of c.hits)
        expect(mapChordToChar(hit.x, result.text, result.positions, mode)).toEqual(hit.result);
    });
    it.each(corpus.reports)('formats the complete report %# byte-for-byte like Python', (c) => {
      expect(formatReport(c.words, mode)).toBe(c.output);
    });
  });
}
