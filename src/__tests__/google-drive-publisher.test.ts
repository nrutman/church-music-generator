import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { GoogleDrivePublisher } from '../google-drive-publisher';
import { PublishArtifact } from '../publish-artifacts';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-publisher-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('GoogleDrivePublisher', () => {
  it('replaces every legacy Word file with one canonical .docx', () => {
    const root = temporaryDirectory();
    const lyrics = path.join(root, 'lyrics');
    const chords = path.join(root, 'chords');
    const backup = path.join(root, 'backup');
    fs.mkdirSync(lyrics);
    fs.mkdirSync(chords);
    fs.writeFileSync(path.join(lyrics, 'Song - Lyric.doc'), 'legacy');
    fs.writeFileSync(path.join(lyrics, 'Song - Lyric.docx'), 'old-current');
    const sourcePath = path.join(root, 'new.docx');
    fs.writeFileSync(sourcePath, 'new-content');
    const artifact: PublishArtifact = {
      kind: 'lyric',
      fileName: 'Song - Lyric.docx',
      stem: 'Song - Lyric',
      sourcePath,
    };
    const publisher = new GoogleDrivePublisher({
      lyricDirectory: lyrics,
      chordDirectory: chords,
    });

    const staged = publisher.stage(publisher.plan(artifact), backup);
    publisher.commit(staged);

    expect(fs.readdirSync(lyrics)).toEqual(['Song - Lyric.docx']);
    expect(fs.readFileSync(path.join(lyrics, 'Song - Lyric.docx'), 'utf8')).toBe('new-content');
  });

  it('restores every replaced file during rollback', () => {
    const root = temporaryDirectory();
    const lyrics = path.join(root, 'lyrics');
    const chords = path.join(root, 'chords');
    fs.mkdirSync(lyrics);
    fs.mkdirSync(chords);
    fs.writeFileSync(path.join(chords, 'Song - Chord.doc'), 'legacy');
    const sourcePath = path.join(root, 'new.docx');
    fs.writeFileSync(sourcePath, 'new-content');
    const publisher = new GoogleDrivePublisher({
      lyricDirectory: lyrics,
      chordDirectory: chords,
    });
    const staged = publisher.stage(
      publisher.plan({
        kind: 'chord',
        fileName: 'Song - Chord.docx',
        stem: 'Song - Chord',
        sourcePath,
      }),
      path.join(root, 'backup'),
    );

    publisher.commit(staged);
    publisher.rollback(staged);

    expect(fs.readdirSync(chords)).toEqual(['Song - Chord.doc']);
    expect(fs.readFileSync(path.join(chords, 'Song - Chord.doc'), 'utf8')).toBe('legacy');
  });
});
