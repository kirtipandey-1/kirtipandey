#!/usr/bin/env python3
"""
web_server.py — Mobile web interface for the boxing edit automation tool.

Usage:
    python web_server.py
    # Then open http://<your-ip>:5000 on your phone (same WiFi)

Press Ctrl+C to stop.
"""

import json
import os
import queue
import shutil
import sys
import tempfile
import threading
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, request, send_file, render_template

# Import processing pipeline from boxing_edit.py
sys.path.insert(0, str(Path(__file__).parent))
from boxing_edit import (
    DEFAULT_MAX_CLIP_DUR,
    DEFAULT_MIN_CLIP_DUR,
    DEFAULT_QUALITY,
    DEFAULT_SAMPLE_FPS,
    assemble_video,
    create_temp_dir,
    detect_beats,
    download_video,
    map_beats_to_clips,
    score_video_segments,
)

import numpy as np

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200 MB upload limit

# ---------------------------------------------------------------------------
# In-memory job store
# ---------------------------------------------------------------------------

jobs: dict[str, dict] = {}
# job_id → {
#   "q": queue.Queue,       progress message queue
#   "output": Path | None,  path to finished MP4
#   "status": str,          "running" | "done" | "error"
#   "temp_dir": Path,       cleaned up after 1 hour
# }

JOBS_DIR = Path(tempfile.gettempdir()) / "boxing_jobs"
JOBS_DIR.mkdir(exist_ok=True)


def _schedule_cleanup(job_id: str, delay_seconds: int = 3600):
    """Delete job files after delay_seconds (default 1 hour)."""
    def _clean():
        job = jobs.pop(job_id, None)
        if job:
            td = job.get("temp_dir")
            if td and td.exists():
                shutil.rmtree(td, ignore_errors=True)
    t = threading.Timer(delay_seconds, _clean)
    t.daemon = True
    t.start()


# ---------------------------------------------------------------------------
# Background job runner
# ---------------------------------------------------------------------------

def _run_job(job_id: str, youtube_url: str, song_path: str,
             duration: float | None, quality: int, vertical: bool):
    q = jobs[job_id]["q"]

    def progress(phase: int, message: str, done: bool = False):
        q.put(json.dumps({"phase": phase, "message": message, "done": done}))

    def error(message: str):
        q.put(json.dumps({"error": message}))
        jobs[job_id]["status"] = "error"

    try:
        temp_dir = Path(tempfile.mkdtemp(prefix=f"boxing_{job_id[:8]}_"))
        jobs[job_id]["temp_dir"] = temp_dir

        # Phase 1 — Download
        progress(1, "Downloading boxing video from YouTube...")
        video_path = download_video(youtube_url, temp_dir, quality, verbose=False)
        progress(1, f"Download complete")

        # Phase 2 — Beat detection
        progress(2, "Analyzing song beats...")
        beat_times, song_duration = detect_beats(
            song_path, DEFAULT_MIN_CLIP_DUR, DEFAULT_MAX_CLIP_DUR, verbose=False
        )
        if duration and duration < song_duration:
            beat_times = beat_times[beat_times <= duration]
            if len(beat_times) == 0 or beat_times[-1] < duration:
                beat_times = np.append(beat_times, duration)
            song_duration = duration
        n_clips = len(beat_times) - 1
        progress(2, f"Detected {n_clips} beat cuts")

        # Phase 3 — Motion scoring
        progress(3, "Scoring action moments in video...")
        segments, scores_norm, timestamps, video_duration = score_video_segments(
            video_path, beat_times, DEFAULT_SAMPLE_FPS, verbose=False
        )
        progress(3, f"Motion analysis complete")

        # Phase 4 — Mapping
        progress(4, "Mapping beats to best clips...")
        clip_specs = map_beats_to_clips(
            beat_times, segments, song_duration, video_duration,
            timestamps, scores_norm
        )
        progress(4, f"Mapped {len(clip_specs)} clips")

        # Phase 5 — Render
        progress(5, "Rendering final video...")
        output_path = temp_dir / f"highlight_{job_id[:8]}.mp4"
        assemble_video(
            clip_specs, video_path, song_path, output_path,
            quality, vertical, verbose=False
        )

        jobs[job_id]["output"] = output_path
        jobs[job_id]["status"] = "done"
        size_mb = output_path.stat().st_size / (1024 * 1024)
        progress(5, f"Done! {size_mb:.0f} MB — ready to download", done=True)

    except Exception as e:
        error(str(e))
    finally:
        q.put(None)  # sentinel: SSE stream can close
        _schedule_cleanup(job_id)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate():
    youtube_url = request.form.get("youtube_url", "").strip()
    duration_str = request.form.get("duration", "")
    quality = int(request.form.get("quality", DEFAULT_QUALITY))
    vertical = request.form.get("horizontal") != "true"

    if not youtube_url:
        return {"error": "YouTube URL is required"}, 400

    song_file = request.files.get("song")
    if not song_file or not song_file.filename:
        return {"error": "Song file is required"}, 400

    # Save uploaded song to a temp file
    suffix = Path(song_file.filename).suffix or ".mp3"
    tmp_song = tempfile.NamedTemporaryFile(
        delete=False, suffix=suffix, dir=JOBS_DIR
    )
    song_file.save(tmp_song.name)
    tmp_song.close()

    duration = float(duration_str) if duration_str and duration_str != "full" else None

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "q": queue.Queue(),
        "output": None,
        "status": "running",
        "temp_dir": None,
    }

    thread = threading.Thread(
        target=_run_job,
        args=(job_id, youtube_url, tmp_song.name, duration, quality, vertical),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@app.route("/progress/<job_id>")
def progress(job_id: str):
    if job_id not in jobs:
        return {"error": "Job not found"}, 404

    def stream():
        q = jobs[job_id]["q"]
        while True:
            try:
                msg = q.get(timeout=60)
            except queue.Empty:
                yield "data: {\"error\": \"Job timed out\"}\n\n"
                break
            if msg is None:
                break
            yield f"data: {msg}\n\n"

    return Response(stream(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache",
                              "X-Accel-Buffering": "no"})


@app.route("/download/<job_id>")
def download(job_id: str):
    job = jobs.get(job_id)
    if not job:
        return {"error": "Job not found"}, 404
    if job["status"] != "done" or not job["output"]:
        return {"error": "Video not ready yet"}, 400

    output_path = job["output"]
    filename = f"boxing_edit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
    return send_file(str(output_path), as_attachment=True,
                     download_name=filename, mimetype="video/mp4")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Print the local IP so the user can open it on their phone
    import socket
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = "127.0.0.1"

    print("\n=== Boxing Edit — Web Server ===")
    print(f"\n  Local:   http://localhost:5000")
    print(f"  Network: http://{local_ip}:5000")
    print("\n  Open the Network URL on your phone (same WiFi required)")
    print("  Press Ctrl+C to stop\n")

    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
