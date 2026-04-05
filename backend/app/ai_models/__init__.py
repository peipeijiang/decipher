"""AI model registry and factory."""
import importlib

from app.ai_models.base import AIModel

AVAILABLE_MODELS = ["openai", "claude", "doubao", "minimax", "zhipu", "deepseek"]

_REGISTRY = {
    "openai":   ("openai_model",   "OpenAIModel"),
    "claude":   ("claude_model",   "ClaudeModel"),
    "doubao":   ("doubao_model",   "DoubaoModel"),
    "minimax":  ("minimax_model",  "MinimaxModel"),
    "zhipu":    ("zhipu_model",    "ZhipuModel"),
    "deepseek": ("deepseek_model", "DeepSeekModel"),
}


def get_model(name: str) -> AIModel:
    """Instantiate and return the named AI model."""
    entry = _REGISTRY.get(name)
    if not entry:
        raise ValueError(f"Unknown model '{name}'. Available: {AVAILABLE_MODELS}")
    module_name, class_name = entry
    mod = importlib.import_module(f"app.ai_models.{module_name}")
    return getattr(mod, class_name)()
