import opentype from 'opentype.js';
import fs from 'fs';
import path from 'path';

const FONT_DIRS = [
  '/System/Library/Fonts/Supplemental', // macOS
  '/usr/share/fonts/truetype/msttcorefonts', // Linux (ttf-mscorefonts-installer)
];

function findFontDir(): string | undefined {
  for (const dir of FONT_DIRS) {
    if (
      fs.existsSync(path.join(dir, 'Arial_Bold.ttf')) ||
      fs.existsSync(path.join(dir, 'Arial Bold.ttf'))
    ) {
      return dir;
    }
  }
  return undefined;
}

/** Check whether the required Arial font files are available on this system. */
export function fontsAvailable(): boolean {
  return findFontDir() !== undefined;
}

const fonts: Record<string, opentype.Font> = {};

function getFont(variant: 'bold' | 'italic'): opentype.Font {
  if (fonts[variant]) return fonts[variant];
  const dir = findFontDir();
  if (!dir) {
    throw new Error(
      'Arial fonts not found. Install Arial (macOS: built-in, Linux: ttf-mscorefonts-installer).',
    );
  }
  // macOS uses spaces ("Arial Bold.ttf"), Linux uses underscores ("Arial_Bold.ttf")
  const names =
    variant === 'bold'
      ? ['Arial Bold.ttf', 'Arial_Bold.ttf']
      : ['Arial Italic.ttf', 'Arial_Italic.ttf'];
  const fontPath = names.map((n) => path.join(dir, n)).find((p) => fs.existsSync(p));
  if (!fontPath) {
    throw new Error(`Arial ${variant} font not found in ${dir}.`);
  }
  fonts[variant] = opentype.loadSync(fontPath);
  return fonts[variant];
}

/**
 * Compute the exact physical width of text in points using real font metrics.
 */
export function textWidth(text: string, sizePt: number, variant: 'bold' | 'italic'): number {
  if (text.length === 0) return 0;
  const font = getFont(variant);
  const glyphs = font.stringToGlyphs(text);
  let total = 0;
  for (let i = 0; i < glyphs.length; i++) {
    total += glyphs[i].advanceWidth ?? 0;
    if (i < glyphs.length - 1) {
      total += font.getKerningValue(glyphs[i], glyphs[i + 1]);
    }
  }
  return (total / font.unitsPerEm) * sizePt;
}
