import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// verify.ts is a CLI script, so we test it by running it against
// known .docx files. These tests require the build to have run.

const generatedDir = path.resolve(__dirname, '..', '..', 'generated');
const distDir = path.resolve(__dirname, '..', '..', 'dist');

function hasGeneratedFiles(): boolean {
  try {
    const files = fs.readdirSync(generatedDir);
    return files.some((f) => f.endsWith('.docx'));
  } catch {
    return false;
  }
}

function hasBuilt(): boolean {
  return fs.existsSync(path.join(distDir, 'verify.js'));
}

describe('verify', () => {
  it.skipIf(!hasBuilt() || !hasGeneratedFiles())('passes for valid generated .docx files', () => {
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

  it.skipIf(!hasBuilt())('fails for non-existent file', () => {
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
