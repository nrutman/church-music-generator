export interface SongLine {
  chords: string;
  lyrics: string;
}

export interface IntroSection {
  type: 'intro';
  chords: string[];
}

export interface VerseSection {
  type: 'verse';
  number: number;
  lines: SongLine[];
}

export interface ChorusSection {
  type: 'chorus';
  lines: SongLine[];
}

export interface BridgeSection {
  type: 'bridge';
  lines: SongLine[];
}

export type Section = IntroSection | VerseSection | ChorusSection | BridgeSection;

export type LinesSection = VerseSection | ChorusSection | BridgeSection;

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
