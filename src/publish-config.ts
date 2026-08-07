import * as path from 'path';

export interface PublishConfig {
  googleDrive: {
    lyricDirectory: string;
    chordDirectory: string;
  };
  planningCenter: {
    clientId: string;
    secret: string;
    userAgent: string;
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} must be set in .env.local`);
  return value;
}

function expandDirectory(value: string, homeDirectory: string): string {
  const expanded =
    value === '~'
      ? homeDirectory
      : value.startsWith('~/')
        ? path.join(homeDirectory, value.slice(2))
        : value;
  return path.resolve(expanded);
}

/** Load machine-specific publishing destinations and Planning Center credentials. */
export function loadPublishConfig(
  env: NodeJS.ProcessEnv = process.env,
  homeDirectory = env.HOME ?? '',
): PublishConfig {
  if (!homeDirectory) throw new Error('HOME must be set to resolve publishing directories');

  return {
    googleDrive: {
      lyricDirectory: expandDirectory(required(env, 'GOOGLE_DRIVE_LYRIC_DIR'), homeDirectory),
      chordDirectory: expandDirectory(required(env, 'GOOGLE_DRIVE_CHORD_DIR'), homeDirectory),
    },
    planningCenter: {
      clientId: required(env, 'PLANNING_CENTER_CLIENT_ID'),
      secret: required(env, 'PLANNING_CENTER_SECRET'),
      userAgent: required(env, 'PLANNING_CENTER_USER_AGENT'),
    },
  };
}
