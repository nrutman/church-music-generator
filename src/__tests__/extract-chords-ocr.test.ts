import { spawnSync } from 'child_process';
import * as path from 'path';
import { expect, it } from 'vitest';

it('reports OCR-specific usage without invoking OCR when no PDF is provided', () => {
  const result = spawnSync(process.execPath, [path.resolve('dist/extract-chords-ocr.js')], {
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Usage: pnpm extract-chords-ocr');
  expect(result.stdout).toBe('');
});
