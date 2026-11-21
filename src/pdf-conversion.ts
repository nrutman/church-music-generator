import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { PDFDocument } from 'pdf-lib';

export function resolveSoffice(configured?: string): string {
  const candidates = [
    configured?.replace(/^~(?=$|\/)/, os.homedir()),
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    'soffice',
  ];
  return (
    candidates.find(
      (candidate) => candidate && (candidate === 'soffice' || fs.existsSync(candidate)),
    ) ?? 'soffice'
  );
}

const wordExport = `on run argv
 set inputFile to POSIX file (item 1 of argv)
 set inputName to item 2 of argv
 set outputPath to item 3 of argv
 with timeout of 60 seconds
  tell application "Microsoft Word"
   open inputFile read only true add to recent files false
   set exportDocument to document inputName
   try
    save as exportDocument file name outputPath file format format PDF add to recent files false
   on error errorMessage number errorNumber
    close exportDocument saving no
    error errorMessage number errorNumber
   end try
   close exportDocument saving no
  end tell
 end timeout
end run`;

const wordCleanup = `on run argv
 if application "Microsoft Word" is running then
  with timeout of 15 seconds
   tell application "Microsoft Word"
    repeat with documentName in items 2 thru -1 of argv
     if exists document (contents of documentName) then
      set ownedDocument to document (contents of documentName)
      close ownedDocument saving no
     end if
    end repeat
    if item 1 of argv is "quit" then
     if (count documents) is 0 then
      quit
     else
      return "Word left running: unrelated documents remain open."
     end if
    end if
   end tell
  end timeout
 end if
 return "ok"
end run`;

function appleScript(script: string, args: string[] = []): string {
  return execFileSync('osascript', ['-e', script, ...args], {
    encoding: 'utf8',
    timeout: 75_000,
    stdio: 'pipe',
  }).trim();
}

/** Converts documents and owns only the Word documents opened by this session. */
export class PdfConversionSession {
  private readonly mode: 'auto' | 'word' | 'libreoffice';
  private engine?: 'word' | 'libreoffice';
  private directory?: string;
  private readonly runId = randomUUID();
  private wordUsed = false;
  private launchedWord = false;
  private retainStaging = false;
  private readonly documentNames: string[] = [];

  constructor(private readonly sofficePath = resolveSoffice(process.env.SOFFICE_PATH)) {
    const mode = process.env.PDF_ENGINE ?? 'auto';
    if (mode !== 'auto' && mode !== 'word' && mode !== 'libreoffice')
      throw new Error(`Invalid PDF_ENGINE: ${mode}`);
    this.mode = mode;
  }

  private selectEngine(): 'word' | 'libreoffice' {
    if (this.engine) return this.engine;
    const available =
      process.platform === 'darwin' &&
      (fs.existsSync('/Applications/Microsoft Word.app') ||
        fs.existsSync(path.join(process.env.HOME ?? '', 'Applications/Microsoft Word.app')));
    if (this.mode === 'word' && !available)
      throw new Error('Microsoft Word is unavailable on this machine');
    this.engine = this.mode === 'libreoffice' || !available ? 'libreoffice' : 'word';
    if (this.mode === 'auto' && !available)
      console.warn('PDF conversion: Word unavailable; using LibreOffice.');
    return this.engine;
  }

  private cleanupWord(quit: boolean): void {
    if (!this.wordUsed) return;
    const result = appleScript(wordCleanup, [
      quit && this.launchedWord ? 'quit' : 'keep',
      ...this.documentNames,
    ]);
    if (result !== 'ok') console.warn(result);
  }

  /** Writes a validated PDF to the destination without modifying the source. */
  async convert(source: string, destination: string): Promise<void> {
    const engine = this.selectEngine();
    if (!this.directory) {
      const parent = path.resolve(__dirname, '..', 'generated', 'word-conversion');
      fs.mkdirSync(parent, { recursive: true });
      this.directory = parent;
    }
    const name = `${this.runId}-${this.documentNames.length}`;
    const staged = path.join(this.directory, `${name}${path.extname(source)}`);
    const pdf = path.join(this.directory, `${name}.pdf`);
    this.documentNames.push(path.basename(staged), path.basename(pdf));
    fs.copyFileSync(source, staged);
    let used = engine;
    if (engine === 'word') {
      try {
        if (!this.wordUsed) {
          // The running predicate does not launch Word. Capture ownership before opening anything.
          this.launchedWord =
            appleScript('return application "Microsoft Word" is running') === 'false';
          this.wordUsed = true;
        }
        console.log(`PDF conversion: Word (${path.basename(source)})`);
        appleScript(wordExport, [staged, path.basename(staged), pdf]);
        await this.validate(pdf);
      } catch (error) {
        try {
          this.cleanupWord(false);
        } catch (cleanupError) {
          this.retainStaging = true;
          console.warn(
            `Word cleanup uncertain; staging retained at ${this.directory}: ${String(cleanupError)}`,
          );
        }
        if (this.mode === 'word') throw error;
        console.warn(
          `Word export failed; using LibreOffice for remaining documents: ${String(error)}`,
        );
        this.engine = used = 'libreoffice';
        fs.rmSync(pdf, { force: true });
      }
    }
    if (used === 'libreoffice') {
      console.log(`PDF conversion: LibreOffice (${path.basename(source)})`);
      execFileSync(
        this.sofficePath,
        ['--headless', '--convert-to', 'pdf', '--outdir', this.directory, staged],
        {
          stdio: 'pipe',
          timeout: 75_000,
        },
      );
      await this.validate(pdf);
    }
    fs.copyFileSync(pdf, destination);
    if (!this.retainStaging) fs.unlinkSync(staged);
  }

  private async validate(pdf: string): Promise<void> {
    const document = await PDFDocument.load(fs.readFileSync(pdf));
    if (!document.getPageCount()) throw new Error(`Empty converted PDF: ${pdf}`);
  }

  /** Closes owned documents and quits Word only if this session launched it. */
  close(): void {
    try {
      this.cleanupWord(true);
    } catch (error) {
      this.retainStaging = true;
      const message = `Word cleanup failed; staging retained at ${this.directory}: ${String(error)}`;
      if (this.mode === 'word') throw new Error(message);
      console.warn(message);
    }
    if (this.directory && !this.retainStaging) {
      for (const name of this.documentNames)
        fs.rmSync(path.join(this.directory, name), { force: true });
    }
  }
}
