import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BinderConfig } from './config';
import { convertToPdf, mergeBinder, prepareSong, SongPlacement } from './pdf';

export async function buildBinder(
  files: string[],
  name: string,
  config: BinderConfig,
): Promise<{ outputPath: string; placements: SongPlacement[] }> {
  const safeName = name.replace(/\.pdf$/i, '').trim();
  if (!safeName || safeName === '.' || safeName === '..' || /[/\\]/.test(safeName)) {
    throw new Error(`Invalid binder name: ${name}`);
  }
  if (!files.length) throw new Error('At least one chord sheet is required');
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
    if (!/\.docx?$/i.test(file)) throw new Error(`Unsupported file type: ${file}`);
  }
  const outputPath = path.join(config.outputDirectory, `${safeName}.pdf`);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-binder-'));
  try {
    const prepared = [];
    for (let index = 0; index < files.length; index += 1) {
      const sourcePath = files[index];
      const conversionDirectory = path.join(temporaryDirectory, String(index));
      fs.mkdirSync(conversionDirectory);
      const pdfPath = convertToPdf(sourcePath, conversionDirectory, config.sofficePath);
      prepared.push(await prepareSong(sourcePath, pdfPath));
    }
    return { outputPath, placements: await mergeBinder(prepared, outputPath) };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
