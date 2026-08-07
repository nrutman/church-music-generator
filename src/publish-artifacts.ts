import * as fs from 'fs';
import * as path from 'path';
import { fileNameFromTitle } from './file-name';
import { Song } from './types';

export type PublishArtifactKind = 'lyric' | 'chord' | 'capo';

export interface PublishArtifact {
  kind: PublishArtifactKind;
  fileName: string;
  stem: string;
  sourcePath: string;
}

const WORD_EXTENSIONS = new Set(['.doc', '.docx']);

/** Compare logical Word files while allowing a legacy .doc to be replaced by .docx. */
export function normalizedWordStem(fileName: string): string | undefined {
  const extension = path.extname(fileName).toLowerCase();
  if (!WORD_EXTENSIONS.has(extension)) return undefined;
  return path.basename(fileName, extension).trim().toLocaleLowerCase();
}

export function matchingWordFiles(directory: string, stem: string): string[] {
  const expected = stem.trim().toLocaleLowerCase();
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && normalizedWordStem(entry.name) === expected)
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

/** Return every generated .docx artifact expected for a song. */
export function publishArtifacts(song: Song, generatedDirectory: string): PublishArtifact[] {
  const baseName = fileNameFromTitle(song.title);
  const definitions: [PublishArtifactKind, string][] = [
    ['lyric', `${baseName} - Lyric`],
    ['chord', `${baseName} - Chord`],
  ];
  if (song.capo) definitions.push(['capo', `${baseName} - Chord Capo`]);

  return definitions.map(([kind, stem]) => ({
    kind,
    stem,
    fileName: `${stem}.docx`,
    sourcePath: path.join(generatedDirectory, `${stem}.docx`),
  }));
}

/** Refuse to publish missing output or output older than its reviewed song JSON. */
export function validatePublishArtifacts(artifacts: PublishArtifact[], songFile: string): void {
  const songModifiedAt = fs.statSync(songFile).mtimeMs;
  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact.sourcePath)) {
      throw new Error(`Missing generated file: ${artifact.sourcePath}`);
    }
    if (fs.statSync(artifact.sourcePath).mtimeMs < songModifiedAt) {
      throw new Error(`Generated file is older than the song JSON: ${artifact.fileName}`);
    }
  }
}

export function ccliNumberForSong(song: Song): number | undefined {
  if (song.ccliNumber) return song.ccliNumber;
  const match = song.copyright.match(/CCLI(?: Song)?(?: No\.| #)?\s*(\d+)/i);
  return match ? Number(match[1]) : undefined;
}
