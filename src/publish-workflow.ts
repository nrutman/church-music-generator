import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { GoogleDrivePublisher, DrivePublishPlan } from './google-drive-publisher';
import {
  attachmentTypeMatches,
  PlanningCenterApi,
  PlanningCenterArrangement,
  PlanningCenterAttachment,
  PlanningCenterAttachmentType,
  PlanningCenterKey,
  PlanningCenterSong,
} from './planning-center-client';
import {
  ccliNumberForSong,
  normalizedWordStem,
  PublishArtifact,
  publishArtifacts,
  validatePublishArtifacts,
} from './publish-artifacts';
import { PromptOption, PublishPrompter } from './publish-prompter';
import { Song } from './types';

const VALID_KEYS = new Set([
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Abm',
  'Am',
  'A#m',
  'Bbm',
  'Bm',
  'Cm',
  'C#m',
  'Dbm',
  'Dm',
  'D#m',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gbm',
  'Gm',
  'G#m',
]);

interface ResolvedSong {
  resource?: PlanningCenterSong;
  create: boolean;
}

interface ResolvedArrangement {
  resource?: PlanningCenterArrangement;
  create: boolean;
  name: string;
}

interface ResolvedKey {
  resource?: PlanningCenterKey;
  create: boolean;
}

interface ResolvedAttachment {
  artifact: PublishArtifact;
  type?: PlanningCenterAttachmentType;
  existing?: PlanningCenterAttachment;
  duplicates: PlanningCenterAttachment[];
}

export interface PublishWorkflowOptions {
  songFile: string;
  generatedDirectory: string;
  stateDirectory: string;
  dryRun: boolean;
  yes: boolean;
  chordsOnly?: boolean;
}

function normalizedTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function songLabel(song: PlanningCenterSong): string {
  const attributes = song.attributes;
  const details = [
    attributes.author ? `by ${attributes.author}` : undefined,
    attributes.ccli_number ? `CCLI ${attributes.ccli_number}` : undefined,
    attributes.copyright,
  ].filter(Boolean);
  const link = song.links?.self ? ` — ${song.links.self}` : '';
  return `${attributes.title}${details.length ? ` (${details.join('; ')})` : ''}${link}`;
}

function resourceOptions<T extends { attributes: { name: string } }>(
  resources: T[],
): PromptOption<T>[] {
  return resources.map((resource) => ({ label: resource.attributes.name, value: resource }));
}

function keyOptions(keys: PlanningCenterKey[]): PromptOption<PlanningCenterKey>[] {
  return keys.map((key) => ({
    label: key.attributes.name ?? key.attributes.starting_key,
    value: key,
  }));
}

function songIdFromInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.match(/\/songs\/(\d+)/)?.[1];
}

function attachmentMatches(
  attachment: PlanningCenterAttachment,
  artifact: PublishArtifact,
): boolean {
  return normalizedWordStem(attachment.attributes.filename) === artifact.stem.toLocaleLowerCase();
}

function sha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function resolveSong(
  client: PlanningCenterApi,
  song: Song,
  prompter: PublishPrompter,
): Promise<ResolvedSong> {
  const candidates = await client.searchSongs(song.title);
  const exact = candidates.filter(
    (candidate) => normalizedTitle(candidate.attributes.title) === normalizedTitle(song.title),
  );
  if (exact.length === 1) return { resource: exact[0], create: false };
  if (exact.length > 1) {
    return {
      resource: await prompter.choose(
        `Multiple Planning Center songs are named “${song.title}”. Which one should be updated?`,
        exact.map((candidate) => ({ label: songLabel(candidate), value: candidate })),
      ),
      create: false,
    };
  }

  const action = await prompter.choose<'candidate' | 'manual' | 'create' | 'cancel'>(
    `No exact Planning Center match was found for “${song.title}”. Is this a new song?`,
    [
      ...(candidates.length
        ? [
            {
              label: 'Select one of the similar Planning Center songs',
              value: 'candidate' as const,
            },
          ]
        : []),
      { label: 'Enter an existing Planning Center Song URL or ID', value: 'manual' },
      {
        label: 'Create a new Song, default Arrangement, performed Key, and files',
        value: 'create',
      },
      { label: 'Cancel without publishing', value: 'cancel' },
    ],
  );

  if (action === 'cancel') throw new Error('Publishing cancelled');
  if (action === 'create') return { create: true };
  if (action === 'candidate') {
    return {
      resource: await prompter.choose(
        'Which existing Planning Center song should be updated?',
        candidates.map((candidate) => ({ label: songLabel(candidate), value: candidate })),
      ),
      create: false,
    };
  }

  const input = await prompter.input('Planning Center Song URL or ID:');
  const id = songIdFromInput(input);
  if (!id) throw new Error('Could not read a Planning Center Song ID from that value');
  return { resource: await client.getSong(id), create: false };
}

async function resolveArrangement(
  client: PlanningCenterApi,
  song: ResolvedSong,
  requestedName: string | undefined,
  prompter: PublishPrompter,
): Promise<ResolvedArrangement> {
  const targetName = requestedName?.trim() || 'Default Arrangement';
  if (song.create) return { create: true, name: targetName };
  const arrangements = await client.listArrangements(song.resource!.id);
  if (requestedName) {
    const matching = arrangements.filter(
      (arrangement) => normalizedTitle(arrangement.attributes.name) === normalizedTitle(targetName),
    );
    if (matching.length === 1) {
      return { resource: matching[0], create: false, name: matching[0].attributes.name };
    }
    if (matching.length > 1) {
      const resource = await prompter.choose(
        `Multiple Arrangements are named “${targetName}”. Which one should receive the files?`,
        resourceOptions(matching),
      );
      return { resource, create: false, name: resource.attributes.name };
    }
    if (!(await prompter.confirm(`No Arrangement named “${targetName}” exists. Create it?`))) {
      throw new Error('Publishing cancelled');
    }
    return { create: true, name: targetName };
  }
  if (arrangements.length === 1) {
    return { resource: arrangements[0], create: false, name: arrangements[0].attributes.name };
  }
  if (arrangements.length > 1) {
    const resource = await prompter.choose(
      'Which arrangement should receive the lyric and chord files?',
      resourceOptions(arrangements),
    );
    return {
      resource,
      create: false,
      name: resource.attributes.name,
    };
  }
  if (!(await prompter.confirm('This Song has no Arrangements. Create “Default Arrangement”?'))) {
    throw new Error('Publishing cancelled');
  }
  return { create: true, name: 'Default Arrangement' };
}

async function resolveKey(
  client: PlanningCenterApi,
  song: ResolvedSong,
  arrangement: ResolvedArrangement,
  performedKey: string,
  prompter: PublishPrompter,
): Promise<ResolvedKey> {
  if (song.create || arrangement.create) return { create: true };
  const keys = await client.listKeys(song.resource!.id, arrangement.resource!.id);
  const matching = keys.filter((key) => key.attributes.starting_key === performedKey);
  if (matching.length === 1) return { resource: matching[0], create: false };
  if (matching.length > 1) {
    return {
      resource: await prompter.choose(
        `Multiple Arrangement Keys start in ${performedKey}. Which one should receive the charts?`,
        keyOptions(matching),
      ),
      create: false,
    };
  }
  if (!(await prompter.confirm(`No ${performedKey} Key exists. Create it?`))) {
    throw new Error('Publishing cancelled');
  }
  return { create: true };
}

async function selectAttachmentType(
  artifact: PublishArtifact,
  types: PlanningCenterAttachmentType[],
  prompter: PublishPrompter,
): Promise<PlanningCenterAttachmentType | undefined> {
  const matching = types.filter((type) => attachmentTypeMatches(type, artifact.kind));
  if (matching.length === 1) return matching[0];
  if (!matching.length) {
    console.log(
      `  Note: no ${artifact.kind} Attachment Type is configured; ${artifact.fileName} will remain untyped.`,
    );
    return undefined;
  }
  return prompter.choose(
    `Which Planning Center Attachment Type should be used for ${artifact.fileName}?`,
    resourceOptions(matching),
  );
}

async function resolveAttachments(
  client: PlanningCenterApi,
  song: ResolvedSong,
  arrangement: ResolvedArrangement,
  key: ResolvedKey,
  artifacts: PublishArtifact[],
  prompter: PublishPrompter,
): Promise<ResolvedAttachment[]> {
  const types = await client.listAttachmentTypes();
  let arrangementAttachments: PlanningCenterAttachment[] = [];
  let keyAttachments: PlanningCenterAttachment[] = [];
  if (!song.create && !arrangement.create) {
    arrangementAttachments = await client.listArrangementAttachments(
      song.resource!.id,
      arrangement.resource!.id,
    );
    if (!key.create) {
      keyAttachments = await client.listKeyAttachments(
        song.resource!.id,
        arrangement.resource!.id,
        key.resource!.id,
      );
    }
  }

  const resolved: ResolvedAttachment[] = [];
  const claimedAttachmentIds = new Set<string>();
  for (const artifact of artifacts) {
    const available = artifact.kind === 'lyric' ? arrangementAttachments : keyAttachments;
    const existing = available.filter(
      (attachment) =>
        !claimedAttachmentIds.has(attachment.id) && attachmentMatches(attachment, artifact),
    );
    let selected: PlanningCenterAttachment | undefined = existing[0];
    if (existing.length > 1) {
      selected = await prompter.choose(
        `Multiple Planning Center attachments match ${artifact.stem}. Which one should remain?`,
        existing.map((attachment) => ({
          label: `${attachment.attributes.filename} (ID ${attachment.id})`,
          value: attachment,
        })),
      );
    }
    if (!selected) {
      const legacyCandidates = available.filter(
        (attachment) =>
          !claimedAttachmentIds.has(attachment.id) &&
          normalizedWordStem(attachment.attributes.filename) !== undefined,
      );
      if (legacyCandidates.length) {
        selected = await prompter.choose<PlanningCenterAttachment | undefined>(
          `No exact Planning Center attachment matches ${artifact.fileName}. Replace a legacy file?`,
          [
            { label: 'Create a new attachment', value: undefined },
            ...legacyCandidates.map((attachment) => ({
              label: `${attachment.attributes.filename} (ID ${attachment.id})`,
              value: attachment,
            })),
          ],
        );
      }
    }
    if (selected) claimedAttachmentIds.add(selected.id);
    resolved.push({
      artifact,
      type: await selectAttachmentType(artifact, types, prompter),
      existing: selected,
      duplicates: existing.filter((attachment) => attachment.id !== selected?.id),
    });
  }
  return resolved;
}

function printPlan(
  song: Song,
  drivePlans: DrivePublishPlan[],
  resolvedSong: ResolvedSong,
  arrangement: ResolvedArrangement,
  key: ResolvedKey,
  attachments: ResolvedAttachment[],
): void {
  console.log(`\nPublish plan for “${song.title}”`);
  console.log('\nGoogle Drive (master):');
  for (const plan of drivePlans) {
    const action = plan.existingPaths.length
      ? `replace ${plan.existingPaths.map((existingPath) => path.basename(existingPath)).join(', ')}`
      : 'create';
    console.log(`  - ${plan.artifact.fileName}: ${action}`);
  }

  console.log('\nPlanning Center (mirror):');
  console.log(
    `  - Song: ${resolvedSong.create ? `create “${song.title}”` : `update ${songLabel(resolvedSong.resource!)}`}`,
  );
  console.log(
    `  - Arrangement: ${arrangement.create ? `create “${arrangement.name}”` : arrangement.resource!.attributes.name}`,
  );
  console.log(
    `  - Performed Key: ${key.create ? `create ${song.key}` : (key.resource!.attributes.name ?? key.resource!.attributes.starting_key)}`,
  );
  for (const attachment of attachments) {
    const action = attachment.existing ? `replace ID ${attachment.existing.id}` : 'create';
    console.log(
      `  - ${attachment.artifact.fileName}: ${action}; type ${attachment.type?.attributes.name ?? 'untyped'}`,
    );
    if (attachment.duplicates.length) {
      console.log(
        `    delete ${attachment.duplicates.length} duplicate attachment(s) after update`,
      );
    }
  }
}

async function publishPlanningCenterAttachment(
  client: PlanningCenterApi,
  song: PlanningCenterSong,
  arrangement: PlanningCenterArrangement,
  key: PlanningCenterKey,
  attachment: ResolvedAttachment,
  uploadIdentifier: string,
): Promise<void> {
  const fileName = attachment.artifact.fileName;
  const typeId = attachment.type?.id;
  if (attachment.artifact.kind === 'lyric') {
    if (attachment.existing) {
      await client.updateArrangementAttachment(
        song.id,
        arrangement.id,
        attachment.existing.id,
        uploadIdentifier,
        fileName,
        typeId,
      );
    } else {
      await client.createArrangementAttachment(
        song.id,
        arrangement.id,
        uploadIdentifier,
        fileName,
        typeId,
      );
    }
    for (const duplicate of attachment.duplicates) {
      await client.deleteArrangementAttachment(song.id, arrangement.id, duplicate.id);
    }
    return;
  }

  if (attachment.existing) {
    await client.updateKeyAttachment(
      song.id,
      arrangement.id,
      key.id,
      attachment.existing.id,
      uploadIdentifier,
      fileName,
      typeId,
    );
  } else {
    await client.createKeyAttachment(
      song.id,
      arrangement.id,
      key.id,
      uploadIdentifier,
      fileName,
      typeId,
    );
  }
  for (const duplicate of attachment.duplicates) {
    await client.deleteKeyAttachment(song.id, arrangement.id, key.id, duplicate.id);
  }
}

export async function runPublishWorkflow(
  song: Song,
  client: PlanningCenterApi,
  drive: GoogleDrivePublisher,
  prompter: PublishPrompter,
  options: PublishWorkflowOptions,
): Promise<void> {
  if (song.skipPublish === true) {
    throw new Error(`Publishing is disabled for this song: ${song.title}`);
  }
  if (!song.key || !VALID_KEYS.has(song.key)) {
    throw new Error(`Song must define a valid performed key before publishing: ${song.title}`);
  }

  const artifacts = publishArtifacts(song, options.generatedDirectory, {
    chordsOnly: options.chordsOnly,
  });
  validatePublishArtifacts(artifacts, options.songFile);
  const drivePlans = artifacts.map((artifact) => drive.plan(artifact));
  const resolvedSong = await resolveSong(client, song, prompter);
  const arrangement = await resolveArrangement(
    client,
    resolvedSong,
    song.planningCenterArrangement,
    prompter,
  );
  const key = await resolveKey(client, resolvedSong, arrangement, song.key, prompter);
  const attachments = await resolveAttachments(
    client,
    resolvedSong,
    arrangement,
    key,
    artifacts,
    prompter,
  );

  printPlan(song, drivePlans, resolvedSong, arrangement, key, attachments);
  if (options.dryRun) {
    console.log('\nDry run complete. Nothing was changed.');
    return;
  }
  if (!options.yes && !(await prompter.confirm('Publish these files now?'))) {
    throw new Error('Publishing cancelled');
  }

  fs.mkdirSync(options.stateDirectory, { recursive: true });
  const statePath = path.join(
    options.stateDirectory,
    `${path.basename(options.songFile, '.json')}.json`,
  );
  if (fs.existsSync(statePath)) {
    console.log(
      '\nAn incomplete publish was found. This run will reconcile it to the current files.',
    );
  }
  const transactionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-publish-'));
  const stagedDrive = [];
  const uploads = new Map<string, string>();
  try {
    for (const plan of drivePlans) stagedDrive.push(drive.stage(plan, transactionDirectory));
    for (const attachment of attachments) {
      uploads.set(
        attachment.artifact.kind,
        await client.uploadFile(attachment.artifact.sourcePath, attachment.artifact.fileName),
      );
    }
  } catch (error) {
    for (const staged of stagedDrive.reverse()) drive.rollback(staged);
    fs.rmSync(transactionDirectory, { recursive: true, force: true });
    throw error;
  }

  const state = {
    song: song.title,
    startedAt: new Date().toISOString(),
    artifacts: artifacts.map((artifact) => ({
      fileName: artifact.fileName,
      sha256: sha256(artifact.sourcePath),
    })),
    status: 'publishing',
    error: undefined as string | undefined,
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  try {
    for (const staged of stagedDrive) drive.commit(staged);
  } catch (error) {
    for (const staged of stagedDrive.reverse()) drive.rollback(staged);
    fs.rmSync(statePath, { force: true });
    fs.rmSync(transactionDirectory, { recursive: true, force: true });
    throw error;
  }

  try {
    const publishedSong = resolvedSong.create
      ? await client.createSong(song, ccliNumberForSong(song))
      : resolvedSong.resource!;
    let publishedArrangement = arrangement.resource;
    if (arrangement.create) {
      const existing = await client.listArrangements(publishedSong.id);
      publishedArrangement =
        existing.find(
          (candidate) =>
            normalizedTitle(candidate.attributes.name) === normalizedTitle(arrangement.name),
        ) ?? (await client.createArrangement(publishedSong.id, arrangement.name));
    }
    let publishedKey = key.resource;
    if (key.create) {
      const existing = await client.listKeys(publishedSong.id, publishedArrangement!.id);
      publishedKey =
        existing.find((candidate) => candidate.attributes.starting_key === song.key) ??
        (await client.createKey(publishedSong.id, publishedArrangement!.id, song.key));
    }

    for (const attachment of attachments) {
      await publishPlanningCenterAttachment(
        client,
        publishedSong,
        publishedArrangement!,
        publishedKey!,
        attachment,
        uploads.get(attachment.artifact.kind)!,
      );
    }

    for (const staged of stagedDrive) {
      if (sha256(staged.destinationPath) !== sha256(staged.artifact.sourcePath)) {
        throw new Error(`Google Drive verification failed for ${staged.artifact.fileName}`);
      }
    }
    fs.rmSync(statePath, { force: true });
    fs.rmSync(transactionDirectory, { recursive: true, force: true });
    console.log('\nPublish complete. Google Drive and Planning Center are synchronized.');
  } catch (error) {
    state.status = 'needs-planning-center-reconciliation';
    state.error = error instanceof Error ? error.message : String(error);
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    fs.rmSync(transactionDirectory, { recursive: true, force: true });
    throw new Error(
      `Google Drive may contain the new files, but Planning Center did not finish. Rerun publish to reconcile. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
