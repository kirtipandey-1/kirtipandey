#!/usr/bin/env python3
"""
boxing_edit.py — Auto-generate a boxing highlight video synced to a song's beat.

Usage:
    python boxing_edit.py --youtube "https://youtube.com/watch?v=..." --song "mysong.mp3"

Requirements:
    pip install -r requirements.txt
    OS-level: ffmpeg (apt install ffmpeg / brew install ffmpeg)
"""

import argparse
import atexit
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import cv2
import librosa
import numpy as np
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Constants / defaults
# ---------------------------------------------------------------------------

DEFAULT_QUALITY = 720
DEFAULT_MIN_CLIP_DUR = 0.5   # seconds
DEFAULT_MAX_CLIP_DUR = 4.0   # seconds
DEFAULT_SAMPLE_FPS = 5       # fps used for motion analysis pass
DEFAULT_RECENCY_K = 3        # how many recently-used segments to avoid re-picking
TARGET_FPS = 30              # output video framerate


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class MotionSegment:
    start_time: float   # seconds into the source video
    end_time: float     # seconds into the source video
    score: float        # 0.0–1.0 motion intensity (normalised)
    duration: float     # end_time - start_time


@dataclass
class ClipSpec:
    source_start: float   # cut from here in the raw video
    source_end: float     # cut to here in the raw video
    duration: float       # how long this clip plays in the final video


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args():
    p = argparse.ArgumentParser(
        description="Generate a boxing highlight video auto-cut to a song's beat."
    )
    p.add_argument("--youtube", required=True, metavar="URL",
                   help="YouTube URL of the boxing video to download")
    p.add_argument("--song", required=True, metavar="PATH",
                   help="Path to the local song/music file (MP3, WAV, FLAC, etc.)")
    p.add_argument("--output", default=None, metavar="PATH",
                   help="Output file path (default: highlight_<timestamp>.mp4)")
    p.add_argument("--quality", type=int, default=DEFAULT_QUALITY,
                   choices=[480, 720, 1080],
                   help="Max video resolution to download (default: 720)")
    p.add_argument("--min-clip-duration", type=float, default=DEFAULT_MIN_CLIP_DUR,
                   dest="min_clip_dur",
                   help="Shortest allowed clip in seconds (default: 0.5)")
    p.add_argument("--max-clip-duration", type=float, default=DEFAULT_MAX_CLIP_DUR,
                   dest="max_clip_dur",
                   help="Longest allowed clip in seconds (default: 4.0)")
    p.add_argument("--sample-fps", type=int, default=DEFAULT_SAMPLE_FPS,
                   dest="sample_fps",
                   help="Frames per second for motion analysis (default: 5)")
    p.add_argument("--keep-temp", action="store_true",
                   help="Keep temp files after rendering (useful for debugging)")
    p.add_argument("--verbose", action="store_true",
                   help="Print detailed progress information")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Phase 0 — Validation and setup
# ---------------------------------------------------------------------------

def validate_inputs(song_path: str, youtube_url: str):
    if not os.path.isfile(song_path):
        sys.exit(f"Error: Song file not found: {song_path}")
    if not (youtube_url.startswith("http://") or youtube_url.startswith("https://")):
        sys.exit(f"Error: Invalid YouTube URL: {youtube_url}")
    if shutil.which("ffmpeg") is None:
        sys.exit("Error: ffmpeg not found. Install it with:\n"
                 "  Ubuntu/Debian: sudo apt install ffmpeg\n"
                 "  macOS:         brew install ffmpeg")


def create_temp_dir(keep_temp: bool) -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="boxing_edit_"))
    if not keep_temp:
        atexit.register(shutil.rmtree, tmp, True)
    else:
        print(f"  Temp dir: {tmp}")
    return tmp


# ---------------------------------------------------------------------------
# Phase 1 — Download boxing video
# ---------------------------------------------------------------------------

def download_video(url: str, temp_dir: Path, quality: int, verbose: bool) -> Path:
    try:
        import yt_dlp
    except ImportError:
        sys.exit("Error: yt-dlp not installed. Run: pip install yt-dlp")

    out_path = temp_dir / "boxing_raw.mp4"
    ydl_opts = {
        "format": (
            f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]"
            f"/best[height<={quality}][ext=mp4]/best"
        ),
        "outtmpl": str(temp_dir / "boxing_raw.%(ext)s"),
        "merge_output_format": "mp4",
        "quiet": not verbose,
        "no_warnings": not verbose,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            # yt-dlp may have named the file with an extension other than .mp4
            # if fallback format was used; find it
            downloaded = list(temp_dir.glob("boxing_raw.*"))
            if not downloaded:
                sys.exit("Error: Download succeeded but output file not found.")
            actual = downloaded[0]
            if actual != out_path:
                actual.rename(out_path)
    except Exception as e:
        sys.exit(f"Error downloading video: {e}")

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"      Downloaded: {out_path.name} ({size_mb:.0f} MB)")
    return out_path


# ---------------------------------------------------------------------------
# Phase 2 — Beat detection
# ---------------------------------------------------------------------------

def detect_beats(song_path: str, min_clip_dur: float, max_clip_dur: float,
                 verbose: bool) -> tuple[np.ndarray, float]:
    """
    Returns (beat_times_array, song_duration_seconds).
    beat_times_array contains filtered timestamps in seconds.
    """
    try:
        y, sr = librosa.load(song_path, sr=None, mono=True)
    except Exception as e:
        sys.exit(f"Error loading song file: {e}\n"
                 "Ensure the file is a valid audio format (MP3, WAV, FLAC, M4A, etc.)")

    song_duration = len(y) / sr

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, aggregate=np.median)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, units="frames", trim=False
    )
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)

    if verbose:
        print(f"      Raw BPM: {float(tempo):.1f} | Raw beat count: {len(beat_times)}")

    # --- Filter: merge beats that are too close together ---
    filtered = [beat_times[0]]
    for t in beat_times[1:]:
        if t - filtered[-1] >= min_clip_dur:
            filtered.append(t)

    # --- Subdivide: inject synthetic cuts in gaps that are too wide ---
    final_beats = []
    for i in range(len(filtered) - 1):
        final_beats.append(filtered[i])
        gap = filtered[i + 1] - filtered[i]
        if gap > max_clip_dur:
            n_sub = int(gap / max_clip_dur)
            step = gap / (n_sub + 1)
            for k in range(1, n_sub + 1):
                final_beats.append(filtered[i] + k * step)
    final_beats.append(filtered[-1])

    # Make sure we don't exceed song duration
    final_beats = [t for t in final_beats if t <= song_duration]
    if final_beats[-1] < song_duration - max_clip_dur:
        final_beats.append(song_duration)

    beat_arr = np.array(final_beats)
    n_clips = len(beat_arr) - 1

    if n_clips < 2:
        # Fallback: divide song uniformly at max_clip_dur intervals
        beat_arr = np.arange(0, song_duration + max_clip_dur, max_clip_dur)
        beat_arr = beat_arr[beat_arr <= song_duration]
        n_clips = len(beat_arr) - 1

    print(f"      Song duration: {song_duration/60:.1f}m | "
          f"BPM: {float(tempo):.1f} | Clips: {n_clips}")
    return beat_arr, song_duration


# ---------------------------------------------------------------------------
# Phase 3 — Motion scoring
# ---------------------------------------------------------------------------

def score_video_segments(video_path: Path, beat_times: np.ndarray,
                         sample_fps: int, verbose: bool) -> list[MotionSegment]:
    """
    Score every beat-interval window in the video by motion intensity.
    Returns a list of MotionSegment, one per beat interval in the video.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        sys.exit(f"Error: Cannot open video file: {video_path}")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    video_duration = total_frames / native_fps

    # How many native frames to skip between sampled frames
    frame_skip = max(1, int(native_fps / sample_fps))
    n_samples = total_frames // frame_skip

    print(f"      Video duration: {video_duration/60:.1f}m | "
          f"Analyzing ~{n_samples} frames at {sample_fps} fps sample rate...")

    # --- Sequential frame-difference scoring ---
    timestamps = []
    raw_scores = []

    prev_gray = None
    frame_idx = 0
    failed_frames = 0

    pbar = tqdm(total=n_samples, unit="frame", disable=not verbose,
                desc="      Motion scoring", ncols=80)

    while True:
        ret, frame = cap.read()
        if not ret:
            failed_frames += 1
            if failed_frames > 20:
                break
            continue

        if frame_idx % frame_skip == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (5, 5), 0)

            if prev_gray is not None:
                diff = cv2.absdiff(prev_gray, gray)
                score = float(diff.mean())
                t = frame_idx / native_fps
                timestamps.append(t)
                raw_scores.append(score)
                pbar.update(1)

            prev_gray = gray

        frame_idx += 1

    pbar.close()
    cap.release()

    if not raw_scores:
        sys.exit("Error: Could not extract any frames from video.")

    timestamps = np.array(timestamps)
    raw_scores = np.array(raw_scores)

    # --- Smooth scores with rolling average (~0.5s window) ---
    window = max(1, int(sample_fps * 0.5))
    kernel = np.ones(window) / window
    scores_smooth = np.convolve(raw_scores, kernel, mode="same")

    # --- Normalise to [0, 1] ---
    s_min, s_max = scores_smooth.min(), scores_smooth.max()
    if s_max > s_min:
        scores_norm = (scores_smooth - s_min) / (s_max - s_min)
    else:
        scores_norm = np.zeros_like(scores_smooth)

    # --- Build one MotionSegment per beat interval that fits in the video ---
    segments = []
    for i in range(len(beat_times) - 1):
        t_start = beat_times[i]
        t_end = beat_times[i + 1]

        if t_start >= video_duration:
            break  # beat interval is beyond video length

        t_end = min(t_end, video_duration)
        mask = (timestamps >= t_start) & (timestamps < t_end)
        seg_score = float(scores_norm[mask].mean()) if mask.any() else 0.0

        segments.append(MotionSegment(
            start_time=t_start,
            end_time=t_end,
            score=seg_score,
            duration=t_end - t_start,
        ))

    # If all scores are zero (static image / broadcast card), randomise
    if all(s.score == 0.0 for s in segments):
        for s in segments:
            s.score = float(np.random.random())

    above_70 = sum(1 for s in segments if s.score >= 0.7)
    print(f"      Video segments scored: {len(segments)} | "
          f"High-action (>70th pct): {above_70}")

    return segments, scores_norm, timestamps, video_duration


# ---------------------------------------------------------------------------
# Phase 4 — Beat-to-clip mapping
# ---------------------------------------------------------------------------

def find_peak_moment(seg: MotionSegment, timestamps: np.ndarray,
                     scores: np.ndarray) -> float:
    """Return the timestamp of the highest-score frame within a segment."""
    mask = (timestamps >= seg.start_time) & (timestamps < seg.end_time)
    if not mask.any():
        return (seg.start_time + seg.end_time) / 2.0
    idx = np.argmax(scores[mask])
    return float(timestamps[mask][idx])


def map_beats_to_clips(beat_times: np.ndarray, segments: list[MotionSegment],
                       song_duration: float, video_duration: float,
                       timestamps: np.ndarray, scores: np.ndarray) -> list[ClipSpec]:
    """
    Assign one video clip per beat interval using greedy top-score selection
    with a recency penalty to avoid repeating the same clip too often.
    """
    n_clips = len(beat_times) - 1
    k = max(1, min(DEFAULT_RECENCY_K, len(segments) // 3))

    # Sort segments by score descending for greedy selection
    ranked = sorted(range(len(segments)), key=lambda i: segments[i].score, reverse=True)

    recently_used = []
    clip_specs = []

    for slot in range(n_clips):
        clip_duration = beat_times[slot + 1] - beat_times[slot]

        # Find the highest-scored segment not recently used
        chosen_idx = None
        for idx in ranked:
            if idx not in recently_used:
                chosen_idx = idx
                break

        # If all segments were recently used, reset and pick the best overall
        if chosen_idx is None:
            recently_used.clear()
            chosen_idx = ranked[0]

        seg = segments[chosen_idx]

        # Center the clip on the peak-score moment
        peak_t = find_peak_moment(seg, timestamps, scores)
        half_d = clip_duration / 2.0
        src_start = max(0.0, peak_t - half_d)
        src_end = src_start + clip_duration

        # Clamp to video bounds
        if src_end > video_duration:
            src_end = video_duration
            src_start = max(0.0, src_end - clip_duration)

        clip_specs.append(ClipSpec(
            source_start=src_start,
            source_end=src_end,
            duration=src_end - src_start,
        ))

        # Update recency queue
        recently_used.append(chosen_idx)
        if len(recently_used) > k:
            recently_used.pop(0)

    reuse_count = n_clips - len(set(
        round(c.source_start, 1) for c in clip_specs
    ))
    reuse_pct = 100.0 * reuse_count / max(n_clips, 1)
    print(f"      {n_clips} clips mapped | Reuse rate: {reuse_pct:.1f}%")
    return clip_specs


# ---------------------------------------------------------------------------
# Phase 5 — Assembly and render
# ---------------------------------------------------------------------------

def assemble_video(clip_specs: list[ClipSpec], raw_video_path: Path,
                   song_path: str, output_path: Path, quality: int,
                   verbose: bool):
    try:
        from moviepy.editor import AudioFileClip, VideoFileClip, concatenate_videoclips
    except ImportError:
        sys.exit("Error: moviepy not installed. Run: pip install moviepy")

    target_height = quality  # 480, 720, or 1080

    print(f"      Opening source video...")
    raw = VideoFileClip(str(raw_video_path))

    clips = []
    print(f"      Extracting {len(clip_specs)} clips...")
    for spec in tqdm(clip_specs, desc="      Slicing", unit="clip",
                     disable=not verbose, ncols=80):
        # Clamp to actual video duration
        t_start = max(0.0, min(spec.source_start, raw.duration - 0.1))
        t_end = max(t_start + 0.1, min(spec.source_end, raw.duration))

        sub = raw.subclip(t_start, t_end)
        sub = sub.resize(height=target_height)
        sub = sub.without_audio()
        clips.append(sub)

    print(f"      Concatenating clips...")
    final_video = concatenate_videoclips(clips, method="compose")

    print(f"      Attaching song audio...")
    song_audio = AudioFileClip(song_path)
    video_dur = final_video.duration
    if song_audio.duration > video_dur:
        song_audio = song_audio.subclip(0, video_dur)

    final = final_video.set_audio(song_audio)

    print(f"      Rendering to {output_path.name}...")
    final.write_videofile(
        str(output_path),
        codec="libx264",
        audio_codec="aac",
        fps=TARGET_FPS,
        preset="medium",
        threads=os.cpu_count() or 2,
        logger="bar" if verbose else None,
    )

    raw.close()
    song_audio.close()
    final_video.close()
    final.close()


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def main():
    import time
    args = parse_args()

    song_path = os.path.abspath(args.song)
    output_path = Path(args.output) if args.output else Path(
        f"highlight_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
    )

    print("\n=== Boxing Edit Automation ===\n")

    # Phase 0 — Validate
    validate_inputs(song_path, args.youtube)
    temp_dir = create_temp_dir(args.keep_temp)

    # Phase 1 — Download
    t0 = time.time()
    print(f"[1/5] Downloading boxing video ({args.quality}p)...")
    video_path = download_video(args.youtube, temp_dir, args.quality, args.verbose)
    print(f"      Done in {time.time()-t0:.0f}s\n")

    # Phase 2 — Beat detection
    t0 = time.time()
    print(f"[2/5] Analyzing song beats...")
    beat_times, song_duration = detect_beats(
        song_path, args.min_clip_dur, args.max_clip_dur, args.verbose
    )
    print(f"      Done in {time.time()-t0:.0f}s\n")

    # Phase 3 — Motion scoring
    t0 = time.time()
    print(f"[3/5] Scoring video motion...")
    segments, scores_norm, timestamps, video_duration = score_video_segments(
        video_path, beat_times, args.sample_fps, args.verbose
    )
    print(f"      Done in {time.time()-t0:.0f}s\n")

    # Phase 4 — Mapping
    t0 = time.time()
    print(f"[4/5] Mapping beats to clips...")
    clip_specs = map_beats_to_clips(
        beat_times, segments, song_duration, video_duration,
        timestamps, scores_norm
    )
    print(f"      Done in {time.time()-t0:.0f}s\n")

    # Phase 5 — Render
    t0 = time.time()
    print(f"[5/5] Rendering highlight video...")
    assemble_video(clip_specs, video_path, song_path, output_path,
                   args.quality, args.verbose)
    render_time = time.time() - t0
    print(f"      Done in {render_time:.0f}s\n")

    size_mb = output_path.stat().st_size / (1024 * 1024)
    dur_min = song_duration / 60
    print(f"Output: {output_path} ({dur_min:.1f}m, {size_mb:.0f} MB)\n")


if __name__ == "__main__":
    main()
