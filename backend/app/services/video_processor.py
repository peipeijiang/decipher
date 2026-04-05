"""FFmpeg-based video processing utilities."""
import json
import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def _require_file(path: str | Path) -> Path:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Video file not found: {p}")
    return p


def _check_ffmpeg() -> None:
    """Raise RuntimeError if ffmpeg/ffprobe are not on PATH."""
    for tool in ("ffmpeg", "ffprobe"):
        result = subprocess.run(
            [tool, "-version"], capture_output=True
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"{tool} is not available. Install it via: brew install ffmpeg"
            )


def _ffmpeg(*args: str) -> subprocess.CompletedProcess:
    cmd = ["ffmpeg", "-y", *args]
    return subprocess.run(cmd, capture_output=True, text=True)


def _ffprobe_json(filepath: str, *extra_flags: str) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", *extra_flags, filepath],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {filepath}: {result.stderr[:300]}")
    return json.loads(result.stdout)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_video_info(video_path: str | Path) -> dict:
    """Return metadata dict: duration, width, height, fps, codec, size_bytes."""
    p = _require_file(video_path)
    _check_ffmpeg()

    data = _ffprobe_json(
        str(p),
        "-show_format",
        "-show_streams",
        "-select_streams", "v:0",
    )

    fmt = data.get("format", {})
    streams = data.get("streams", [])
    video_stream = streams[0] if streams else {}

    # fps is stored as a fraction string e.g. "30/1" or "30000/1001"
    fps: float | None = None
    r_frame_rate = video_stream.get("r_frame_rate", "")
    if "/" in r_frame_rate:
        num, den = r_frame_rate.split("/")
        fps = round(int(num) / int(den), 3) if int(den) else None

    duration = fmt.get("duration") or video_stream.get("duration")

    return {
        "duration": float(duration) if duration else None,
        "width": video_stream.get("width"),
        "height": video_stream.get("height"),
        "fps": fps,
        "codec": video_stream.get("codec_name"),
        "size_bytes": int(fmt["size"]) if fmt.get("size") else p.stat().st_size,
    }


def get_duration(video_path: str | Path) -> float | None:
    """Return video duration in seconds, or None on failure."""
    try:
        info = get_video_info(video_path)
        return info["duration"]
    except Exception as e:
        logger.warning("Could not get duration for %s: %s", video_path, e)
        return None


def extract_frames(
    video_path: str | Path,
    output_dir: str | Path,
    num_frames: int = 6,
) -> list[str]:
    """Extract *num_frames* evenly-distributed frames as JPEG files.

    Args:
        video_path: Source video file.
        output_dir: Directory where frame_01.jpg … frame_N.jpg will be written.
        num_frames: Number of frames to extract (default 6).

    Returns:
        List of absolute paths to the successfully extracted frame files.

    Raises:
        FileNotFoundError: If *video_path* does not exist.
        RuntimeError: If ffmpeg is unavailable.
    """
    p = _require_file(video_path)
    _check_ffmpeg()

    duration = get_duration(p)
    if not duration:
        raise RuntimeError(f"Cannot determine duration for {p}")

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    interval = duration / (num_frames + 1)
    paths: list[str] = []

    for i in range(1, num_frames + 1):
        ts = interval * i
        out_path = str(out_dir / f"frame_{i:02d}.jpg")
        result = _ffmpeg(
            "-ss", f"{ts:.3f}",
            "-i", str(p),
            "-vframes", "1",
            "-q:v", "2",
            out_path,
        )
        if result.returncode == 0:
            paths.append(out_path)
        else:
            logger.warning("Frame %d extraction failed (ts=%.2fs): %s", i, ts, result.stderr[-200:])

    if not paths:
        raise RuntimeError(f"No frames could be extracted from {p}")

    return paths


def extract_audio(
    video_path: str | Path,
    output_path: str | Path,
) -> str:
    """Extract audio track as MP3.

    Args:
        video_path: Source video file.
        output_path: Destination .mp3 file path.

    Returns:
        Absolute path to the output MP3 file.

    Raises:
        FileNotFoundError: If *video_path* does not exist.
        RuntimeError: If ffmpeg is unavailable or the video has no audio track.
    """
    p = _require_file(video_path)
    _check_ffmpeg()

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    result = _ffmpeg(
        "-i", str(p),
        "-vn",
        "-acodec", "libmp3lame",
        "-q:a", "4",
        str(out),
    )
    if result.returncode != 0:
        # Distinguish "no audio" from hard ffmpeg errors
        stderr_lower = result.stderr.lower()
        if "output file does not contain any stream" in stderr_lower or "no audio" in stderr_lower:
            raise RuntimeError(f"Video has no audio track: {p}")
        raise RuntimeError(f"ffmpeg audio extraction failed for {p}: {result.stderr[-300:]}")

    return str(out)


def extract_segment(
    video_path: str | Path,
    output_path: str | Path,
    start_time: float,
    end_time: float,
) -> str:
    """Cut a time-range segment from a video using stream copy (no re-encode).

    Args:
        video_path: Source video file.
        output_path: Destination file path (format inferred from extension).
        start_time: Segment start in seconds.
        end_time: Segment end in seconds.

    Returns:
        Absolute path to the output segment file.

    Raises:
        FileNotFoundError: If *video_path* does not exist.
        ValueError: If time range is invalid.
        RuntimeError: If ffmpeg is unavailable or the cut fails.
    """
    p = _require_file(video_path)
    _check_ffmpeg()

    if start_time < 0:
        raise ValueError(f"start_time must be >= 0, got {start_time}")
    if end_time <= start_time:
        raise ValueError(f"end_time ({end_time}) must be > start_time ({start_time})")

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    result = _ffmpeg(
        "-ss", f"{start_time:.3f}",
        "-to", f"{end_time:.3f}",
        "-i", str(p),
        "-c", "copy",          # stream copy: fast, lossless
        "-avoid_negative_ts", "make_zero",
        str(out),
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Segment extraction failed ({start_time:.1f}s–{end_time:.1f}s) "
            f"for {p}: {result.stderr[-300:]}"
        )

    return str(out)
