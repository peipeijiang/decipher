"""Whisper-based speech recognition (local small model)."""
import logging

logger = logging.getLogger(__name__)

_model = None


def _load_model():
    global _model
    if _model is None:
        import whisper
        logger.info("Loading Whisper small model…")
        _model = whisper.load_model("small")
    return _model


def transcribe(audio_path: str) -> str:
    try:
        model = _load_model()
        result = model.transcribe(audio_path, language="zh")
        return result.get("text", "").strip()
    except Exception as e:
        logger.warning("Whisper transcription failed: %s", e)
        return ""
