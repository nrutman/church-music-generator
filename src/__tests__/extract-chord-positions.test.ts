import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const cli = path.resolve('dist/extract-chord-positions.js');
let hasPoppler = true;
try {
  execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
} catch {
  hasPoppler = false;
}

describe('text extraction CLI', () => {
  it.skipIf(!hasPoppler)('matches the Python report for a two-page PDF', () => {
    const fixture = path.join(__dirname, 'fixtures/extraction-source.pdf');
    const expected = fs.readFileSync(
      path.join(__dirname, 'fixtures/extraction-source-text.txt'),
      'utf8',
    );
    expect(execFileSync(process.execPath, [cli, fixture], { encoding: 'utf8' })).toBe(expected);
  });
  it('reports missing arguments with a nonzero exit status', () => {
    const result = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: pnpm extract-chords');
    expect(result.stdout).toBe('');
  });
  it.skipIf(!hasPoppler)('fails rather than printing a successful report for a missing PDF', () => {
    const result = spawnSync(process.execPath, [cli, 'missing-fixture.pdf'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Error extracting chords');
    expect(result.stdout).toBe('');
  });
});
