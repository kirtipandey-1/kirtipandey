#!/usr/bin/env python3
"""
OpusClip Local
==============
Free, open-source, fully local AI video clipper.

Pipeline
--------
1. Download video (yt-dlp) or accept a local file
2. Transcribe with Whisper (faster-whisper, word-level timestamps)
3. Select the best clips with a local LLM (Ollama) or speech-density heuristic
4. Cut, crop to 9:16 vertical, and burn animated word-by-word captions (FFmpeg)

Dependencies
------------
System:  ffmpeg (with libass for captions), ffprobe
Python:  pip install faster-whisper yt-dlp ollama
Optional for GPU: pip install torch  (auto-detected)
Optional for LLM: Ollama running with a model pulled, e.g.  ollama pull llama3.2
"""

import argparse
import re
import sys
from pathlib import Path

from downloader import download_video
from transcriber import transcribe_video
from clip_selector import select_clips
from editor import check_ffmpeg, process_clip

_BAR = "=" * 62


def _safe_name(title: str, max_len: int = 40) -> str:
    """Convert a title into a safe filename fragment."""
    cleaned = re.sub(r"[^\w\s-]", "", title)
    cleaned = re.sub(r"\s+", "_", cleaned.strip())
    return cleaned[:max_len]


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="opusclip",
        description="OpusClip Local — AI-powered short-form video clipper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  python main.py https://youtube.com/watch?v=XXXX
  python main.py talk.mp4 --clips 5 --min 45 --max 75
  python main.py talk.mp4 --format horizontal --no-captions
  python main.py talk.mp4 --whisper-model small --ollama-model mistral
        """,
    )

    parser.add_argument("input", help="YouTube URL or path to a local video file")

    parser.add_argument(
        "--clips", type=int, default=3, metavar="N",
        help="number of clips to generate (default: 3)",
    )
    parser.add_argument(
        "--min", dest="min_duration", type=float, default=30.0, metavar="SECS",
        help="minimum clip duration in seconds (default: 30)",
    )
    parser.add_argument(
        "--max", dest="max_duration", type=float, default=90.0, metavar="SECS",
        help="maximum clip duration in seconds (default: 90)",
    )
    parser.add_argument(
        "--format", choices=["vertical", "horizontal"], default="vertical",
        help="output aspect ratio (default: vertical 9:16)",
    )
    parser.add_argument(
        "--whisper-model",
        choices=["tiny", "base", "small", "medium", "large-v2", "large-v3"],
        default="base",
        help="Whisper model size — larger = more accurate but slower (default: base)",
    )
    parser.add_argument(
        "--ollama-model", default="llama3.2", metavar="MODEL",
        help="Ollama model for clip selection (default: llama3.2)",
    )
    parser.add_argument(
        "--language", default=None, metavar="LANG",
        help="force transcription language, e.g. en, es, fr (default: auto-detect)",
    )
    parser.add_argument(
        "--output-dir", default="./output", metavar="DIR",
        help="directory for output clips (default: ./output)",
    )
    parser.add_argument(
        "--no-captions", action="store_true",
        help="skip burning captions into the video",
    )
    parser.add_argument(
        "--caption-words", type=int, default=5, metavar="N",
        help="max words per caption line (default: 5)",
    )

    args = parser.parse_args()

    # -----------------------------------------------------------------------
    # Pre-flight checks
    # -----------------------------------------------------------------------
    check_ffmpeg()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # -----------------------------------------------------------------------
    print(f"\n{_BAR}")
    print("  OpusClip Local — AI Video Clipper")
    print(_BAR + "\n")

    # Step 1 — acquire video
    print("[1/4] Video input")
    if args.input.startswith(("http://", "https://")):
        print("      Downloading with yt-dlp…")
        video_path = download_video(args.input, output_dir)
    else:
        video_path = Path(args.input)
        if not video_path.exists():
            print(f"      Error: file not found — {video_path}")
            sys.exit(1)
    print(f"      {video_path.name}")

    # Step 2 — transcribe
    print("\n[2/4] Transcription (Whisper)")
    transcript = transcribe_video(
        video_path,
        model_size=args.whisper_model,
        language=args.language,
    )

    if not transcript["words"]:
        print("      No speech detected — cannot select clips.")
        sys.exit(1)

    video_duration = transcript["duration"]
    print(f"      Video duration: {video_duration:.1f}s")

    # Step 3 — select clips
    print(f"\n[3/4] Clip selection ({args.ollama_model})")
    clips = select_clips(
        transcript,
        n_clips=args.clips,
        min_duration=args.min_duration,
        max_duration=args.max_duration,
        model=args.ollama_model,
    )

    if not clips:
        print("      No clips could be selected.")
        sys.exit(1)

    print(f"      {len(clips)} clip(s) selected")

    # Step 4 — process clips
    print(f"\n[4/4] Processing clips  [{args.format}]")
    saved: list[Path] = []

    for i, clip in enumerate(clips, 1):
        dur = clip["end"] - clip["start"]
        score = clip.get("score")
        score_str = f"{score:.1f}/10" if isinstance(score, (int, float)) else str(score)
        reason = clip.get("reason", "")[:70]

        print(f"\n  [{i}/{len(clips)}] {clip['title']}")
        print(f"         {clip['start']:.1f}s → {clip['end']:.1f}s  ({dur:.1f}s)  score {score_str}")
        if reason:
            print(f"         {reason}")

        safe = _safe_name(clip["title"])
        out_path = output_dir / f"clip_{i:02d}_{safe}.mp4"

        process_clip(
            video_path=video_path,
            start=clip["start"],
            end=clip["end"],
            words=clip.get("words", []),
            output_path=out_path,
            vertical=(args.format == "vertical"),
            add_captions=not args.no_captions,
        )

        print(f"         Saved → {out_path}")
        saved.append(out_path)

    print(f"\n{_BAR}")
    print(f"  Done — {len(saved)} clip(s) in {output_dir}/")
    print(_BAR + "\n")


if __name__ == "__main__":
    main()
