"""Audio transcription using faster-whisper with word-level timestamps."""

import sys
from pathlib import Path
from typing import Optional


def transcribe_video(
    video_path: Path,
    model_size: str = "base",
    language: Optional[str] = None,
) -> dict:
    """
    Transcribe a video file using faster-whisper.

    Returns a dict with keys:
        segments  – list of {start, end, text, words}
        words     – flat list of all {word, start, end, probability}
        full_text – concatenated transcript
        language  – detected or specified language code
        duration  – end time of last segment
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Error: faster-whisper not installed. Run: pip install faster-whisper")
        sys.exit(1)

    # Device/compute auto-selection: GPU if available, otherwise CPU with int8
    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
    except ImportError:
        device = "cpu"
        compute_type = "int8"

    print(f"      Loading Whisper '{model_size}' on {device} ({compute_type})…")
    model = WhisperModel(model_size, device=device, compute_type=compute_type)

    segments_gen, info = model.transcribe(
        str(video_path),
        language=language,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
    )

    segments: list = []
    all_words: list = []

    for seg in segments_gen:
        seg_words = []
        if seg.words:
            for w in seg.words:
                entry = {
                    "word": w.word,
                    "start": w.start,
                    "end": w.end,
                    "probability": w.probability,
                }
                seg_words.append(entry)
                all_words.append(entry)

        segments.append(
            {
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip(),
                "words": seg_words,
            }
        )

    full_text = " ".join(s["text"] for s in segments)
    duration = segments[-1]["end"] if segments else 0.0

    print(
        f"      {len(all_words):,} words · {len(segments)} segments · "
        f"language: {info.language}"
    )

    return {
        "segments": segments,
        "words": all_words,
        "full_text": full_text,
        "language": info.language,
        "duration": duration,
    }
