"""Whisper-based speech recognition (local model)."""
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

try:
    import whisper as _whisper_lib
    WHISPER_AVAILABLE = True
except ImportError:
    _whisper_lib = None
    WHISPER_AVAILABLE = False
    logger.warning(
        "openai-whisper not installed. Run: pip install openai-whisper\n"
        "Also requires ffmpeg on PATH: brew install ffmpeg (macOS)"
    )

# Cache loaded models to avoid reloading on each call (~500MB for 'small')
_model_cache: dict[str, Any] = {}


def _load_model(model_size: str) -> Any:
    if not WHISPER_AVAILABLE:
        raise RuntimeError(
            "openai-whisper is not installed. "
            "Install it with: pip install openai-whisper"
        )
    if model_size not in _model_cache:
        logger.info("Loading Whisper model '%s' (first call may take a while)…", model_size)
        _model_cache[model_size] = _whisper_lib.load_model(model_size)
        logger.info("Whisper model '%s' loaded.", model_size)
    return _model_cache[model_size]


def whisper_transcribe(audio_path: str, model_size: str = "small") -> dict:
    """Transcribe audio using a local Whisper model.

    Args:
        audio_path: Path to the audio file (MP3, WAV, etc.)
        model_size: Whisper model size — tiny/base/small/medium/large.
                    'small' is ~500 MB and recommended for most use cases.

    Returns:
        dict with keys:
            text      (str)  — full transcript
            segments  (list) — per-segment dicts with start/end/text
            language  (str)  — detected language code
        On failure returns {"text": "", "segments": [], "language": "", "error": "..."}
    """
    error_result = {"text": "", "segments": [], "language": ""}

    if not os.path.exists(audio_path):
        msg = f"Audio file not found: {audio_path}"
        logger.warning(msg)
        return {**error_result, "error": msg}

    if os.path.getsize(audio_path) == 0:
        msg = f"Audio file is empty (no audio track?): {audio_path}"
        logger.warning(msg)
        return {**error_result, "error": msg}

    try:
        model = _load_model(model_size)
        logger.info("Transcribing '%s' with Whisper '%s'…", audio_path, model_size)
        result = model.transcribe(audio_path, language="zh")
        return {
            "text": result.get("text", "").strip(),
            "segments": result.get("segments", []),
            "language": result.get("language", ""),
        }
    except RuntimeError as e:
        # Whisper not installed, or GPU OOM / model load failure
        logger.error("Whisper runtime error: %s", e)
        return {**error_result, "error": str(e)}
    except Exception as e:
        logger.error("Whisper transcription failed for '%s': %s", audio_path, e)
        return {**error_result, "error": str(e)}


# Backward-compatible alias used by older callers that expected a plain string
def transcribe(audio_path: str) -> str:
    return whisper_transcribe(audio_path).get("text", "")
