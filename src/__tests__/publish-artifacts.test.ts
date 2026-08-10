import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ccliNumberForSong,
  matchingWordFiles,
  normalizedWordStem,
  publishArtifacts,
  validatePublishArtifacts,
} from '../publish-artifacts';
import { Song } from '../types';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-artifacts-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function song(overrides: Partial<Song> = {}): Song {
  return {
    title: 'A Test Song!',
    composers: 'Test Author',
    copyright: '© 2024 Test Publisher. CCLI Song No. 1234567.',
    sections: [],
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('publish artifacts', () => {
  it('builds lyric, chord, and optional Capo filenames with generator naming rules', () => {
    expect(
      publishArtifacts(song({ capo: 2 }), '/generated').map((artifact) => artifact.fileName),
    ).toEqual(['Test Song - Lyric.docx', 'Test Song - Chord.docx', 'Test Song - Chord Capo.docx']);
  });

  it('selects only standard and Capo charts for chord-only publishing', () => {
    expect(
      publishArtifacts(song({ capo: 2 }), '/generated', { chordsOnly: true }).map(
        (artifact) => artifact.fileName,
      ),
    ).toEqual(['Test Song - Chord.docx', 'Test Song - Chord Capo.docx']);
  });

  it('matches legacy and current Word files by case-insensitive stem', () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, 'Test Song - Lyric.doc'), 'old');
    fs.writeFileSync(path.join(directory, 'TEST SONG - LYRIC.docx'), 'current');
    fs.writeFileSync(path.join(directory, 'Test Song - Chord.docx'), 'other');

    expect(
      matchingWordFiles(directory, 'test song - lyric').map((filePath) => path.basename(filePath)),
    ).toEqual(['TEST SONG - LYRIC.docx', 'Test Song - Lyric.doc']);
    expect(normalizedWordStem('Test Song - Lyric.pdf')).toBeUndefined();
  });

  it('rejects generated files older than the song JSON', () => {
    const directory = temporaryDirectory();
    const songFile = path.join(directory, 'song.json');
    fs.writeFileSync(songFile, '{}');
    const artifacts = publishArtifacts(song(), directory);
    for (const artifact of artifacts) fs.writeFileSync(artifact.sourcePath, artifact.kind);
    const future = new Date(Date.now() + 10_000);
    fs.utimesSync(songFile, future, future);

    expect(() => validatePublishArtifacts(artifacts, songFile)).toThrow(
      'Generated file is older than the song JSON',
    );
  });

  it('uses explicit CCLI metadata before parsing copyright text', () => {
    expect(ccliNumberForSong(song({ ccliNumber: 7654321 }))).toBe(7654321);
    expect(ccliNumberForSong(song())).toBe(1234567);
  });
});
