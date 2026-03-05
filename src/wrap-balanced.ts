/**
 * Split text into balanced lines, preferring breaks at entity boundaries
 * to avoid splitting names or company names mid-line.
 *
 * Hierarchy: first split at ", " (between entity groups), then split
 * long segments further at " – " or " / " (within groups).
 */
export function wrapBalanced(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  // Split at commas first (highest-level entity boundary)
  const segments = splitAtDelimiters(text, [', ']);

  // If any segment is still too long, split further at " – " or " / "
  const lines: string[] = [];
  for (const seg of segments) {
    if (seg.length <= maxChars) {
      lines.push(seg);
    } else {
      lines.push(...splitAtDelimiters(seg, [' – ', ' - ', ' / ']));
    }
  }
  return lines;
}

export function splitAtDelimiters(text: string, delimiters: string[]): string[] {
  // Find all break points
  const breakPoints: number[] = [];
  for (let i = 0; i < text.length; i++) {
    for (const d of delimiters) {
      if (text.slice(i, i + d.length) === d) {
        breakPoints.push(i + d.length);
        break;
      }
    }
  }
  if (breakPoints.length === 0) return [text];

  // Pick the break point closest to the midpoint for balanced halves
  const mid = text.length / 2;
  let bestBp = breakPoints[0];
  let bestDiff = Infinity;
  for (const bp of breakPoints) {
    const diff = Math.abs(bp - mid);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBp = bp;
    }
  }
  return [text.slice(0, bestBp).trimEnd(), text.slice(bestBp).trimStart()];
}
