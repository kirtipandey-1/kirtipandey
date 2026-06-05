"""Video downloader using yt-dlp."""

import sys
from pathlib import Path


def download_video(url: str, output_dir: Path) -> Path:
    """Download a video from a URL using yt-dlp and return the local path."""
    try:
        import yt_dlp
    except ImportError:
        print("Error: yt-dlp not installed. Run: pip install yt-dlp")
        sys.exit(1)

    output_template = str(output_dir / "%(title).80s.%(ext)s")

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": output_template,
        "merge_output_format": "mp4",
        "quiet": False,
        "no_warnings": False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)

    # yt-dlp may write a .mp4 even if prepare_filename returns a different ext
    path = Path(filename).with_suffix(".mp4")
    if not path.exists():
        path = Path(filename)
    if not path.exists():
        # Search output_dir for the most recently modified mp4
        candidates = sorted(output_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        if candidates:
            path = candidates[0]

    return path
