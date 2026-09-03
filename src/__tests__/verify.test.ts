import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fontsAvailable } from '../font-metrics';

const rootDir = path.resolve(__dirname, '..', '..');
const generatedDir = path.join(rootDir, 'generated');
const distDir = path.join(rootDir, 'dist');
const fixtureDir = path.join(__dirname, 'fixtures');
const fixtureSong = path.join(fixtureDir, 'test-song.json');

const hasFonts = fontsAvailable();
const testFiles = ['Test Song - Chord.docx', 'Test Song - Lyric.docx'];

function readDocxMember(fileName: string, member: string): string {
  return execFileSync('unzip', ['-p', path.join(generatedDir, fileName), member], {
    encoding: 'utf8',
  });
}

describe.skipIf(!hasFonts)('verify', () => {
  beforeAll(() => {
    execSync('pnpm build', { cwd: rootDir, stdio: 'pipe' });
    execSync(`node ${distDir}/generate.js ${fixtureSong}`, {
      cwd: rootDir,
      stdio: 'pipe',
    });
  });

  afterAll(() => {
    for (const name of testFiles) {
      const p = path.join(generatedDir, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('passes for valid generated .docx files', () => {
    const files = testFiles.map((f) => `"${path.join(generatedDir, f)}"`).join(' ');

    const result = execSync(`node ${distDir}/verify.js ${files}`, {
      encoding: 'utf8',
    });
    expect(result).toContain('All checks passed');
  });

  it('uses fixed tables for chord and header alignment', () => {
    const chordXml = readDocxMember('Test Song - Chord.docx', 'word/document.xml');
    const headerXml = readDocxMember('Test Song - Chord.docx', 'word/header1.xml');

    for (const xml of [chordXml, headerXml]) {
      expect(xml).toContain('<w:tbl>');
      expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
      expect(xml).not.toContain('<w:tabs>');
      expect(xml).not.toContain('<w:tab/>');
    }

    expect(headerXml).toMatch(/<w:tblW(?=[^>]*w:type="dxa")(?=[^>]*w:w="9360")[^>]*\/>/);
    expect(headerXml.match(/<w:gridCol w:w="4680"\/>/g)).toHaveLength(2);
  });

  it('uses tab stops so lyric section labels share the first lyric baseline', () => {
    const lyricXml = readDocxMember('Test Song - Lyric.docx', 'word/document.xml');

    expect(lyricXml).not.toContain('<w:tbl>');
    expect(lyricXml.match(/<w:tabs>/g)).toHaveLength(2);
    expect(lyricXml.match(/<w:tab w:val="left" w:pos="1440"\/>/g)).toHaveLength(2);
    expect(lyricXml.match(/<w:tab\/>/g)).toHaveLength(2);
    expect(lyricXml.match(/<w:r><w:tab\/><\/w:r>/g)).toHaveLength(2);
    expect(lyricXml).toMatch(/<w:p>.*?VERSE 1.*?<w:tab\/>.*?Amazing test of every line.*?<\/w:p>/);
    expect(lyricXml).toMatch(/<w:p>.*?CHORUS.*?<w:tab\/>.*?This is the chorus line.*?<\/w:p>/);
  });

  it('supports a chord-sheet-only lyric size', () => {
    const chordStylesXml = readDocxMember('Test Song - Chord.docx', 'word/styles.xml');
    const lyricStylesXml = readDocxMember('Test Song - Lyric.docx', 'word/styles.xml');

    expect(chordStylesXml).toMatch(/<w:style[^>]*w:styleId="BodyText".*?<w:sz w:val="34"\/>/);
    expect(lyricStylesXml).toMatch(/<w:style[^>]*w:styleId="BodyText".*?<w:sz w:val="36"\/>/);
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
