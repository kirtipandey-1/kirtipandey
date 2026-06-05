"""
Video editor: vertical crop, ASS caption generation, and FFmpeg processing.

Caption style mirrors OpusClip's word-by-word highlight effect:
  - ALL-CAPS Impact font, white text, thick black outline
  - Current word pops to yellow with a slight size bump
  - 4-5 words per line, positioned at the lower third
"""

import subprocess
import sys
import tempfile
from pathlib import Path


# ---------------------------------------------------------------------------
# ASS helpers
# ---------------------------------------------------------------------------

# ASS color format: &HAABBGGRR  (alpha=00 → opaque)
_WHITE  = "&H00FFFFFF"
_YELLOW = "&H0000FFFF"   # RGB(255,255,0) → BGR 00-FF-FF → &H0000FFFF
_BLACK  = "&H00000000"
_SHADOW = "&H88000000"   # 53 % opaque black


def _ass_time(seconds: float) -> str:
    """Seconds → ASS time string H:MM:SS.cc"""
    seconds = max(0.0, seconds)
    h  = int(seconds // 3600)
    m  = int((seconds % 3600) // 60)
    s  = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _ass_header(width: int, height: int) -> str:
    font_size = max(72, int(width * 0.082))   # ~89 px at 1080 wide
    margin_v  = int(height * 0.11)            # 11 % from bottom edge

    return (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {width}\n"
        f"PlayResY: {height}\n"
        "ScaledBorderAndShadow: yes\n"
        "YCbCr Matrix: None\n"
        "\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,Impact,{font_size},"
        f"{_WHITE},{_WHITE},{_BLACK},{_SHADOW},"
        f"-1,0,0,0,100,100,1,0,1,6,3,2,40,40,{margin_v},1\n"
        "\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )


# ---------------------------------------------------------------------------
# Word chunking + event generation
# ---------------------------------------------------------------------------

def _make_chunks(words: list, clip_start: float, max_words: int = 5, max_secs: float = 3.5) -> list:
    """
    Group words into caption lines (chunks), adjusting timestamps so that
    t=0 corresponds to the start of the clip.
    """
    chunks: list = []
    current: list = []
    chunk_t0: float | None = None

    for w in words:
        rel_start = w["start"] - clip_start
        rel_end   = w["end"]   - clip_start

        if rel_start < -0.1:
            continue  # word is before clip window

        adj = {**w, "start": rel_start, "end": rel_end}

        if chunk_t0 is None:
            chunk_t0 = rel_start

        current.append(adj)

        if len(current) >= max_words or (rel_end - chunk_t0) >= max_secs:
            chunks.append({"words": current, "start": chunk_t0, "end": rel_end})
            current = []
            chunk_t0 = None

    if current:
        chunks.append({"words": current, "start": chunk_t0, "end": current[-1]["end"]})

    return chunks


def _build_events(chunks: list, clip_duration: float) -> list[str]:
    """
    For each chunk, emit one Dialogue event per word transition.
    The current word is highlighted in yellow + 10 % scale boost.
    All words are ALL-CAPS.
    """
    events: list[str] = []

    for chunk in chunks:
        cwords = chunk["words"]
        n = len(cwords)

        for idx, cur in enumerate(cwords):
            t_start = cur["start"]
            t_end   = cwords[idx + 1]["start"] if idx + 1 < n else chunk["end"]

            if t_start >= clip_duration:
                continue
            t_end = min(t_end, clip_duration)
            if t_end <= t_start:
                t_end = t_start + 0.05

            parts: list[str] = []
            for j, w in enumerate(cwords):
                text = w["word"].strip().upper()
                if not text:
                    continue
                if j == idx:
                    # Highlighted: yellow, 10 % larger
                    parts.append(
                        r"{\c" + _YELLOW + r"\fscx110\fscy110}" +
                        text +
                        r"{\c" + _WHITE + r"\fscx100\fscy100}"
                    )
                else:
                    parts.append(text)

            if not parts:
                continue

            line = " ".join(parts)
            events.append(
                f"Dialogue: 0,{_ass_time(t_start)},{_ass_time(t_end)},"
                f"Default,,0,0,0,,{line}"
            )

    return events


def generate_ass(
    words: list,
    clip_start: float,
    clip_duration: float,
    width: int = 1080,
    height: int = 1920,
) -> str:
    """Return a complete ASS subtitle string for the given clip."""
    chunks = _make_chunks(words, clip_start)
    events = _build_events(chunks, clip_duration)
    return _ass_header(width, height) + "\n".join(events) + "\n"


# ---------------------------------------------------------------------------
# FFprobe helpers
# ---------------------------------------------------------------------------

def _probe_wh(path: Path) -> tuple[int, int]:
    """Return (width, height) of the first video stream."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        str(path),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode == 0:
        parts = r.stdout.strip().split(",")
        if len(parts) == 2:
            try:
                return int(parts[0]), int(parts[1])
            except ValueError:
                pass
    return 1920, 1080


# ---------------------------------------------------------------------------
# Main clip processor
# ---------------------------------------------------------------------------

def process_clip(
    video_path: Path,
    start: float,
    end: float,
    words: list,
    output_path: Path,
    vertical: bool = True,
    add_captions: bool = True,
) -> None:
    """
    Cut, optionally crop to 9:16, burn word-by-word captions, and save the clip.

    The entire pipeline is a single FFmpeg pass for speed:
      fast-seek → crop/scale → ass subtitle burn → libx264 encode
    """
    duration = end - start
    src_w, src_h = _probe_wh(video_path)

    # --- build crop/scale filter -------------------------------------------
    if vertical:
        out_w, out_h = 1080, 1920
        # Crop a portrait strip from the horizontal center of the source
        # Formula: keep full height, crop width to h*(9/16), center horizontally
        crop_w = int(src_h * 9 / 16)
        crop_w = min(crop_w, src_w)
        crop_x = (src_w - crop_w) // 2
        vf_parts = [f"crop={crop_w}:{src_h}:{crop_x}:0", f"scale={out_w}:{out_h}:flags=lanczos"]
    else:
        out_w, out_h = src_w, src_h
        vf_parts = []

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        # --- optionally write ASS captions ----------------------------------
        if add_captions and words:
            ass_text = generate_ass(words, start, duration, out_w, out_h)
            ass_path = tmp / "caps.ass"
            ass_path.write_text(ass_text, encoding="utf-8")
            # FFmpeg's ass filter on Linux needs forward slashes; escape colons
            ass_safe = str(ass_path).replace("\\", "/").replace(":", r"\:")
            vf_parts.append(f"ass='{ass_safe}'")

        vf = ",".join(vf_parts) if vf_parts else None

        cmd = [
            "ffmpeg", "-y",
            "-ss", str(start),          # fast seek (before -i)
            "-t",  str(duration),        # encode exactly this many seconds
            "-i",  str(video_path),
        ]
        if vf:
            cmd += ["-vf", vf]

        cmd += [
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            str(output_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            # Retry without captions (captions may fail if libass is absent)
            if add_captions and words:
                print("      Caption burn failed — retrying without captions…")
                vf_no_caps = ",".join(p for p in vf_parts if not p.startswith("ass="))
                cmd2 = [
                    "ffmpeg", "-y",
                    "-ss", str(start),
                    "-t",  str(duration),
                    "-i",  str(video_path),
                ]
                if vf_no_caps:
                    cmd2 += ["-vf", vf_no_caps]
                cmd2 += [
                    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                    str(output_path),
                ]
                result2 = subprocess.run(cmd2, capture_output=True, text=True)
                if result2.returncode != 0:
                    print(f"      FFmpeg error:\n{result2.stderr[-600:]}")
                    sys.exit(1)
            else:
                print(f"      FFmpeg error:\n{result.stderr[-600:]}")
                sys.exit(1)


def check_ffmpeg() -> None:
    """Exit with a helpful message if FFmpeg is not on PATH."""
    r = subprocess.run(["ffmpeg", "-version"], capture_output=True)
    if r.returncode != 0:
        print(
            "Error: FFmpeg not found.\n"
            "  Ubuntu/Debian: sudo apt install ffmpeg\n"
            "  macOS:         brew install ffmpeg\n"
        )
        sys.exit(1)
