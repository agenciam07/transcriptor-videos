import os
import math
import subprocess
import json
from datetime import datetime, timezone
from pathlib import Path

import httpx

GROQ_API_KEY = os.environ["GROQ_API_KEY"]
GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MAX_FILE_BYTES = 24 * 1024 * 1024  # 24 MB safety margin vs 25 MB Groq limit
CHUNK_DURATION_S = 600             # 10 minutes per chunk
CHUNK_OVERLAP_S = 5                # 5 s overlap to avoid cutting words


def get_audio_duration(wav_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            str(wav_path),
        ],
        capture_output=True, text=True, timeout=30,
    )
    data = json.loads(result.stdout)
    for stream in data.get("streams", []):
        if stream.get("duration"):
            return float(stream["duration"])
    return 0.0


def split_audio(wav_path: Path, tmp_dir: str) -> list:
    """Return list of (chunk_path, start_offset_seconds)."""
    duration = get_audio_duration(wav_path)
    num_chunks = math.ceil(duration / CHUNK_DURATION_S)
    chunks = []
    for i in range(num_chunks):
        start = i * CHUNK_DURATION_S
        chunk_path = Path(tmp_dir) / f"chunk_{i:04d}.wav"
        subprocess.run(
            [
                "ffmpeg", "-i", str(wav_path),
                "-ss", str(start),
                "-t", str(CHUNK_DURATION_S + CHUNK_OVERLAP_S),
                "-ac", "1", "-ar", "16000",
                str(chunk_path), "-y",
            ],
            capture_output=True, timeout=300, check=True,
        )
        chunks.append((chunk_path, start))
    return chunks


def transcribe_chunk(wav_path: Path, language: str = None) -> dict:
    with open(wav_path, "rb") as f:
        files = {"file": (wav_path.name, f, "audio/wav")}
        data = {
            "model": "whisper-large-v3-turbo",
            "response_format": "verbose_json",
        }
        if language:
            data["language"] = language
        response = httpx.post(
            GROQ_WHISPER_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            files=files,
            data=data,
            timeout=300,
        )
        response.raise_for_status()
        return response.json()


def format_srt_time(seconds: float) -> str:
    """Convert float seconds to SRT timestamp HH:MM:SS,mmm"""
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    # Guard against rounding to 1000 ms
    if ms >= 1000:
        ms = 999
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _duration_str(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def generate_outputs(result: dict, duration_seconds: int) -> tuple:
    """Return (text_plain, text_srt, text_md)."""
    segments = result.get("segments", [])
    detected_language = result.get("language", "desconocido")
    full_text = result.get("text", "").strip()

    # --- plain text ---
    text_plain = full_text

    # --- SRT ---
    srt_lines = []
    for i, seg in enumerate(segments, start=1):
        start_ts = format_srt_time(seg.get("start", 0))
        end_ts = format_srt_time(seg.get("end", 0))
        text = seg.get("text", "").strip()
        if text:
            srt_lines.append(f"{i}\n{start_ts} --> {end_ts}\n{text}\n")
    text_srt = "\n".join(srt_lines)

    # --- Markdown ---
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    text_md = (
        f"# Transcripción\n\n"
        f"- **Idioma detectado:** {detected_language}\n"
        f"- **Duración:** {_duration_str(duration_seconds)}\n"
        f"- **Fecha:** {today}\n\n"
        f"---\n\n"
        f"{full_text}\n"
    )

    return text_plain, text_srt, text_md


def transcribe_audio(wav_path: Path, language: str = None) -> dict:
    import tempfile

    file_size = wav_path.stat().st_size
    duration = get_audio_duration(wav_path)

    with tempfile.TemporaryDirectory() as tmp_dir:
        if file_size <= MAX_FILE_BYTES:
            result = transcribe_chunk(wav_path, language)
        else:
            chunks = split_audio(wav_path, tmp_dir)
            merged = {"text": "", "segments": [], "language": None}
            for chunk_path, offset in chunks:
                chunk_result = transcribe_chunk(chunk_path, language)
                for seg in chunk_result.get("segments", []):
                    seg["start"] += offset
                    seg["end"] += offset
                    merged["segments"].append(seg)
                chunk_text = chunk_result.get("text", "").strip()
                merged["text"] = (merged["text"] + " " + chunk_text).strip()
                if not merged["language"]:
                    merged["language"] = chunk_result.get("language")
            result = merged

    detected_language = result.get("language") or "desconocido"
    duration_seconds = int(duration)
    text_plain, text_srt, text_md = generate_outputs(result, duration_seconds)

    return {
        "text_plain": text_plain,
        "text_srt": text_srt,
        "text_md": text_md,
        "detected_language": detected_language,
        "duration_seconds": duration_seconds,
    }
