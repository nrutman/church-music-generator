import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildBinder } from './build';
import { loadBinderConfig, loadBinderResolveConfig } from './config';
import { findChordSheetFiles, matchTitle } from './fuzzy';
import { BinderPageCountError } from './pdf';
import {
  downloadResolvedSongs,
  parsePicks,
  PlanningCenterResolutionError,
  resolvePlanSongs,
  selectPlan,
  selectServiceType,
  SongResolution,
} from './planning-center';
import { PlanningCenterClient } from '../planning-center-client';

interface ParsedOptions {
  values: Map<string, string[]>;
  positional: string[];
}

function parseOptions(args: string[]): ParsedOptions {
  const values = new Map<string, string[]>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
    values.set(arg.slice(2), [...(values.get(arg.slice(2)) ?? []), value]);
    index += 1;
  }
  return { values, positional };
}

function value(options: ParsedOptions, key: string): string | undefined {
  const values = options.values.get(key);
  return values?.[values.length - 1];
}

function planningCenterClient(): PlanningCenterClient {
  const clientId = process.env.PLANNING_CENTER_CLIENT_ID?.trim();
  const secret = process.env.PLANNING_CENTER_SECRET?.trim();
  const userAgent = process.env.PLANNING_CENTER_USER_AGENT?.trim();
  const missing = [
    !clientId && 'PLANNING_CENTER_CLIENT_ID',
    !secret && 'PLANNING_CENTER_SECRET',
    !userAgent && 'PLANNING_CENTER_USER_AGENT',
  ].filter(Boolean);
  if (missing.length)
    throw new Error(`Missing Planning Center configuration: ${missing.join(', ')}`);
  return new PlanningCenterClient({ clientId: clientId!, secret: secret!, userAgent: userAgent! });
}

function printResolutions(resolutions: SongResolution[]): boolean {
  let complete = true;
  for (const resolution of resolutions) {
    console.log(
      `[${resolution.sequence}] ${resolution.songTitle} (item_id=${resolution.itemId}, song_id=${resolution.songId})`,
    );
    if (resolution.picked) {
      console.log(
        `  ✓ ${resolution.picked.attributes.filename} (attachment_id=${resolution.picked.id}, ${resolution.pickSource})`,
      );
    } else {
      complete = false;
      const candidates = resolution.chordCandidates.length
        ? resolution.chordCandidates
        : resolution.documentCandidates;
      console.log(
        resolution.chordCandidates.length
          ? `  ⚠ ${candidates.length} chord attachment(s) on ${resolution.chordSource}; pick one:`
          : '  ⚠ no unique chord attachment; available Word documents:',
      );
      for (const candidate of candidates) {
        console.log(
          `    --pick ${resolution.itemId}=${candidate.id}  ${candidate.attributes.filename}`,
        );
      }
    }
  }
  return complete;
}

async function resolvePlanningCenter(options: ParsedOptions) {
  const client = planningCenterClient();
  const date = value(options, 'date');
  if (!date) throw new Error('--date is required');
  const serviceType = await selectServiceType(
    client,
    value(options, 'service-type'),
    process.env.PLANNING_CENTER_DEFAULT_SERVICE_TYPE_ID?.trim() || undefined,
  );
  const plan = await selectPlan(client, serviceType.id, date, value(options, 'plan-id'));
  const resolutions = await resolvePlanSongs(
    client,
    serviceType.id,
    plan.id,
    parsePicks(options.values.get('pick') ?? []),
  );
  console.log(`Service Type: ${serviceType.attributes.name} (${serviceType.id})`);
  console.log(`Plan: ${plan.attributes.title || '(untitled)'} (${plan.id})\n`);
  return { client, plan, resolutions, date };
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const options = parseOptions(args);
  if (command === 'resolve') {
    const config = loadBinderResolveConfig();
    if (!options.positional.length) throw new Error('Provide at least one song title');
    const files = findChordSheetFiles(config.chordSheetsDirectory);
    for (const title of options.positional) {
      const result = matchTitle(title, files, config.fuzzyThreshold);
      console.log(`${JSON.stringify(title)} — ${result.candidates.length} candidate(s):`);
      for (const candidate of result.candidates) {
        console.log(`  ${candidate.score.toFixed(2)}  ${candidate.filePath}`);
      }
      if (!result.candidates.length) {
        console.log('  (none)');
        for (const suggestion of result.suggestions) {
          console.log(`  suggestion ${suggestion.score.toFixed(2)}  ${suggestion.filePath}`);
        }
      }
    }
    return;
  }
  if (command === 'build') {
    const config = loadBinderConfig();
    const name = value(options, 'name') ?? `Binder ${new Date().toISOString().slice(0, 10)}`;
    const result = await buildBinder(
      options.positional.map((file) => path.resolve(file)),
      name,
      config,
    );
    console.log(`Wrote ${result.outputPath}`);
    for (const placement of result.placements) {
      if (placement.trimmed) {
        console.log(
          `⚠ ${path.basename(placement.sourcePath)}: trimmed ${placement.trimmed} trailing chrome-only page(s)`,
        );
      }
      console.log(
        `${placement.binderStart}-${placement.binderEnd}  ${path.basename(placement.sourcePath)}`,
      );
    }
    return;
  }
  if (command === 'pco-resolve') {
    const { resolutions } = await resolvePlanningCenter(options);
    if (!printResolutions(resolutions)) {
      throw new PlanningCenterResolutionError(
        'PCO_AMBIGUOUS_ATTACHMENT',
        'Some songs require an item-specific --pick',
      );
    }
    return;
  }
  if (command === 'pco-build') {
    const { client, resolutions, date } = await resolvePlanningCenter(options);
    const config = loadBinderConfig();
    if (!printResolutions(resolutions)) {
      throw new PlanningCenterResolutionError(
        'PCO_AMBIGUOUS_ATTACHMENT',
        'Some songs require an item-specific --pick',
      );
    }
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-binder-pco-'));
    try {
      const files = await downloadResolvedSongs(client, resolutions, temporaryDirectory);
      const result = await buildBinder(files, value(options, 'name') ?? `Binder ${date}`, config);
      console.log(`Wrote ${result.outputPath}`);
      for (const placement of result.placements.filter(({ trimmed }) => trimmed)) {
        console.log(
          `⚠ ${path.basename(placement.sourcePath)}: trimmed ${placement.trimmed} trailing chrome-only page(s)`,
        );
      }
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
    return;
  }
  if (command === 'doctor') {
    const client = planningCenterClient();
    const types = await client.listServiceTypes();
    console.log(`✓ Planning Center authentication; ${types.length} Service Type(s)`);
    for (const type of types) console.log(`  ${type.id}  ${type.attributes.name}`);
    return;
  }
  throw new Error('Usage: binder <resolve|build|pco-resolve|pco-build|doctor> [arguments]');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof BinderPageCountError) process.exitCode = 4;
  else if (error instanceof PlanningCenterResolutionError) process.exitCode = 6;
  else if (/must be set|Missing Planning Center|not an existing directory/.test(String(error))) {
    process.exitCode = 2;
  } else if (/ENOENT.*(soffice|pdftotext)/.test(String(error))) process.exitCode = 3;
  else process.exitCode = 5;
});
