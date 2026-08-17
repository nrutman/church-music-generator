import * as fs from 'fs';
import * as path from 'path';
import {
  PlanningCenterAttachment,
  PlanningCenterBinderApi,
  PlanningCenterPlan,
  PlanningCenterPlanItem,
  PlanningCenterServiceType,
} from '../planning-center-client';

export interface SongResolution {
  sequence: number;
  itemId: string;
  songId: string;
  songTitle: string;
  arrangementId?: string;
  keyId?: string;
  chordCandidates: PlanningCenterAttachment[];
  chordSource?: 'Key' | 'Arrangement' | 'Song';
  documentCandidates: PlanningCenterAttachment[];
  picked?: PlanningCenterAttachment;
  pickSource?: 'auto' | 'pick';
  pickedParentPath?: string;
}

export class PlanningCenterResolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly candidates: unknown[] = [],
  ) {
    super(`${code}: ${message}`);
  }
}

export function parsePicks(values: string[]): Map<string, string> {
  const picks = new Map<string, string>();
  for (const value of values) {
    const separator = value.indexOf('=');
    const key = value.slice(0, separator).trim();
    const attachmentId = value.slice(separator + 1).trim();
    if (separator < 1 || !attachmentId) throw new Error(`Bad --pick value: ${value}`);
    picks.set(key, attachmentId);
  }
  return picks;
}

export async function selectServiceType(
  client: PlanningCenterBinderApi,
  requestedId?: string,
  defaultId?: string,
): Promise<PlanningCenterServiceType> {
  if (requestedId || defaultId) return client.getServiceType(requestedId ?? defaultId!);
  const active = (await client.listServiceTypes()).filter(
    ({ attributes }) => !attributes.archived_at,
  );
  if (active.length === 1) return active[0];
  throw new PlanningCenterResolutionError(
    active.length ? 'PCO_AMBIGUOUS_SERVICE_TYPE' : 'PCO_NO_SERVICE_TYPES',
    active.length ? 'Multiple active Service Types exist' : 'No active Service Types exist',
    active,
  );
}

export async function selectPlan(
  client: PlanningCenterBinderApi,
  serviceTypeId: string,
  isoDate: string,
  planId?: string,
): Promise<PlanningCenterPlan> {
  if (planId) return client.getPlan(serviceTypeId, planId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`Bad --date value: ${isoDate}`);
  const dayBefore = new Date(`${isoDate}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  const matches = (await client.listPlans(serviceTypeId, dayBefore.toISOString())).filter(
    ({ attributes }) => attributes.sort_date.startsWith(isoDate),
  );
  if (matches.length === 1) return matches[0];
  throw new PlanningCenterResolutionError(
    matches.length ? 'PCO_AMBIGUOUS_PLAN' : 'PCO_NO_PLAN_FOR_DATE',
    matches.length ? `Multiple Plans exist on ${isoDate}` : `No Plan exists on ${isoDate}`,
    matches,
  );
}

export function isWordAttachment(attachment: PlanningCenterAttachment): boolean {
  return /\.docx?$/i.test(attachment.attributes.filename || '');
}

export function isChordAttachment(attachment: PlanningCenterAttachment): boolean {
  return (
    isWordAttachment(attachment) &&
    /chord/i.test(`${attachment.attributes.filename} ${attachment.attributes.display_name ?? ''}`)
  );
}

function isCapoAttachment(attachment: PlanningCenterAttachment): boolean {
  return /capo/i.test(
    `${attachment.attributes.filename} ${attachment.attributes.display_name ?? ''}`,
  );
}

function relationshipId(item: PlanningCenterPlanItem, name: string): string | undefined {
  return item.relationships?.[name]?.data?.id;
}

function parentPath(
  attachment: PlanningCenterAttachment,
  songId: string,
  arrangementId?: string,
): string | undefined {
  const attachable = attachment.relationships?.attachable?.data;
  if (!attachable) return undefined;
  if (attachable.type === 'Key' && arrangementId) {
    return `/songs/${songId}/arrangements/${arrangementId}/keys/${attachable.id}`;
  }
  if (attachable.type === 'Arrangement') return `/songs/${songId}/arrangements/${attachable.id}`;
  if (attachable.type === 'Song') return `/songs/${attachable.id}`;
  return undefined;
}

export async function resolvePlanSongs(
  client: PlanningCenterBinderApi,
  serviceTypeId: string,
  planId: string,
  picks = new Map<string, string>(),
): Promise<SongResolution[]> {
  const { items, included } = await client.listPlanItems(serviceTypeId, planId);
  const songs = new Map(
    included.filter(({ type }) => type === 'Song').map((song) => [song.id, song]),
  );
  const attachments = await client.listPlanAttachments(serviceTypeId, planId);
  const byAttachable = new Map<string, PlanningCenterAttachment[]>();
  for (const attachment of attachments) {
    const attachable = attachment.relationships?.attachable?.data;
    if (!attachable) continue;
    const key = `${attachable.type}:${attachable.id}`;
    byAttachable.set(key, [...(byAttachable.get(key) ?? []), attachment]);
  }
  const songItems = items
    .filter(({ attributes }) => attributes.item_type === 'song')
    .sort((left, right) => left.attributes.sequence - right.attributes.sequence);
  const songIdCounts = new Map<string, number>();
  for (const item of songItems) {
    const songId = relationshipId(item, 'song');
    if (songId) songIdCounts.set(songId, (songIdCounts.get(songId) ?? 0) + 1);
  }

  const usedPickKeys = new Set<string>();
  const resolutions = songItems.map<SongResolution>((item) => {
    const songId = relationshipId(item, 'song');
    if (!songId) {
      throw new PlanningCenterResolutionError(
        'PCO_INVALID_PLAN_ITEM',
        `Song Item ${item.id} has no Song relationship`,
      );
    }
    const arrangementId = relationshipId(item, 'arrangement');
    const keyId = relationshipId(item, 'key');
    const levels: Array<[SongResolution['chordSource'], PlanningCenterAttachment[]]> = [
      ['Key', keyId ? (byAttachable.get(`Key:${keyId}`) ?? []) : []],
      [
        'Arrangement',
        arrangementId ? (byAttachable.get(`Arrangement:${arrangementId}`) ?? []) : [],
      ],
      ['Song', byAttachable.get(`Song:${songId}`) ?? []],
    ];
    const best = levels.find(([, values]) => values.some(isChordAttachment));
    const bestCandidates = (best?.[1] ?? []).filter(isChordAttachment);
    const allChordCandidates = levels
      .flatMap(([, values]) => values)
      .filter(isChordAttachment)
      .filter(
        (attachment, index, all) => all.findIndex(({ id }) => id === attachment.id) === index,
      );
    const hasCapoChoice = allChordCandidates.some(isCapoAttachment);
    const hasStandardChoice = allChordCandidates.some(
      (attachment) => !isCapoAttachment(attachment),
    );
    const chordCandidates =
      hasCapoChoice && hasStandardChoice ? allChordCandidates : bestCandidates;
    const documentCandidates = levels
      .flatMap(([, values]) => values)
      .filter(isWordAttachment)
      .filter(
        (attachment, index, all) => all.findIndex(({ id }) => id === attachment.id) === index,
      );
    let requestedAttachmentId = picks.get(item.id);
    let requestedPickKey = requestedAttachmentId ? item.id : undefined;
    if (!requestedAttachmentId && (songIdCounts.get(songId) ?? 0) === 1) {
      requestedAttachmentId = picks.get(songId);
      if (requestedAttachmentId) requestedPickKey = songId;
    }
    let picked = requestedAttachmentId
      ? documentCandidates.find(({ id }) => id === requestedAttachmentId)
      : chordCandidates.length === 1
        ? chordCandidates[0]
        : undefined;
    if (requestedAttachmentId && !picked) {
      throw new PlanningCenterResolutionError(
        'PCO_INVALID_PICK',
        `Attachment ${requestedAttachmentId} is not a Word attachment available to Item ${item.id}`,
      );
    }
    if (requestedPickKey) usedPickKeys.add(requestedPickKey);
    let pickedParentPath = picked ? parentPath(picked, songId, arrangementId) : undefined;
    if (!pickedParentPath) picked = undefined;
    return {
      sequence: item.attributes.sequence,
      itemId: item.id,
      songId,
      songTitle: String(
        songs.get(songId)?.attributes.title ?? item.attributes.title ?? '(untitled)',
      ),
      arrangementId,
      keyId,
      chordCandidates,
      chordSource: best?.[0],
      documentCandidates,
      picked,
      pickSource: picked ? (requestedAttachmentId ? 'pick' : 'auto') : undefined,
      pickedParentPath: picked ? pickedParentPath : undefined,
    };
  });
  const unusedPicks = [...picks.keys()].filter((key) => !usedPickKeys.has(key));
  if (unusedPicks.length) {
    throw new PlanningCenterResolutionError(
      'PCO_INVALID_PICK',
      `No unambiguous Plan Item matches pick key(s): ${unusedPicks.join(', ')}`,
    );
  }
  return resolutions;
}

export async function downloadResolvedSongs(
  client: PlanningCenterBinderApi,
  resolutions: SongResolution[],
  outputDirectory: string,
): Promise<string[]> {
  const used = new Set<string>();
  const files: string[] = [];
  for (const resolution of resolutions) {
    if (!resolution.picked || !resolution.pickedParentPath) {
      throw new PlanningCenterResolutionError('PCO_AMBIGUOUS_ATTACHMENT', resolution.songTitle);
    }
    const parsed = path.parse(
      resolution.picked.attributes.filename || `attachment-${resolution.picked.id}`,
    );
    let name = `${parsed.name}${parsed.ext}`;
    let suffix = 2;
    while (used.has(name.toLocaleLowerCase())) name = `${parsed.name} (${suffix++})${parsed.ext}`;
    used.add(name.toLocaleLowerCase());
    const filePath = path.join(outputDirectory, name);
    fs.writeFileSync(
      filePath,
      await client.downloadAttachment(resolution.pickedParentPath, resolution.picked.id),
    );
    files.push(filePath);
  }
  return files;
}
