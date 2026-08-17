import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface BinderConfig {
  outputDirectory: string;
  sofficePath: string;
}

export interface BinderResolveConfig {
  chordSheetsDirectory: string;
  fuzzyThreshold: number;
}

function directory(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} must be set in .env.local`);
  const resolved = path.resolve(value.replace(/^~(?=$|\/)/, os.homedir()));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`${key} is not an existing directory: ${resolved}`);
  }
  return resolved;
}

export function resolveSoffice(configured?: string): string {
  const candidates = [
    configured?.replace(/^~(?=$|\/)/, os.homedir()),
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    'soffice',
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (candidate === 'soffice') return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'soffice';
}

export function loadBinderResolveConfig(env: NodeJS.ProcessEnv = process.env): BinderResolveConfig {
  const fuzzyThreshold = Number(env.FUZZY_MATCH_THRESHOLD || '0.75');
  if (!Number.isFinite(fuzzyThreshold) || fuzzyThreshold < 0 || fuzzyThreshold > 1) {
    throw new Error(`FUZZY_MATCH_THRESHOLD must be between 0 and 1`);
  }
  return {
    chordSheetsDirectory: directory(env, 'CHORD_SHEETS_DIR'),
    fuzzyThreshold,
  };
}

export function loadBinderConfig(env: NodeJS.ProcessEnv = process.env): BinderConfig {
  return {
    outputDirectory: directory(env, 'BINDER_OUTPUT_DIR'),
    sofficePath: resolveSoffice(env.SOFFICE_PATH),
  };
}
