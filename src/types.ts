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
  lyricsOnly?: boolean; // when true, chord lines are omitted on chord sheets (lyrics rendered like lyric sheet)
  lyricHide?: boolean; // when true, section is excluded from lyric sheets (e.g. duplicate choruses)
}

export type Section = IntroSection | LinesSection;

export interface Song {
  title: string;
  composers: string;
  copyright: string;
  key?: string; // audible/performed key; required when publishing to Planning Center
  ccliNumber?: number;
  skipPublish?: boolean; // omitted/false publishes normally; true blocks publishing
  planningCenterArrangement?: string; // selects/creates a named non-default Arrangement
  headerDate?: string;
  lyricSize?: number; // base lyric font size in pt (default 18)
  maxPages?: number; // max page count override (default 2)
  capo?: number; // generate an additional chord sheet with chords transposed down this many half steps
  sections: Section[];
}

export type SheetMode = 'chord' | 'lyric';

export interface LayoutItem {
  section: Section;
  height: number;
}

export interface PagePlan {
  pages: LayoutItem[][];
  reducedGaps: boolean; // when true, ALL gaps in the song use the smaller 18pt spacing
}
