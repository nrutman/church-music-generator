import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleDrivePublisher } from '../google-drive-publisher';
import {
  PlanningCenterApi,
  PlanningCenterArrangement,
  PlanningCenterAttachment,
  PlanningCenterAttachmentType,
  PlanningCenterKey,
  PlanningCenterSong,
} from '../planning-center-client';
import { PromptOption, PublishPrompter } from '../publish-prompter';
import { runPublishWorkflow } from '../publish-workflow';
import { Song } from '../types';

const temporaryDirectories: string[] = [];

class TestPrompter implements PublishPrompter {
  constructor(
    private readonly choices: unknown[] = [],
    private readonly confirmations: boolean[] = [],
    private readonly inputs: string[] = [],
  ) {}

  async choose<T>(_message: string, _options: PromptOption<T>[]): Promise<T> {
    if (!this.choices.length) throw new Error('Unexpected choice prompt');
    return this.choices.shift() as T;
  }

  async confirm(_message: string): Promise<boolean> {
    if (!this.confirmations.length) throw new Error('Unexpected confirmation prompt');
    return this.confirmations.shift()!;
  }

  async input(_message: string): Promise<string> {
    if (!this.inputs.length) throw new Error('Unexpected input prompt');
    return this.inputs.shift()!;
  }

  close(): void {}
}

interface TestWorkspace {
  root: string;
  generated: string;
  lyrics: string;
  chords: string;
  state: string;
  songFile: string;
}

function workspace(song: Song): TestWorkspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-workflow-test-'));
  temporaryDirectories.push(root);
  const generated = path.join(root, 'generated');
  const lyrics = path.join(root, 'lyrics');
  const chords = path.join(root, 'chords');
  const state = path.join(root, 'state');
  for (const directory of [generated, lyrics, chords]) fs.mkdirSync(directory);
  const songFile = path.join(root, 'test-song.json');
  fs.writeFileSync(songFile, JSON.stringify(song));
  fs.writeFileSync(path.join(generated, 'Test Song - Lyric.docx'), 'new-lyric');
  fs.writeFileSync(path.join(generated, 'Test Song - Chord.docx'), 'new-chord');
  if (song.capo) fs.writeFileSync(path.join(generated, 'Test Song - Chord Capo.docx'), 'new-capo');
  return { root, generated, lyrics, chords, state, songFile };
}

function song(overrides: Partial<Song> = {}): Song {
  return {
    title: 'Test Song',
    composers: 'Test Author',
    copyright: '© 2024 Test Publisher. CCLI #1234567',
    key: 'E',
    sections: [],
    ...overrides,
  };
}

const planningCenterSong: PlanningCenterSong = {
  id: 'song-1',
  type: 'Song',
  attributes: { title: 'Test Song', author: 'Test Author', ccli_number: 1234567 },
  links: { self: 'https://api.example.test/songs/song-1' },
};

const arrangement: PlanningCenterArrangement = {
  id: 'arrangement-1',
  type: 'Arrangement',
  attributes: { name: 'Default Arrangement' },
};

const performedKey: PlanningCenterKey = {
  id: 'key-e',
  type: 'Key',
  attributes: { name: 'E', starting_key: 'E', ending_key: 'E' },
};

const attachmentTypes: PlanningCenterAttachmentType[] = [
  {
    id: 'lyrics-type',
    type: 'AttachmentType',
    attributes: {
      name: 'Lyrics',
      lyrics: true,
      chord_charts: false,
      capoed_chord_charts: false,
    },
  },
  {
    id: 'chord-type',
    type: 'AttachmentType',
    attributes: {
      name: 'Chord Chart',
      lyrics: false,
      chord_charts: true,
      capoed_chord_charts: false,
    },
  },
  {
    id: 'capo-type',
    type: 'AttachmentType',
    attributes: {
      name: 'Capo Chord Chart',
      lyrics: false,
      chord_charts: true,
      capoed_chord_charts: true,
    },
  },
];

function attachment(id: string, filename: string): PlanningCenterAttachment {
  return { id, type: 'Attachment', attributes: { filename } };
}

function api(overrides: Partial<PlanningCenterApi> = {}): PlanningCenterApi {
  const attachmentResponse = (id: string) => ({
    data: attachment(id, 'published.docx'),
  });
  return {
    searchSongs: vi.fn().mockResolvedValue([planningCenterSong]),
    getSong: vi.fn().mockResolvedValue(planningCenterSong),
    listArrangements: vi.fn().mockResolvedValue([arrangement]),
    listKeys: vi.fn().mockResolvedValue([performedKey]),
    listArrangementAttachments: vi.fn().mockResolvedValue([]),
    listKeyAttachments: vi.fn().mockResolvedValue([]),
    listAttachmentTypes: vi.fn().mockResolvedValue(attachmentTypes),
    createSong: vi.fn().mockResolvedValue(planningCenterSong),
    createArrangement: vi.fn().mockResolvedValue(arrangement),
    createKey: vi.fn().mockResolvedValue(performedKey),
    uploadFile: vi.fn().mockImplementation(async (_file, name) => `upload-${name}`),
    createArrangementAttachment: vi.fn().mockResolvedValue(attachmentResponse('new-lyric')),
    updateArrangementAttachment: vi.fn().mockResolvedValue(attachmentResponse('updated-lyric')),
    deleteArrangementAttachment: vi.fn().mockResolvedValue(undefined),
    createKeyAttachment: vi.fn().mockResolvedValue(attachmentResponse('new-chord')),
    updateKeyAttachment: vi.fn().mockResolvedValue(attachmentResponse('updated-chord')),
    deleteKeyAttachment: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as PlanningCenterApi;
}

function drive(testWorkspace: TestWorkspace): GoogleDrivePublisher {
  return new GoogleDrivePublisher({
    lyricDirectory: testWorkspace.lyrics,
    chordDirectory: testWorkspace.chords,
  });
}

function options(testWorkspace: TestWorkspace, dryRun = false) {
  return {
    songFile: testWorkspace.songFile,
    generatedDirectory: testWorkspace.generated,
    stateDirectory: testWorkspace.state,
    dryRun,
    yes: true,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('runPublishWorkflow', () => {
  it('plans standard and Capo updates under the performed key without mutating on dry-run', async () => {
    const testWorkspace = workspace(song({ capo: 2 }));
    fs.writeFileSync(path.join(testWorkspace.lyrics, 'Test Song - Lyric.doc'), 'old-lyric');
    const client = api({
      listArrangementAttachments: vi
        .fn()
        .mockResolvedValue([attachment('lyric-1', 'Test Song - Lyric.doc')]),
      listKeyAttachments: vi
        .fn()
        .mockResolvedValue([
          attachment('chord-1', 'Test Song - Chord.docx'),
          attachment('capo-1', 'Test Song - Chord Capo.doc'),
        ]),
    });

    await runPublishWorkflow(
      song({ capo: 2 }),
      client,
      drive(testWorkspace),
      new TestPrompter(),
      options(testWorkspace, true),
    );

    expect(client.listKeyAttachments).toHaveBeenCalledWith('song-1', 'arrangement-1', 'key-e');
    expect(client.uploadFile).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(testWorkspace.lyrics, 'Test Song - Lyric.doc'), 'utf8')).toBe(
      'old-lyric',
    );
  });

  it('leaves lyric files and attachments untouched during chord-only publishing', async () => {
    const testWorkspace = workspace(song({ capo: 2 }));
    fs.writeFileSync(path.join(testWorkspace.lyrics, 'Test Song - Lyric.docx'), 'old-lyric');
    const client = api();

    await runPublishWorkflow(song({ capo: 2 }), client, drive(testWorkspace), new TestPrompter(), {
      ...options(testWorkspace),
      chordsOnly: true,
    });

    expect(fs.readFileSync(path.join(testWorkspace.lyrics, 'Test Song - Lyric.docx'), 'utf8')).toBe(
      'old-lyric',
    );
    expect(client.listArrangementAttachments).toHaveBeenCalled();
    expect(client.createArrangementAttachment).not.toHaveBeenCalled();
    expect(client.updateArrangementAttachment).not.toHaveBeenCalled();
    expect(client.uploadFile).toHaveBeenCalledTimes(2);
  });

  it('creates a confirmed new Song, default Arrangement, performed Key, and typed files', async () => {
    const testWorkspace = workspace(song());
    fs.writeFileSync(path.join(testWorkspace.lyrics, 'Test Song - Lyric.doc'), 'old-lyric');
    const client = api({
      searchSongs: vi.fn().mockResolvedValue([]),
      listArrangements: vi.fn().mockResolvedValue([]),
      listKeys: vi.fn().mockResolvedValue([]),
    });

    await runPublishWorkflow(
      song(),
      client,
      drive(testWorkspace),
      new TestPrompter(['create']),
      options(testWorkspace),
    );

    expect(client.createSong).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Song' }),
      1234567,
    );
    expect(client.createArrangement).toHaveBeenCalledWith('song-1', 'Default Arrangement');
    expect(client.createKey).toHaveBeenCalledWith('song-1', 'arrangement-1', 'E');
    expect(client.createArrangementAttachment).toHaveBeenCalledWith(
      'song-1',
      'arrangement-1',
      'upload-Test Song - Lyric.docx',
      'Test Song - Lyric.docx',
      'lyrics-type',
    );
    expect(client.createKeyAttachment).toHaveBeenCalledWith(
      'song-1',
      'arrangement-1',
      'key-e',
      'upload-Test Song - Chord.docx',
      'Test Song - Chord.docx',
      'chord-type',
    );
    expect(fs.readdirSync(testWorkspace.lyrics)).toEqual(['Test Song - Lyric.docx']);
    expect(fs.existsSync(testWorkspace.state)).toBe(true);
    expect(fs.readdirSync(testWorkspace.state)).toEqual([]);
  });

  it('does not touch Drive when the user declines to create an unmatched song', async () => {
    const testWorkspace = workspace(song());
    const client = api({ searchSongs: vi.fn().mockResolvedValue([]) });

    await expect(
      runPublishWorkflow(
        song(),
        client,
        drive(testWorkspace),
        new TestPrompter(['cancel']),
        options(testWorkspace),
      ),
    ).rejects.toThrow('Publishing cancelled');

    expect(fs.readdirSync(testWorkspace.lyrics)).toEqual([]);
    expect(fs.readdirSync(testWorkspace.chords)).toEqual([]);
    expect(client.uploadFile).not.toHaveBeenCalled();
  });

  it('uses the duplicate Song explicitly selected by the user', async () => {
    const testWorkspace = workspace(song());
    const duplicate = {
      ...planningCenterSong,
      id: 'song-2',
      attributes: { ...planningCenterSong.attributes, author: 'Other Author' },
    };
    const client = api({
      searchSongs: vi.fn().mockResolvedValue([planningCenterSong, duplicate]),
    });

    await runPublishWorkflow(
      song(),
      client,
      drive(testWorkspace),
      new TestPrompter([duplicate]),
      options(testWorkspace, true),
    );

    expect(client.listArrangements).toHaveBeenCalledWith('song-2');
  });

  it('replaces a legacy attachment selected when its filename stem does not match', async () => {
    const testWorkspace = workspace(song());
    const legacyLyric = attachment('legacy-lyric', 'Test Song Short - Lyric.doc');
    const client = api({
      listArrangementAttachments: vi.fn().mockResolvedValue([legacyLyric]),
    });

    await runPublishWorkflow(
      song(),
      client,
      drive(testWorkspace),
      new TestPrompter([legacyLyric]),
      options(testWorkspace),
    );

    expect(client.updateArrangementAttachment).toHaveBeenCalledWith(
      'song-1',
      'arrangement-1',
      'legacy-lyric',
      'upload-Test Song - Lyric.docx',
      'Test Song - Lyric.docx',
      'lyrics-type',
    );
    expect(client.createArrangementAttachment).not.toHaveBeenCalled();
  });

  it('creates and publishes to an explicitly named alternate Arrangement', async () => {
    const alternateSong = song({ planningCenterArrangement: 'Alternate Arrangement' });
    const testWorkspace = workspace(alternateSong);
    const client = api({
      listArrangements: vi.fn().mockResolvedValue([arrangement]),
      listKeys: vi.fn().mockResolvedValue([]),
    });

    await runPublishWorkflow(
      alternateSong,
      client,
      drive(testWorkspace),
      new TestPrompter([], [true]),
      options(testWorkspace),
    );

    expect(client.createArrangement).toHaveBeenCalledWith('song-1', 'Alternate Arrangement');
    expect(client.createKey).toHaveBeenCalledWith('song-1', 'arrangement-1', 'E');
  });

  it('keeps Drive as the new master and records reconciliation when Planning Center fails', async () => {
    const testWorkspace = workspace(song());
    fs.writeFileSync(path.join(testWorkspace.chords, 'Test Song - Chord.doc'), 'old-chord');
    const client = api({
      createKeyAttachment: vi.fn().mockRejectedValue(new Error('Planning Center unavailable')),
    });

    await expect(
      runPublishWorkflow(
        song(),
        client,
        drive(testWorkspace),
        new TestPrompter(),
        options(testWorkspace),
      ),
    ).rejects.toThrow('Rerun publish to reconcile');

    expect(fs.readFileSync(path.join(testWorkspace.chords, 'Test Song - Chord.docx'), 'utf8')).toBe(
      'new-chord',
    );
    expect(fs.existsSync(path.join(testWorkspace.chords, 'Test Song - Chord.doc'))).toBe(false);
    const state = JSON.parse(
      fs.readFileSync(path.join(testWorkspace.state, 'test-song.json'), 'utf8'),
    );
    expect(state.status).toBe('needs-planning-center-reconciliation');
    expect(state.artifacts).toHaveLength(2);
  });

  it('refuses songs explicitly excluded from publishing', async () => {
    const testWorkspace = workspace(song({ title: 'God Is Good', skipPublish: true }));

    await expect(
      runPublishWorkflow(
        song({ title: 'God Is Good', skipPublish: true }),
        api(),
        drive(testWorkspace),
        new TestPrompter(),
        options(testWorkspace),
      ),
    ).rejects.toThrow('Publishing is disabled for this song: God Is Good');
  });
});
