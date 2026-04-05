"""FFmpeg-based video processing utilities."""
import logging
import os
import subprocess
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)


def _ffmpeg(*args: str) -> subprocess.CompletedProcess:
    cmd = ["ffmpeg", "-y", *args]
    return subprocess.run(cmd, capture_output=True, text=True)


def get_duration(filepath: str) -> float | None:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", filepath],
            capture_output=True, text=True,
        )
        import json
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception as e:
        logger.warning("Could not get duration for %s: %s", filepath, e)
        return None


def extract_frames(filepath: str, video_id: str, num_frames: int = 6) -> list[str]:
    """Extract evenly-distributed frames; returns list of output paths."""
    duration = get_duration(filepath)
    if not duration:
        return []

    out_dir = Path(settings.processed_dir) / video_id / "frames"
    out_dir.mkdir(parents=True, exist_ok=True)

    interval = duration / (num_frames + 1)
    paths = []
    for i in range(1, num_frames + 1):
        ts = interval * i
        out_path = str(out_dir / f"frame_{i:02d}.jpg")
        result = _ffmpeg(
            "-ss", str(ts),
            "-i", filepath,
            "-vframes", "1",
            "-q:v", "2",
            out_path,
        )
        if result.returncode == 0:
            paths.append(out_path)
        else:
            logger.warning("Frame extraction failed at ts=%.2f: %s", ts, result.stderr)

    return paths


def extract_audio(filepath: str, video_id: str) -> str | None:
    """Extract audio as MP3; returns output path or None if no audio."""
    out_dir = Path(settings.processed_dir) / video_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = str(out_dir / "audio.mp3")

    result = _ffmpeg("-i", filepath, "-vn", "-acodec", "libmp3lame", "-q:a", "4", out_path)
    if result.returncode != 0:
        logger.info("No audio track in %s (or ffmpeg error): %s", filepath, result.stderr[:200])
        return None
    return out_path
