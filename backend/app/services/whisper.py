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

try:
    from opencc import OpenCC
    _cc = OpenCC('t2s')  # Traditional to Simplified
    OPENCC_AVAILABLE = True
except ImportError:
    _cc = None
    OPENCC_AVAILABLE = False
    logger.warning("opencc-python-reimplemented not installed. Traditional Chinese will not be converted.")

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


def _to_simplified(text: str) -> str:
    """Convert traditional Chinese to simplified."""
    if not OPENCC_AVAILABLE or not text:
        return text
    try:
        return _cc.convert(text)
    except Exception as e:
        logger.warning("OpenCC conversion failed: %s", e)
        return text


def whisper_transcribe(audio_path: str, model_size: str = "large-v3-turbo", language: str | None = None) -> dict:
    """Transcribe audio using a local Whisper model.

    Args:
        audio_path: Path to the audio file (MP3, WAV, etc.)
        model_size: Whisper model size — tiny/base/small/medium/large.
                    'small' is ~500 MB and recommended for most use cases.

    Returns:
        dict with keys:
            text      (str)  — full transcript (simplified Chinese)
            segments  (list) — per-segment dicts with start/end/text (simplified)
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
        result = model.transcribe(audio_path, language=language)

        # Convert traditional to simplified
        full_text = _to_simplified(result.get("text", "").strip())
        segments = result.get("segments", [])
        for seg in segments:
            if "text" in seg:
                seg["text"] = _to_simplified(seg["text"])

        return {
            "text": full_text,
            "segments": segments,
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
