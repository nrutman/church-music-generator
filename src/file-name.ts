/** Derive a filename from the song title: strip leading article and punctuation. */
export function fileNameFromTitle(title: string): string {
  return title
    .replace(/^(A|An|The)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
