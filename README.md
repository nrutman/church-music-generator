# 🎸 Church Music Generator

> *Because manually formatting chord sheets is not how you want to spend your Saturday night.*

This tool generates professional-looking chord sheets and lyric sheets as `.docx` files, formatted in the Providence Church house style. Feed it a song's chords and lyrics as a simple JSON file, and out pop two perfectly formatted documents — one with chords, one without.

## Quick Start

```bash
npm install
cd src && ./build.sh songs/my-song.json
```

That's it. Check the `generated/` folder for your shiny new `.docx` files.

## How It Works

1. **Describe your song** as a JSON file in `src/songs/` (see below)
2. **Run the build** — the generator creates both a chord sheet and a lyric sheet
3. **Automatic verification** — the build checks that everything fits within 2 pages

### Song JSON Format

Drop a file like this in `src/songs/`:

```json
{
  "title": "Amazing Grace",
  "composers": "John Newton",
  "copyright": "© Public Domain",
  "sections": [
    {
      "type": "intro",
      "chords": ["G    D    G"]
    },
    {
      "type": "verse",
      "number": 1,
      "lines": [
        { "chords": "G              C        G", "lyrics": "Amazing grace how sweet the sound" },
        { "chords": "G              D", "lyrics": "That saved a wretch like me" }
      ]
    },
    {
      "type": "chorus",
      "lines": [
        { "chords": "C    G    D    G", "lyrics": "Hallelujah what a Savior" }
      ]
    }
  ]
}
```

**Section types:** `intro`, `verse`, `chorus`, `bridge`

Use spaces in chord strings to position them over the right syllables. The generator handles all the formatting, page layout, and "will this actually fit on two pages?" math for you.

## What You Get

For each song, two documents land in `generated/`:

- **`Song Name - Chord.docx`** — Chords above lyrics, sized for a music stand. Section labels, intro chords, the works.
- **`Song Name - Lyric.docx`** — Just the words. Great for projection or for people who don't want to think about Fsus4.

## The Rules

The generator follows some opinionated formatting rules:

- **2 pages max.** Nobody wants to flip pages mid-song.
- **Chorus appears once** where it naturally falls — no unnecessary repetition.
- **Every verse gets chords** when possible. If space is tight, it'll drop chords from middle verses first.
- **Sections never split across pages.** The whole verse stays together.
- **Long lines shrink** (down to 15pt) before they wrap. If even that won't fit, it'll ask for help.

## Project Structure

```
├── CLAUDE.md              # Detailed format spec (for AI agents)
├── README.md              # You are here
├── package.json
├── generated/             # Output .docx files (git-ignored)
└── src/
    ├── build.sh           # One-command build + verify
    ├── generate.js        # The generator engine
    ├── verify.js          # Page count & height verification
    └── songs/             # Song JSON data files (git-ignored)
```

## Requirements

- Node.js
- That's it. Run `npm install` and you're good to go.
