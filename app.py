import os
import json
import uuid
import threading
import subprocess
import tempfile
import re
import time
import shutil
from pathlib import Path

from flask import Flask, request, jsonify, send_file, render_template

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 1024  # 1GB

UPLOAD_DIR = Path('static/uploads')
OUTPUT_DIR = Path('static/outputs')
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_MODEL = 'llama3.1:8b'
OLLAMA_URL = 'http://localhost:11434/api/generate'

SINGLE_FILLERS = {'um', 'uh', 'like', 'so', 'basically', 'literally',
                  'actually', 'just', 'okay', 'right', 'hmm', 'ah', 'er'}
MULTI_FILLERS = {'you know', 'i mean'}

jobs = {}


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

def transcribe(video_path):
    from faster_whisper import WhisperModel
    model = WhisperModel('base.en', device='cpu', compute_type='int8')
    segments, _ = model.transcribe(
        str(video_path),
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={'min_silence_duration_ms': 400},
    )
    words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                words.append({'word': w.word.strip(), 'start': w.start, 'end': w.end})
    return words


def remove_fillers(words):
    clean = []
    i = 0
    while i < len(words):
        bare = words[i]['word'].lower().strip('.,!?;:')
        if i + 1 < len(words):
            two = bare + ' ' + words[i + 1]['word'].lower().strip('.,!?;:')
            if two in MULTI_FILLERS:
                i += 2
                continue
        if bare not in SINGLE_FILLERS:
            clean.append(words[i])
        i += 1
    return clean


def split_sentences(words, pause_threshold=0.7):
    if not words:
        return []
    sentences, current = [], [words[0]]
    for i in range(1, len(words)):
        prev, curr = words[i - 1], words[i]
        pause = curr['start'] - prev['end']
        ends = bool(re.search(r'[.!?]$', prev['word'].strip()))
        if pause > pause_threshold or ends:
            if current:
                sentences.append(current)
            current = [curr]
        else:
            current.append(curr)
    if current:
        sentences.append(current)
    return sentences


def sentences_to_meta(sentence_groups):
    return [
        {
            'id': i,
            'text': ' '.join(w['word'] for w in grp),
            'start': grp[0]['start'],
            'end': grp[-1]['end'],
        }
        for i, grp in enumerate(sentence_groups)
    ]


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------

def call_ollama(prompt):
    try:
        import requests
        resp = requests.post(
            OLLAMA_URL,
            json={
                'model': OLLAMA_MODEL,
                'prompt': prompt,
                'stream': False,
                'options': {'temperature': 0.7, 'num_predict': 2048},
            },
            timeout=180,
        )
        resp.raise_for_status()
        text = resp.json().get('response', '')
        m = re.search(r'\[.*\]', text, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as e:
        print(f'[ollama] error: {e}')
    return None


# ---------------------------------------------------------------------------
# Fallback
# ---------------------------------------------------------------------------

def basic_fallback(ids):
    n = len(ids)
    variants = [{'label': 'Original', 'reasoning': 'As spoken.', 'order': list(ids)}]
    if n > 2:
        variants.append({'label': 'Reversed', 'reasoning': 'Reversed for contrast.', 'order': list(reversed(ids))})
    if n > 4:
        mid = n // 2
        variants.append({
            'label': 'Back Half First',
            'reasoning': 'Conclusion leads.',
            'order': list(ids[mid:]) + list(ids[:mid]),
        })
    return variants


# ---------------------------------------------------------------------------
# FFmpeg helpers
# ---------------------------------------------------------------------------

def seconds_to_srt(s):
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    ms = int(round((s % 1) * 1000))
    return f'{h:02d}:{m:02d}:{sec:02d},{ms:03d}'


def build_srt(entries):
    """entries: list of {text, start, end} with already-offset times."""
    lines = []
    for i, e in enumerate(entries, 1):
        lines.append(f"{i}\n{seconds_to_srt(e['start'])} --> {seconds_to_srt(e['end'])}\n{e['text']}\n")
    return '\n'.join(lines)


def probe_duration(path):
    r = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
         '-of', 'default=noprint_wrappers=1:nokey=1', str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(r.stdout.strip())
    except Exception:
        return 0.0


def extract_clip(src, start, end, dst):
    subprocess.run(
        ['ffmpeg', '-y', '-ss', str(start), '-i', str(src),
         '-t', str(max(0.1, end - start)),
         '-c:v', 'libx264', '-c:a', 'aac',
         '-avoid_negative_ts', 'make_zero', str(dst)],
        check=True, capture_output=True,
    )


def concat_clips(paths, dst):
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        for p in paths:
            f.write(f"file '{os.path.abspath(p)}'\n")
        lst = f.name
    subprocess.run(
        ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', lst,
         '-c:v', 'libx264', '-c:a', 'aac', str(dst)],
        check=True, capture_output=True,
    )
    os.unlink(lst)


# ---------------------------------------------------------------------------
# In-My-Room processing
# ---------------------------------------------------------------------------

def process_room_job(job_id, video_path):
    job = jobs[job_id]
    try:
        job['status'] = 'Transcribing audio…'
        words = transcribe(video_path)

        job['status'] = 'Removing filler words…'
        clean = remove_fillers(words)

        job['status'] = 'Splitting into sentences…'
        groups = split_sentences(clean)
        sentences = sentences_to_meta(groups)

        job['stats'] = {
            'word_count': len(words),
            'clean_count': len(clean),
            'sentence_count': len(sentences),
        }

        if not sentences:
            job['status'] = 'error'
            job['error'] = 'No speech detected in video.'
            return

        job['status'] = 'Asking Ollama for rearrangements…'
        numbered = '\n'.join(f"[{s['id']}] {s['text']}" for s in sentences)
        prompt = f"""You are editing a 30-second talking-head documentary episode called "In My Room" — poetic, deadpan, mythology-building, a music producer reflecting on their creative life.

Here are the numbered sentences from the transcript:
{numbered}

Generate up to 10 semantically valid rearrangements or subsets of these sentences where the main point still lands. You may omit sentences, repeat a sentence id as a bookend, or start anywhere.

Return ONLY a JSON array of objects with exactly these keys:
- label: short descriptive string
- reasoning: one sentence explaining why this ordering works
- order: array of sentence ids (integers)

Example: [{{"label":"Cold Open","reasoning":"Starting with the hook creates immediate tension.","order":[3,0,1,4]}}]

Return only the JSON array, no other text."""

        variants = call_ollama(prompt) or basic_fallback([s['id'] for s in sentences])

        job['status'] = 'Rendering video variants…'
        out_base = OUTPUT_DIR / job_id
        out_base.mkdir(exist_ok=True)
        job['variants'] = []

        for vi, var in enumerate(variants):
            try:
                order = [o for o in var.get('order', []) if 0 <= o < len(sentences)]
                if not order:
                    continue

                clips, srt_entries = [], []
                cursor = 0.0

                for sid in order:
                    s = sentences[sid]
                    cp = out_base / f'clip_{vi}_{sid}.mp4'
                    extract_clip(video_path, s['start'], s['end'], cp)
                    dur = s['end'] - s['start']
                    clips.append(cp)
                    srt_entries.append({'text': s['text'], 'start': cursor, 'end': cursor + dur})
                    cursor += dur

                mp4 = out_base / f'variant_{vi}.mp4'
                concat_clips(clips, mp4)

                srt = out_base / f'variant_{vi}.srt'
                srt.write_text(build_srt(srt_entries))

                for cp in clips:
                    cp.unlink(missing_ok=True)

                job['variants'].append({
                    'label': var.get('label', f'Variant {vi + 1}'),
                    'reasoning': var.get('reasoning', ''),
                    'mp4': f'/static/outputs/{job_id}/variant_{vi}.mp4',
                    'srt': f'/static/outputs/{job_id}/variant_{vi}.srt',
                })
                job['status'] = f'Rendered {len(job["variants"])} variant(s)…'
            except Exception as e:
                print(f'[room] variant {vi} error: {e}')

        job['status'] = 'complete'

    except Exception as e:
        job['status'] = 'error'
        job['error'] = str(e)
        import traceback; traceback.print_exc()


# ---------------------------------------------------------------------------
# Mockumentary processing
# ---------------------------------------------------------------------------

def process_mockumentary_job(job_id, clips_data):
    job = jobs[job_id]
    try:
        transcripts = []
        for i, c in enumerate(clips_data):
            job['status'] = f'Transcribing clip {i + 1}/{len(clips_data)}: {c["label"]}…'
            words = transcribe(c['path'])
            clean = remove_fillers(words)
            groups = split_sentences(clean)
            sents = sentences_to_meta(groups)
            transcripts.append({
                'index': i,
                'label': c['label'],
                'path': c['path'],
                'sentences': sents,
                'word_count': len(words),
                'clean_count': len(clean),
            })

        job['stats'] = {
            'word_count': sum(t['word_count'] for t in transcripts),
            'clean_count': sum(t['clean_count'] for t in transcripts),
            'sentence_count': sum(len(t['sentences']) for t in transcripts),
        }

        job['status'] = 'Asking Ollama for scene orderings…'
        descriptions = '\n\n'.join(
            f"Clip {t['index']} — {t['label']}:\n" + ' '.join(s['text'] for s in t['sentences'])
            for t in transcripts
        )
        n_clips = len(transcripts)
        prompt = f"""You are editing a mockumentary documentary. Here are the clips with their transcripts:

{descriptions}

Generate up to 10 valid scene orderings where the documentary narrative makes sense. Consider story arc, emotional flow, and thematic coherence.

Return ONLY a JSON array of objects with exactly these keys:
- label: short descriptive string
- reasoning: one sentence explaining why this ordering works narratively
- order: array of clip indices (integers 0–{n_clips - 1})

Example: [{{"label":"Build to Climax","reasoning":"Quiet opening builds to the most intense moment.","order":[0,2,1,3]}}]

Return only the JSON array, no other text."""

        variants = call_ollama(prompt) or basic_fallback(list(range(n_clips)))

        job['status'] = 'Rendering video variants…'
        out_base = OUTPUT_DIR / job_id
        out_base.mkdir(exist_ok=True)
        job['variants'] = []

        for vi, var in enumerate(variants):
            try:
                order = [o for o in var.get('order', []) if 0 <= o < n_clips]
                if not order:
                    continue

                paths = [transcripts[idx]['path'] for idx in order]
                mp4 = out_base / f'variant_{vi}.mp4'
                concat_clips(paths, mp4)

                srt_entries = []
                cursor = 0.0
                for idx in order:
                    t = transcripts[idx]
                    clip_dur = probe_duration(t['path'])
                    for s in t['sentences']:
                        srt_entries.append({
                            'text': s['text'],
                            'start': cursor + s['start'],
                            'end': cursor + s['end'],
                        })
                    cursor += clip_dur

                srt = out_base / f'variant_{vi}.srt'
                srt.write_text(build_srt(srt_entries))

                job['variants'].append({
                    'label': var.get('label', f'Variant {vi + 1}'),
                    'reasoning': var.get('reasoning', ''),
                    'mp4': f'/static/outputs/{job_id}/variant_{vi}.mp4',
                    'srt': f'/static/outputs/{job_id}/variant_{vi}.srt',
                })
                job['status'] = f'Rendered {len(job["variants"])} variant(s)…'
            except Exception as e:
                print(f'[mockumentary] variant {vi} error: {e}')

        job['status'] = 'complete'

    except Exception as e:
        job['status'] = 'error'
        job['error'] = str(e)
        import traceback; traceback.print_exc()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload/room', methods=['POST'])
def upload_room():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file'}), 400
    f = request.files['video']
    if not f.filename:
        return jsonify({'error': 'Empty filename'}), 400

    job_id = str(uuid.uuid4())
    ext = Path(f.filename).suffix or '.mp4'
    path = UPLOAD_DIR / f'{job_id}{ext}'
    f.save(str(path))

    jobs[job_id] = {'status': 'Queued…', 'variants': [], 'stats': {}, 'mode': 'room'}
    t = threading.Thread(target=process_room_job, args=(job_id, path), daemon=True)
    t.start()
    return jsonify({'job_id': job_id})


@app.route('/upload/mockumentary', methods=['POST'])
def upload_mockumentary():
    clips_data = []
    i = 0
    while f'clip_{i}' in request.files:
        f = request.files[f'clip_{i}']
        label = request.form.get(f'label_{i}', f'Clip {i + 1}')
        if f and f.filename:
            ext = Path(f.filename).suffix or '.mp4'
            cid = str(uuid.uuid4())
            p = UPLOAD_DIR / f'{cid}{ext}'
            f.save(str(p))
            clips_data.append({'path': p, 'label': label})
        i += 1

    if not clips_data:
        return jsonify({'error': 'No clips uploaded'}), 400

    job_id = str(uuid.uuid4())
    jobs[job_id] = {'status': 'Queued…', 'variants': [], 'stats': {}, 'mode': 'mockumentary'}
    t = threading.Thread(target=process_mockumentary_job, args=(job_id, clips_data), daemon=True)
    t.start()
    return jsonify({'job_id': job_id})


@app.route('/status/<job_id>')
def status(job_id):
    if job_id not in jobs:
        return jsonify({'error': 'Job not found'}), 404
    j = jobs[job_id]
    return jsonify({
        'status': j['status'],
        'variants': j.get('variants', []),
        'stats': j.get('stats', {}),
        'error': j.get('error'),
    })


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=False)
