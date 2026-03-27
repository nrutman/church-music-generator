/**
 * Transpose chord names down by a given number of half steps.
 *
 * Handles root notes, chord qualities, and slash-bass notes.
 * Enharmonic spelling is chosen to match the target key signature.
 */

// Canonical chromatic scale using sharps
const SHARP_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
// Chromatic scale using flats
const FLAT_NOTES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

// Keys that conventionally use flats
const FLAT_KEYS = new Set([
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Dm',
  'Gm',
  'Cm',
  'Fm',
  'Bbm',
  'Ebm',
]);

/** Map any enharmonic note name to a semitone index (0 = C). */
function noteToIndex(note: string): number {
  const map: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    Fb: 4,
    'E#': 5,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
    Cb: 11,
    'B#': 0,
  };
  const idx = map[note];
  if (idx === undefined) throw new Error(`Unknown note: ${note}`);
  return idx;
}

/** Pick sharp or flat spelling for a semitone index. */
function indexToNote(index: number, useFlats: boolean): string {
  const i = ((index % 12) + 12) % 12;
  return useFlats ? FLAT_NOTES[i] : SHARP_NOTES[i];
}

/** Parse a chord string into root, quality, and optional bass note. */
function parseChord(chord: string): { root: string; quality: string; bass: string | null } {
  // Match root note (letter + optional # or b), then everything else
  const match = chord.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!match) throw new Error(`Cannot parse chord: ${chord}`);
  const [, root, quality, bass] = match;

  // The quality might contain a trailing /bass that wasn't caught if the bass
  // also has a quality-like suffix. Re-check by splitting on the last slash.
  return { root, quality: quality || '', bass: bass || null };
}

/**
 * Determine whether to use flats for the transposed output.
 *
 * Heuristic: transpose the key root down and check if the result
 * is conventionally a flat key.
 */
function shouldUseFlats(semitones: number, originalRoot?: string): boolean {
  if (!originalRoot) return false;
  const rootIdx = noteToIndex(originalRoot);
  const newIdx = (((rootIdx - semitones) % 12) + 12) % 12;
  // Check both major and natural-minor key names
  const sharpName = SHARP_NOTES[newIdx];
  const flatName = FLAT_NOTES[newIdx];
  return FLAT_KEYS.has(flatName) || FLAT_KEYS.has(sharpName);
}

/**
 * Transpose a single chord name down by `semitones` half steps.
 *
 * @param chord     - e.g. "Fadd9/A", "C#m7", "G"
 * @param semitones - number of half steps to transpose down
 * @param useFlats  - whether to spell accidentals as flats
 */
export function transposeChord(chord: string, semitones: number, useFlats: boolean): string {
  // Pass through non-chord tokens (bar lines, time signatures, etc.)
  if (!/^[A-G]/.test(chord)) return chord;
  const { root, quality, bass } = parseChord(chord);
  const newRoot = indexToNote(noteToIndex(root) - semitones, useFlats);
  let result = newRoot + quality;
  if (bass) {
    const newBass = indexToNote(noteToIndex(bass) - semitones, useFlats);
    result += '/' + newBass;
  }
  return result;
}

/**
 * Transpose all chords in a song's sections down by `semitones` half steps.
 * Returns a deep copy with transposed chords; the original is not mutated.
 */
export function transposeSections(
  sections: import('./types').Section[],
  semitones: number,
): import('./types').Section[] {
  // Determine key flavor from the first meaningful chord root
  let firstRoot: string | undefined;
  for (const section of sections) {
    if ('lines' in section && section.lines.length > 0 && section.lines[0].chords.length > 0) {
      const match = section.lines[0].chords[0][0].match(/^([A-G][#b]?)/);
      if (match) {
        firstRoot = match[1];
        break;
      }
    } else if ('chords' in section && section.chords.length > 0) {
      // Intro section — scan for first real chord token
      for (const line of (section as import('./types').IntroSection).chords) {
        const m = line.match(/[A-G][#b]?/);
        if (m) {
          firstRoot = m[0];
          break;
        }
      }
      if (firstRoot) break;
    }
  }

  const useFlats = shouldUseFlats(semitones, firstRoot);

  return sections.map((section) => {
    if ('lines' in section) {
      return {
        ...section,
        lines: section.lines.map((line) => ({
          ...line,
          chords: line.chords.map(
            ([chord, idx]) => [transposeChord(chord, semitones, useFlats), idx] as [string, number],
          ),
        })),
      };
    } else {
      // Intro section — transpose chord tokens within the freeform strings
      return {
        ...section,
        chords: (section as import('./types').IntroSection).chords.map((str) =>
          transposeIntroLine(str, semitones, useFlats),
        ),
      };
    }
  });
}

/** Transpose chord tokens inside a freeform intro chord string. */
function transposeIntroLine(line: string, semitones: number, useFlats: boolean): string {
  // Match chord-like tokens: a letter A-G, optional #/b, then word chars and optional /bass
  return line.replace(/\b([A-G][#b]?(?:[\w]*?)(?:\/[A-G][#b]?)?)\b/g, (match) => {
    // Skip time signatures like "3/4"
    if (/^\d/.test(match)) return match;
    try {
      return transposeChord(match, semitones, useFlats);
    } catch {
      return match; // leave non-chord tokens as-is
    }
  });
}
