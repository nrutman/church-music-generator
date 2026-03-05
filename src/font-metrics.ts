import opentype from 'opentype.js';
import path from 'path';

const FONT_DIR = '/System/Library/Fonts/Supplemental';

const fonts: Record<string, opentype.Font> = {};

function getFont(variant: 'bold' | 'italic'): opentype.Font {
  if (fonts[variant]) return fonts[variant];
  const filename = variant === 'bold' ? 'Arial Bold.ttf' : 'Arial Italic.ttf';
  const fontPath = path.join(FONT_DIR, filename);
  try {
    fonts[variant] = opentype.loadSync(fontPath);
  } catch (err) {
    throw new Error(
      `Failed to load font: ${fontPath}. This project requires macOS with Arial fonts installed.`,
    );
  }
  return fonts[variant];
}

/**
 * Compute the exact physical width of text in points using real font metrics.
 */
export function textWidth(
  text: string,
  sizePt: number,
  variant: 'bold' | 'italic',
): number {
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
