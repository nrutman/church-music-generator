import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  conversionDirectories: [] as string[],
}));

vi.mock('../binder/pdf', () => ({
  convertToPdf: (_source: string, outputDirectory: string) => {
    mocks.conversionDirectories.push(outputDirectory);
    return `${outputDirectory}/song.pdf`;
  },
  prepareSong: (sourcePath: string, pdfPath: string) => ({
    sourcePath,
    pdfPath,
    rawPages: 1,
    pages: 1,
    trimmed: 0,
  }),
  mergeBinder: () => [],
}));

import { buildBinder } from '../binder/build';

const directories: string[] = [];

afterEach(() => {
  mocks.conversionDirectories.length = 0;
  directories
    .splice(0)
    .forEach((directory) => fs.rmSync(directory, { recursive: true, force: true }));
});

describe('buildBinder', () => {
  it('isolates conversions when source files share a basename', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'binder-build-test-'));
    directories.push(root);
    const files = ['one', 'two'].map((directory) => {
      const parent = path.join(root, directory);
      fs.mkdirSync(parent);
      const file = path.join(parent, 'Song.docx');
      fs.writeFileSync(file, directory);
      return file;
    });

    await buildBinder(files, 'Binder', { outputDirectory: root, sofficePath: 'soffice' });

    expect(new Set(mocks.conversionDirectories).size).toBe(2);
  });

  it('rejects names that escape the configured output directory', async () => {
    await expect(
      buildBinder([], '../outside', { outputDirectory: '/tmp', sofficePath: 'soffice' }),
    ).rejects.toThrow('Invalid binder name');
  });
});
