#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { GoogleDrivePublisher } from './google-drive-publisher';
import { PlanningCenterClient } from './planning-center-client';
import { loadPublishConfig } from './publish-config';
import { ConsolePublishPrompter } from './publish-prompter';
import { runPublishWorkflow } from './publish-workflow';
import { Song } from './types';

function usage(): never {
  console.error('Usage: pnpm publish-song <song.json> [--dry-run] [--yes] [--chords-only]');
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const songArgument = args.find((argument) => !argument.startsWith('--'));
  if (!songArgument) usage();
  const unknown = args.filter(
    (argument) =>
      argument.startsWith('--') &&
      argument !== '--dry-run' &&
      argument !== '--yes' &&
      argument !== '--chords-only',
  );
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(', ')}`);

  const rootDirectory = path.resolve(__dirname, '..');
  const songFile = path.resolve(rootDirectory, songArgument);
  if (!fs.existsSync(songFile)) throw new Error(`Song JSON not found: ${songFile}`);

  const song = JSON.parse(fs.readFileSync(songFile, 'utf8')) as Song;
  const config = loadPublishConfig();
  const client = new PlanningCenterClient(config.planningCenter);
  const drive = new GoogleDrivePublisher(config.googleDrive);
  const prompter = new ConsolePublishPrompter();
  try {
    await runPublishWorkflow(song, client, drive, prompter, {
      songFile,
      generatedDirectory: path.join(rootDirectory, 'generated'),
      stateDirectory: path.join(rootDirectory, '.publish-state'),
      dryRun: args.includes('--dry-run'),
      yes: args.includes('--yes'),
      chordsOnly: args.includes('--chords-only'),
    });
  } finally {
    prompter.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
