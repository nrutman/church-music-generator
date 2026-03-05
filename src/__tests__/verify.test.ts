import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fontsAvailable } from '../font-metrics';

const rootDir = path.resolve(__dirname, '..', '..');
const generatedDir = path.join(rootDir, 'generated');
const distDir = path.join(rootDir, 'dist');
const fixtureDir = path.join(__dirname, 'fixtures');
const fixtureSong = path.join(fixtureDir, 'test-song.json');

const hasFonts = fontsAvailable();

describe.skipIf(!hasFonts)('verify', () => {
  beforeAll(() => {
    // Build TypeScript and generate test song
    execSync('pnpm build', { cwd: rootDir, stdio: 'pipe' });
    execSync(`node ${distDir}/generate.js ${fixtureSong}`, {
      cwd: rootDir,
      stdio: 'pipe',
    });
  });

  afterAll(() => {
    // Clean up generated test files
    for (const name of ['Test Song - Chord.docx', 'Test Song - Lyric.docx']) {
      const p = path.join(generatedDir, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('passes for valid generated .docx files', () => {
    const files = fs
      .readdirSync(generatedDir)
      .filter((f) => f.endsWith('.docx') && !f.startsWith('~$'))
      .map((f) => `"${path.join(generatedDir, f)}"`)
      .join(' ');

    const result = execSync(`node ${distDir}/verify.js ${files}`, {
      encoding: 'utf8',
    });
    expect(result).toContain('All checks passed');
  });

  it('fails for non-existent file', () => {
    try {
      execSync(`node ${distDir}/verify.js /tmp/nonexistent.docx`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const e = err as { stderr: string; status: number };
      expect(e.status).not.toBe(0);
    }
  });
});
