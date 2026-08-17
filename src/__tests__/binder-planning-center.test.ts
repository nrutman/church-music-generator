import { describe, expect, it, vi } from 'vitest';
import { PlanningCenterBinderApi } from '../planning-center-client';
import { parsePicks, resolvePlanSongs } from '../binder/planning-center';

function resource(
  id: string,
  type: string,
  attributes: Record<string, unknown>,
  relationships = {},
) {
  return { id, type, attributes, relationships };
}

describe('binder Planning Center resolution', () => {
  it('parses item-specific picks', () => {
    expect([...parsePicks(['item-1=attachment-2'])]).toEqual([['item-1', 'attachment-2']]);
    expect(() => parsePicks(['broken'])).toThrow('Bad --pick');
  });

  it('prefers Key attachments, preserves sequence, and does not conflate repeated Songs', async () => {
    const items = [
      resource(
        'item-2',
        'Item',
        { item_type: 'song', sequence: 2, title: 'Song' },
        {
          song: { data: { type: 'Song', id: 'song-1' } },
          arrangement: { data: { type: 'Arrangement', id: 'arr-1' } },
          key: { data: { type: 'Key', id: 'key-2' } },
        },
      ),
      resource(
        'item-1',
        'Item',
        { item_type: 'song', sequence: 1, title: 'Song' },
        {
          song: { data: { type: 'Song', id: 'song-1' } },
          arrangement: { data: { type: 'Arrangement', id: 'arr-1' } },
          key: { data: { type: 'Key', id: 'key-1' } },
        },
      ),
    ];
    const attachments = [
      resource(
        'att-1',
        'Attachment',
        { filename: 'Song - Chord.docx' },
        {
          attachable: { data: { type: 'Key', id: 'key-1' } },
        },
      ),
      resource(
        'att-2',
        'Attachment',
        { filename: 'Song - Chord Capo.docx' },
        {
          attachable: { data: { type: 'Key', id: 'key-1' } },
        },
      ),
      resource(
        'att-3',
        'Attachment',
        { filename: 'Song - Chord.docx' },
        {
          attachable: { data: { type: 'Key', id: 'key-2' } },
        },
      ),
    ];
    const api = {
      listPlanItems: vi.fn().mockResolvedValue({
        items,
        included: [resource('song-1', 'Song', { title: 'Song' })],
      }),
      listPlanAttachments: vi.fn().mockResolvedValue(attachments),
    } as unknown as PlanningCenterBinderApi;

    const resolutions = await resolvePlanSongs(
      api,
      'service-1',
      'plan-1',
      parsePicks(['item-1=att-2']),
    );

    expect(resolutions.map(({ itemId }) => itemId)).toEqual(['item-1', 'item-2']);
    expect(resolutions.map(({ picked }) => picked?.id)).toEqual(['att-2', 'att-3']);
    expect(resolutions[0].pickedParentPath).toContain('/keys/key-1');
  });

  it('requires a choice when standard and Capo charts exist at different scopes', async () => {
    const item = resource(
      'item-1',
      'Item',
      { item_type: 'song', sequence: 1, title: 'Song' },
      {
        song: { data: { type: 'Song', id: 'song-1' } },
        arrangement: { data: { type: 'Arrangement', id: 'arr-1' } },
        key: { data: { type: 'Key', id: 'key-1' } },
      },
    );
    const api = {
      listPlanItems: vi.fn().mockResolvedValue({ items: [item], included: [] }),
      listPlanAttachments: vi.fn().mockResolvedValue([
        resource(
          'capo',
          'Attachment',
          { filename: 'Song - Chord Capo.docx' },
          {
            attachable: { data: { type: 'Key', id: 'key-1' } },
          },
        ),
        resource(
          'standard',
          'Attachment',
          { filename: 'Song - Chord.docx' },
          {
            attachable: { data: { type: 'Arrangement', id: 'arr-1' } },
          },
        ),
      ]),
    } as unknown as PlanningCenterBinderApi;

    const [resolution] = await resolvePlanSongs(api, 'service-1', 'plan-1');

    expect(resolution.picked).toBeUndefined();
    expect(resolution.chordCandidates.map(({ id }) => id)).toEqual(['capo', 'standard']);
  });

  it('rejects unused picks and malformed Song Items', async () => {
    const baseApi = {
      listPlanItems: vi.fn().mockResolvedValue({ items: [], included: [] }),
      listPlanAttachments: vi.fn().mockResolvedValue([]),
    } as unknown as PlanningCenterBinderApi;
    await expect(
      resolvePlanSongs(baseApi, 'service-1', 'plan-1', parsePicks(['unknown=attachment'])),
    ).rejects.toThrow('PCO_INVALID_PICK');

    const validItemApi = {
      listPlanItems: vi.fn().mockResolvedValue({
        items: [
          resource(
            'item-1',
            'Item',
            { item_type: 'song', sequence: 1 },
            {
              song: { data: { type: 'Song', id: 'song-1' } },
            },
          ),
        ],
        included: [],
      }),
      listPlanAttachments: vi.fn().mockResolvedValue([]),
    } as unknown as PlanningCenterBinderApi;
    await expect(
      resolvePlanSongs(validItemApi, 'service-1', 'plan-1', parsePicks(['item-1=missing'])),
    ).rejects.toThrow('PCO_INVALID_PICK');

    const invalidItemApi = {
      listPlanItems: vi.fn().mockResolvedValue({
        items: [resource('item-1', 'Item', { item_type: 'song', sequence: 1 })],
        included: [],
      }),
      listPlanAttachments: vi.fn().mockResolvedValue([]),
    } as unknown as PlanningCenterBinderApi;
    await expect(resolvePlanSongs(invalidItemApi, 'service-1', 'plan-1')).rejects.toThrow(
      'PCO_INVALID_PLAN_ITEM',
    );
  });
});
