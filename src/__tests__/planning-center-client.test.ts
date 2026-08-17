import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlanningCenterClient, attachmentTypeMatches } from '../planning-center-client';

const temporaryDirectories: string[] = [];

function client(): PlanningCenterClient {
  return new PlanningCenterClient({
    clientId: 'client-id',
    secret: 'secret',
    userAgent: 'Music Publisher (test@example.com)',
  });
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('PlanningCenterClient', () => {
  it('searches by title with Basic auth and the configured User-Agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], links: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await client().searchSongs('A Test Song');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/songs?where%5Btitle%5D=A+Test+Song&per_page=100');
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe(
      `Basic ${Buffer.from('client-id:secret').toString('base64')}`,
    );
    expect(headers.get('User-Agent')).toBe('Music Publisher (test@example.com)');
  });

  it('uploads a .docx as the multipart file field', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ type: 'File', id: 'upload-123', attributes: {} }] }, 201),
      );
    vi.stubGlobal('fetch', fetchMock);
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pco-client-test-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'Song.docx');
    fs.writeFileSync(filePath, 'docx-content');

    await expect(client().uploadFile(filePath, 'Song.docx')).resolves.toBe('upload-123');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://upload.planningcenteronline.com/v2/files');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect((form.get('file') as File).name).toBe('Song.docx');
  });

  it('requests Attachment Type classification flags explicitly', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [], links: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await client().listAttachmentTypes();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      'fields%5BAttachmentType%5D=name%2Clyrics%2Cchord_charts%2Ccapoed_chord_charts',
    );
  });

  it('collects paginated Plan Items and included relationships', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'item-1', type: 'Item', attributes: { item_type: 'song', sequence: 1 } }],
          included: [{ id: 'song-1', type: 'Song', attributes: { title: 'Song' } }],
          links: { next: 'https://api.planningcenteronline.com/services/v2/next-page' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 'item-2', type: 'Item', attributes: { item_type: 'song', sequence: 2 } }],
          included: [{ id: 'song-1', type: 'Song', attributes: { title: 'Song' } }],
          links: { next: null },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await client().listPlanItems('service-1', 'plan-1');

    expect(result.items.map(({ id }) => id)).toEqual(['item-1', 'item-2']);
    expect(result.included.map(({ id }) => id)).toEqual(['song-1']);
    expect(fetchMock.mock.calls[0][0]).toContain('include=song%2Carrangement%2Ckey');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.planningcenteronline.com/services/v2/next-page',
    );
  });

  it('downloads an opened attachment without forwarding Planning Center credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'activity-1',
            type: 'AttachmentActivity',
            attributes: { attachment_url: 'https://cdn.example/chart.docx' },
          },
        }),
      )
      .mockResolvedValueOnce(new Response('document bytes'));
    vi.stubGlobal('fetch', fetchMock);

    const bytes = await client().downloadAttachment('/songs/song-1', 'attachment-1');

    expect(Buffer.from(bytes).toString()).toBe('document bytes');
    expect((fetchMock.mock.calls[0][1].headers as Headers).get('Authorization')).toBeTruthy();
    expect(fetchMock.mock.calls[1][1]).toBeUndefined();
  });

  it('updates a key attachment with its new upload and attachment type', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { type: 'Attachment', id: 'attachment-1', attributes: {} } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await client().updateKeyAttachment(
      'song-1',
      'arrangement-1',
      'key-1',
      'attachment-1',
      'upload-1',
      'Song - Chord.docx',
      'type-1',
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/keys/key-1/attachments/attachment-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      data: {
        type: 'Attachment',
        attributes: {
          file_upload_identifier: 'upload-1',
          filename: 'Song - Chord.docx',
        },
        relationships: {
          attachment_types: { data: [{ type: 'AttachmentType', id: 'type-1' }] },
        },
      },
    });
  });

  it('leaves attachment relationships unset when no classified type exists', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: { type: 'Attachment', id: 'attachment-1', attributes: {} } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await client().createArrangementAttachment(
      'song-1',
      'arrangement-1',
      'upload-1',
      'Song - Lyric.docx',
      undefined,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      data: {
        type: 'Attachment',
        attributes: {
          file_upload_identifier: 'upload-1',
          filename: 'Song - Lyric.docx',
        },
      },
    });
  });

  it('maps lyric, chord, and Capo artifacts to their flagged attachment types', () => {
    const type = {
      id: 'type-1',
      type: 'AttachmentType',
      attributes: {
        name: 'Capo Chord Chart',
        lyrics: false,
        chord_charts: true,
        capoed_chord_charts: true,
      },
    };

    expect(attachmentTypeMatches(type, 'capo')).toBe(true);
    expect(attachmentTypeMatches(type, 'chord')).toBe(false);
    expect(attachmentTypeMatches(type, 'lyric')).toBe(false);
  });
});
