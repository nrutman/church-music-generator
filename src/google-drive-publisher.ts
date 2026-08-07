import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PublishArtifact, matchingWordFiles } from './publish-artifacts';

export interface DriveDirectories {
  lyricDirectory: string;
  chordDirectory: string;
}

export interface DrivePublishPlan {
  artifact: PublishArtifact;
  destinationDirectory: string;
  destinationPath: string;
  existingPaths: string[];
}

export interface StagedDrivePublish extends DrivePublishPlan {
  stagedPath: string;
  backups: { originalPath: string; backupPath: string }[];
  committed: boolean;
}

export class GoogleDrivePublisher {
  constructor(private readonly directories: DriveDirectories) {}

  plan(artifact: PublishArtifact): DrivePublishPlan {
    const destinationDirectory =
      artifact.kind === 'lyric' ? this.directories.lyricDirectory : this.directories.chordDirectory;
    if (!fs.statSync(destinationDirectory).isDirectory()) {
      throw new Error(`Google Drive destination is not a directory: ${destinationDirectory}`);
    }

    return {
      artifact,
      destinationDirectory,
      destinationPath: path.join(destinationDirectory, artifact.fileName),
      existingPaths: matchingWordFiles(destinationDirectory, artifact.stem),
    };
  }

  stage(plan: DrivePublishPlan, backupDirectory: string): StagedDrivePublish {
    fs.mkdirSync(backupDirectory, { recursive: true });
    const transactionId = randomUUID();
    const stagedPath = path.join(
      plan.destinationDirectory,
      `.${plan.artifact.fileName}.${transactionId}.publishing`,
    );
    fs.copyFileSync(plan.artifact.sourcePath, stagedPath);

    const backups = plan.existingPaths.map((originalPath, index) => {
      const backupPath = path.join(
        backupDirectory,
        `${plan.artifact.kind}-${index}-${path.basename(originalPath)}`,
      );
      fs.copyFileSync(originalPath, backupPath);
      return { originalPath, backupPath };
    });

    return { ...plan, stagedPath, backups, committed: false };
  }

  commit(staged: StagedDrivePublish): void {
    for (const existingPath of staged.existingPaths) fs.rmSync(existingPath, { force: true });
    fs.renameSync(staged.stagedPath, staged.destinationPath);
    staged.committed = true;
  }

  rollback(staged: StagedDrivePublish): void {
    fs.rmSync(staged.stagedPath, { force: true });
    if (!staged.committed) return;

    fs.rmSync(staged.destinationPath, { force: true });
    for (const backup of staged.backups) {
      fs.copyFileSync(backup.backupPath, backup.originalPath);
    }
    staged.committed = false;
  }
}
