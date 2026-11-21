import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ convert: vi.fn(), close: vi.fn() }));
vi.mock('../pdf-conversion', () => ({
  PdfConversionSession: class {
    convert = mocks.convert;
    close = mocks.close;
  },
}));
vi.mock('fs', () => ({
  readdirSync: () => ['Song - Chord.docx', 'Song - Lyric.docx', 'Other.docx'],
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
}));
vi.mock('child_process', () => ({ execFileSync: vi.fn() }));
import { execFileSync } from 'child_process';
import { preview } from '../preview';

afterEach(() => {
  vi.clearAllMocks();
  mocks.convert.mockReset();
});

describe('preview', () => {
  it('converts only matching sheets without opening the viewer when requested', async () => {
    await preview(['Song', '--no-open']);
    expect(mocks.convert.mock.calls.map(([source]) => source.split('/').pop())).toEqual([
      'Song - Chord.docx',
      'Song - Lyric.docx',
    ]);
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it('closes the conversion session when export fails', async () => {
    mocks.convert.mockRejectedValueOnce(new Error('export failed'));
    await expect(preview(['Song', '--no-open'])).rejects.toThrow('export failed');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
  it('rejects an unmatched title without starting a session', async () => {
    await expect(preview(['Missing'])).rejects.toThrow('No .docx files');
    expect(mocks.convert).not.toHaveBeenCalled();
  });
});
