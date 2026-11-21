import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PdfConversionSession } from './pdf-conversion';

export async function preview(args: string[]): Promise<void> {
  const filter = args.filter((arg) => arg !== '--no-open')[0] ?? '';
  const generated = path.resolve(__dirname, '..', 'generated');
  const files = fs
    .readdirSync(generated)
    .filter((name) => name.startsWith(filter) && name.endsWith('.docx'));
  if (!files.length)
    throw new Error(`No .docx files matching ${JSON.stringify(filter)}. Run pnpm generate first.`);
  const preview = path.join(generated, 'preview');
  fs.rmSync(preview, { recursive: true, force: true });
  fs.mkdirSync(preview);
  const conversion = new PdfConversionSession();
  const pdfs: string[] = [];
  try {
    for (const file of files) {
      const output = path.join(preview, file.replace(/\.docx$/, '.pdf'));
      await conversion.convert(path.join(generated, file), output);
      pdfs.push(output);
    }
  } finally {
    conversion.close();
  }
  console.log(pdfs.join('\n'));
  if (!args.includes('--no-open') && process.platform === 'darwin') execFileSync('open', pdfs);
}

if (require.main === module)
  preview(process.argv.slice(2)).catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
