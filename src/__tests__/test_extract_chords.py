"""Tests for extract-chord-positions.py pure functions."""

import sys
import os
import pytest

# Add src/ to path so we can import the module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Import functions from the extraction script
from importlib import util

spec = util.spec_from_file_location(
    "extract_chord_positions",
    os.path.join(os.path.dirname(__file__), "..", "extract-chord-positions.py"),
)
mod = util.module_from_spec(spec)
spec.loader.exec_module(mod)

is_chord = mod.is_chord
is_label_or_annotation = mod.is_label_or_annotation
classify_line = mod.classify_line
build_char_map = mod.build_char_map
map_chord_to_char = mod.map_chord_to_char
group_into_lines = mod.group_into_lines
Word = mod.Word


# ---------------------------------------------------------------------------
# is_chord
# ---------------------------------------------------------------------------
class TestIsChord:
    """Chord regex should match all standard chord symbols."""

    @pytest.mark.parametrize(
        "chord",
        [
            "A",
            "B",
            "C",
            "D",
            "E",
            "F",
            "G",
            "Am",
            "Bm",
            "C#m",
            "Ebm",
            "Dmaj7",
            "Cmaj",
            "Fmaj7",
            "G7",
            "A7",
            "E7",
            "B7",
            "Em7",
            "Am7",
            "Dm7",
            "F#m7",
            "Gsus",
            "Dsus4",
            "Asus2",
            "Csus",
            "Bdim",
            "Cdim7",
            "Faug",
            "D/F#",
            "G/B",
            "A/C#",
            "E/G#",
            "C/E",
            "A2",
            "G2",
            "Bb",
            "Eb",
            "Ab",
            "Db",
            "Gb",
            "Bbm",
            "Ebm7",
            "Abmaj7",
        ],
    )
    def test_recognizes_valid_chords(self, chord):
        assert is_chord(chord), f"Expected '{chord}' to be recognized as a chord"

    def test_bar_line_is_chord(self):
        assert is_chord("|")

    @pytest.mark.parametrize(
        "word",
        [
            "the",
            "and",
            "in",
            "of",
            "to",
            "my",
            "for",
            "Holy",
            "Spirit",
            "Come",
            "Lord",
            "VERSE",
            "CHORUS",
            "INTRO",
            "living",
            "breath",
            "God",
            "I",
            "You",
            "His",
            "1",
            "2",
            "3",
            "",
        ],
    )
    def test_rejects_non_chords(self, word):
        assert not is_chord(word), f"Expected '{word}' to NOT be recognized as a chord"


# ---------------------------------------------------------------------------
# is_label_or_annotation
# ---------------------------------------------------------------------------
class TestIsLabelOrAnnotation:
    @pytest.mark.parametrize(
        "label", ["VERSE", "CHORUS", "BRIDGE", "INTRO", "TAG", "OUTRO"]
    )
    def test_recognizes_section_labels(self, label):
        assert is_label_or_annotation(label)

    @pytest.mark.parametrize("num", ["1", "2", "3", "4"])
    def test_recognizes_numbers(self, num):
        assert is_label_or_annotation(num)

    def test_rejects_regular_words(self):
        assert not is_label_or_annotation("Holy")
        assert not is_label_or_annotation("Am")


# ---------------------------------------------------------------------------
# classify_line
# ---------------------------------------------------------------------------
class TestClassifyLine:
    def _words(self, texts, y=100):
        """Helper to create Word objects on the same line."""
        x = 50
        result = []
        for t in texts:
            w = len(t) * 8
            result.append(Word(text=t, x_min=x, y_min=y, x_max=x + w, y_max=y + 12))
            x += w + 10
        return result

    def test_chord_line(self):
        assert classify_line(self._words(["D", "G", "Em", "A"])) == "chord"

    def test_lyric_line(self):
        assert (
            classify_line(self._words(["Holy", "Spirit", "living", "breath"]))
            == "lyric"
        )

    def test_mixed_mostly_chords(self):
        assert classify_line(self._words(["VERSE", "1", "D", "G", "A"])) == "chord"

    def test_label_only_is_other(self):
        assert classify_line(self._words(["INTRO"])) == "other"

    def test_single_word_A_in_lyric_context(self):
        """'A' alone looks like a chord, but a full lyric line should classify correctly."""
        assert classify_line(self._words(["A", "mighty", "fortress"])) == "lyric"

    def test_empty_words(self):
        assert classify_line([]) == "other"


# ---------------------------------------------------------------------------
# build_char_map
# ---------------------------------------------------------------------------
class TestBuildCharMap:
    def test_single_word(self):
        w = Word(text="Hello", x_min=100, y_min=50, x_max=150, y_max=62)
        text, positions = build_char_map([w])
        assert text == "Hello"
        assert len(positions) == 5

    def test_two_words_with_space(self):
        w1 = Word(text="Holy", x_min=100, y_min=50, x_max=140, y_max=62)
        w2 = Word(text="Spirit", x_min=150, y_min=50, x_max=210, y_max=62)
        text, positions = build_char_map([w1, w2])
        assert text == "Holy Spirit"
        assert len(positions) == 11  # 4 + 1 space + 6
        # Space position bridges the gap between words
        assert positions[4] == (140, 150)

    def test_empty_list(self):
        text, positions = build_char_map([])
        assert text == ""
        assert positions == []


# ---------------------------------------------------------------------------
# map_chord_to_char
# ---------------------------------------------------------------------------
class TestMapChordToChar:
    def _make_positions(self, text, start_x=100, char_width=10):
        """Build evenly-spaced character positions."""
        return [
            (start_x + i * char_width, start_x + (i + 1) * char_width)
            for i in range(len(text))
        ]

    def test_exact_hit(self):
        text = "Hello world"
        positions = self._make_positions(text)
        # x=165 is inside the 'w' character at index 6 (range 160-170)
        idx, ch = map_chord_to_char(165, text, positions)
        assert idx == 6
        assert ch == "w"

    def test_trailing_chord(self):
        text = "Hello"
        positions = self._make_positions(text)
        idx, ch = map_chord_to_char(200, text, positions)  # way past end
        assert idx == len(text)
        assert ch == "(trailing)"

    def test_closest_match(self):
        text = "AB"
        positions = [(100, 110), (120, 130)]  # gap between 110-120
        idx, ch = map_chord_to_char(115, text, positions)  # between A and B
        assert idx in (0, 1)  # closest to either A or B


# ---------------------------------------------------------------------------
# group_into_lines
# ---------------------------------------------------------------------------
class TestGroupIntoLines:
    def test_same_line(self):
        words = [
            Word("A", 10, 100, 20, 112),
            Word("B", 30, 101, 40, 113),
        ]
        lines = group_into_lines(words)
        assert len(lines) == 1
        assert len(lines[0]) == 2

    def test_different_lines(self):
        words = [
            Word("top", 10, 100, 30, 112),
            Word("bottom", 10, 200, 50, 212),
        ]
        lines = group_into_lines(words)
        assert len(lines) == 2

    def test_empty_input(self):
        assert group_into_lines([]) == []

    def test_sorts_by_x_within_line(self):
        words = [
            Word("second", 200, 100, 260, 112),
            Word("first", 50, 101, 100, 113),
        ]
        lines = group_into_lines(words)
        assert lines[0][0].text == "first"
        assert lines[0][1].text == "second"
