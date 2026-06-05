"""
AI-powered clip selection using a local Ollama LLM.
Falls back to a speech-density heuristic when Ollama is unavailable.
"""

import json


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

_SYSTEM = """\
You are an expert short-form video editor who finds viral clips inside long-form content.
Identify the most engaging 30-90 second segments for TikTok, Instagram Reels, and YouTube Shorts.

Prioritise:
- Strong hooks: bold claims, surprising facts, or unanswered questions in the first 5 seconds
- Emotional peaks: funny, inspiring, shocking, or deeply relatable moments
- Standalone value: tips or insights that make sense without prior context
- Narrative completeness: a clear beginning, middle, and end within the clip

Avoid:
- Clips that start or end mid-sentence
- Pure intros/outros with no substance
- Segments that require too much prior context
"""


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------


def select_clips(
    transcript: dict,
    n_clips: int = 3,
    min_duration: float = 30.0,
    max_duration: float = 90.0,
    model: str = "llama3.2",
) -> list:
    """
    Return a list of clip dicts, each with keys:
        start, end, title, score, reason, words
    """
    try:
        clips = _ollama_select(transcript, n_clips, min_duration, max_duration, model)
        if clips:
            return clips
        print("      Ollama returned no valid clips — falling back to heuristic.")
    except Exception as exc:
        print(f"      Ollama unavailable ({exc}) — using heuristic clip selection.")

    return _heuristic_select(transcript, n_clips, min_duration, max_duration)


# ---------------------------------------------------------------------------
# Ollama-based selection
# ---------------------------------------------------------------------------


def _ollama_select(
    transcript: dict,
    n_clips: int,
    min_duration: float,
    max_duration: float,
    model: str,
) -> list:
    try:
        import ollama
    except ImportError:
        raise RuntimeError("ollama package not installed")

    # Build a compact transcript string (timestamps every segment)
    lines = [
        f"[{seg['start']:.1f}s] {seg['text']}"
        for seg in transcript["segments"]
    ]
    transcript_text = "\n".join(lines)

    # Keep prompt within reasonable size
    if len(transcript_text) > 14_000:
        transcript_text = transcript_text[:14_000] + "\n… [truncated]"

    user_prompt = f"""\
Select the {n_clips} best clips for short-form social media from this transcript.

Rules:
- Each clip: {min_duration:.0f}–{max_duration:.0f} seconds long
- Clips must NOT overlap
- Start/end at natural speech breaks (never mid-word)

Transcript:
{transcript_text}

Reply ONLY with raw JSON — no markdown, no explanation:
{{
  "clips": [
    {{
      "start": <seconds>,
      "end": <seconds>,
      "title": "<hook under 8 words>",
      "score": <1-10>,
      "reason": "<one sentence on why this will go viral>"
    }}
  ]
}}"""

    response = ollama.chat(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": user_prompt},
        ],
        options={"temperature": 0.3},
    )

    content = response["message"]["content"].strip()

    # Strip markdown fences if present
    for fence in ("```json", "```"):
        if fence in content:
            content = content.split(fence, 1)[1].rsplit("```", 1)[0].strip()
            break

    data = json.loads(content)
    raw_clips = data.get("clips", [])

    video_duration = transcript.get("duration", float("inf"))
    valid: list = []
    for c in raw_clips:
        start = max(0.0, float(c["start"]))
        end = min(float(c["end"]), video_duration)
        dur = end - start
        # Allow ±30 % slack on duration bounds
        if min_duration * 0.7 <= dur <= max_duration * 1.3:
            valid.append(
                {
                    "start": start,
                    "end": end,
                    "title": c.get("title", f"Clip {len(valid)+1}"),
                    "score": float(c.get("score", 7)),
                    "reason": c.get("reason", ""),
                    "words": _clip_words(transcript, start, end),
                }
            )

    return valid[:n_clips]


# ---------------------------------------------------------------------------
# Heuristic fallback
# ---------------------------------------------------------------------------


def _heuristic_select(
    transcript: dict,
    n_clips: int,
    min_duration: float,
    max_duration: float,
) -> list:
    segments = transcript["segments"]
    if not segments:
        return []

    video_duration = transcript.get("duration", segments[-1]["end"])
    target = (min_duration + max_duration) / 2.0

    # Score each segment by words-per-second (denser speech → more engaging)
    for seg in segments:
        dur = max(seg["end"] - seg["start"], 0.1)
        seg["_density"] = len(seg["text"].split()) / dur

    # Sliding window: all windows within [min_duration, max_duration]
    candidates: list = []
    for i, start_seg in enumerate(segments):
        t_start = start_seg["start"]
        total_density = 0.0
        count = 0
        for j in range(i, len(segments)):
            total_density += segments[j]["_density"]
            count += 1
            t_end = segments[j]["end"]
            dur = t_end - t_start
            if dur < min_duration:
                continue
            if dur > max_duration:
                break
            candidates.append(
                {
                    "start": t_start,
                    "end": t_end,
                    "duration": dur,
                    "avg_density": total_density / count,
                }
            )

    # If no window fits, fall back to equal splits
    if not candidates:
        for i in range(n_clips):
            t_start = i * (video_duration / n_clips)
            t_end = min(t_start + target, video_duration)
            candidates.append(
                {"start": t_start, "end": t_end, "duration": t_end - t_start, "avg_density": 1.0}
            )

    # Pick highest-density non-overlapping clips
    candidates.sort(key=lambda x: x["avg_density"], reverse=True)
    selected: list = []
    for cand in candidates:
        if len(selected) >= n_clips:
            break
        if any(cand["start"] < s["end"] and cand["end"] > s["start"] for s in selected):
            continue
        selected.append(cand)

    selected.sort(key=lambda x: x["start"])

    return [
        {
            "start": c["start"],
            "end": c["end"],
            "title": f"Best Moment {i + 1}",
            "score": round(c["avg_density"], 1),
            "reason": "Selected by speech-density heuristic",
            "words": _clip_words(transcript, c["start"], c["end"]),
        }
        for i, c in enumerate(selected)
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clip_words(transcript: dict, start: float, end: float) -> list:
    """Return words whose timing overlaps the clip window."""
    return [
        w
        for w in transcript["words"]
        if w["start"] >= start - 0.15 and w["end"] <= end + 0.15
    ]
