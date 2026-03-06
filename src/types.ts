export interface SongLine {
  chords: [string, number][]; // [chordName, charIndex][] — maps each chord to a 0-based character position in the lyrics
  lyrics: string;
}

export interface IntroSection {
  type: 'intro';
  chords: string[];
}

export interface LinesSection {
  type: string;
  number?: number;
  lines: SongLine[];
}

export type Section = IntroSection | LinesSection;

export interface Song {
  title: string;
  composers: string;
  copyright: string;
  sections: Section[];
}

export type SheetMode = 'chord' | 'lyric';

export interface LayoutItem {
  section: Section;
  height: number;
  reducedGap?: boolean;
}
