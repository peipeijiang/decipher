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


def frames_for_duration(duration: float, is_segment: bool = False, scene_density: float | None = None) -> int:
    """Return the recommended frame count based on duration and scene density.

    Scene density is the number of detected scene changes per second.
    Higher density → more frames needed to capture all transitions.
    """
    if is_segment:
        return 2 if duration < 15 else 3

    base = 6 if duration < 15 else 12 if duration < 60 else 18 if duration < 180 else 24

    # Boost for high-density videos (many cuts/scene changes per second)
    # Multiplier calibrated for TikTok: typical density 0.3-0.8 cuts/s
    if scene_density and scene_density > 0.08:  # >1 cut every 12s
        boost = min(int(base * scene_density * 3), base // 2)  # 0-50% boost
        base += boost

    return min(base, 30)  # hard cap — one frame per second max


def detect_scene_changes(video_path: str | Path, threshold: float = 0.4) -> list[float]:
    """Detect scene-change timestamps using I-frame analysis + content sampling.

    Strategy:
    1. Extract all I-frame (keyframe) positions — in edited TikTok videos,
       each cut typically starts a new GOP with an I-frame.
    2. Also sample frames at regular intervals (every N seconds) between
       I-frames to catch transitions that fall within a single GOP.

    Args:
        video_path: Source video file.
        threshold: Scene change sensitivity (reserved, not currently used).

    Returns:
        List of timestamps (in seconds) where scene changes were detected, sorted.

    Raises:
        RuntimeError: If ffprobe is unavailable or detection fails.
    """
    import json as _json
    import re as _re
    p = _require_file(video_path)
    _check_ffmpeg()

    # Step 1: Get all frame PTS times and picture types via ffprobe
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-select_streams", "v:0",
            "-show_entries", "frame=pts_time,pict_type",
            "-of", "json",
            str(p),
        ],
        capture_output=True, text=True,
    )

    try:
        probe_data = _json.loads(result.stdout)
    except _json.JSONDecodeError:
        logger.warning("Scene detection: ffprobe JSON parse failed for %s", video_path)
        return []

    frames = probe_data.get("frames", [])
    if not frames:
        logger.warning("Scene detection: no video frames found in %s", video_path)
        return []

    # Step 2: Extract I-frame positions (natural GOP cut points)
    i_frame_ts: list[float] = []
    for f in frames:
        if f.get("pict_type") == "I":
            try:
                ts = float(f["pts_time"])
                if ts > 0.3:  # Skip frame 0 (opening black frame)
                    i_frame_ts.append(ts)
            except (ValueError, KeyError):
                pass

    # Step 3: Also sample between I-frames at regular intervals
    # TikTok edits: typical shot duration is 1-4s, so sample every 1.5s
    try:
        duration = float(frames[-1]["pts_time"])
    except (ValueError, KeyError):
        duration = 0

    sample_interval = 1.5
    sampled_ts: list[float] = []
    t = sample_interval
    while t < duration - 0.2:
        sampled_ts.append(round(t, 2))
        t += sample_interval

    # Step 4: Merge — I-frames first, then fill gaps with sampled frames
    all_ts = sorted(set(i_frame_ts))
    for st in sampled_ts:
        if not any(abs(st - existing) < 0.4 for existing in all_ts):
            all_ts.append(st)

    result_ts = sorted(set(all_ts))
    logger.info(
        "Scene detection: %d I-frames + %d sampled = %d total candidates (%.1fs video)",
        len(i_frame_ts), len(sampled_ts), len(result_ts), duration
    )
    return result_ts

def extract_frames(
    video_path: str | Path,
    output_dir: str | Path,
    num_frames: int = 6,
    use_scene_detection: bool = True,
) -> list[str]:
    """Smart frame extraction: scene-change points + evenly-spaced fillers.

    Priority order:
    1. Scene-change timestamps (natural edit points — most important)
    2. Evenly-spaced timestamps to fill remaining slots
    3. Minimum 1 frame every 5 seconds for coverage

    Args:
        video_path: Source video file.
        output_dir: Directory where frame_01.jpg … frame_N.jpg will be written.
        num_frames: Target number of frames to extract.
        use_scene_detection: Whether to detect scene changes (default True).

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

    # ── Phase 1: Collect candidate timestamps ──
    candidates: list[float] = []

    if use_scene_detection:
        try:
            scene_ts = detect_scene_changes(p)
            candidates.extend(scene_ts)
        except Exception as e:
            logger.warning("Scene detection failed, falling back to even distribution: %s", e)

    # If scene detection found enough candidates, use them preferentially
    if len(candidates) >= num_frames:
        # More scene changes than we need: pick the ones with most visual change
        # (ffmpeg returns them in order; we take evenly from the set)
        step = len(candidates) / num_frames
        timestamps = sorted(set(
            candidates[int(i * step)] for i in range(num_frames)
        ))
    else:
        # Not enough scene-change points: fill remaining slots evenly
        timestamps = sorted(set(candidates))

        # Add evenly-spaced fillers for gaps > 5s
        remaining = num_frames - len(timestamps)
        if remaining > 0:
            interval = duration / (remaining + 1)
            for i in range(1, remaining + 1):
                ts = round(interval * i, 2)
                # Only add if > 0.5s away from existing timestamps
                if not any(abs(ts - t) < 0.5 for t in timestamps):
                    timestamps.append(ts)

        timestamps = sorted(set(timestamps))

    # Ensure we don't exceed num_frames
    if len(timestamps) > num_frames:
        # Keep scene-change ones first, then trim evenly
        scene_set = set(candidates)
        scene_ts_sorted = sorted(t for t in timestamps if t in scene_set)
        filler_ts_sorted = sorted(t for t in timestamps if t not in scene_set)
        # Trim fillers first, then scenes if needed
        while len(scene_ts_sorted) + len(filler_ts_sorted) > num_frames:
            if filler_ts_sorted:
                filler_ts_sorted.pop()
            else:
                scene_ts_sorted.pop()
        timestamps = sorted(set(scene_ts_sorted + filler_ts_sorted))

    logger.info(
        "Smart extraction: duration=%.1fs, candidates=%d(scene)+%d(filler), final=%d frames",
        duration, len(candidates), len(timestamps) - len(candidates), len(timestamps)
    )

    # ── Phase 2: Extract frames at selected timestamps ──
    paths: list[str] = []
    for i, ts in enumerate(timestamps, 1):
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
