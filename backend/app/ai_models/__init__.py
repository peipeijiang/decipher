"""AI model registry and factory."""
import importlib
import types

from app.ai_models.base import AIModel

AVAILABLE_MODELS = ["openai", "claude", "doubao", "minimax", "zhipu", "deepseek", "aliyun"]

_REGISTRY = {
    "openai":   ("openai_model",   "OpenAIModel"),
    "claude":   ("claude_model",   "ClaudeModel"),
    "doubao":   ("doubao_model",   "DoubaoModel"),
    "minimax":  ("minimax_model",  "MinimaxModel"),
    "zhipu":    ("zhipu_model",    "ZhipuModel"),
    "deepseek": ("deepseek_model", "DeepSeekModel"),
    "aliyun":   ("aliyun_model",   "AliyunModel"),
}

# Maps generic JSON keys → flat attribute names each model class expects
_ATTR_MAP: dict[str, dict[str, str]] = {
    "openai": {
        "api_key":      "openai_api_key",
        "endpoint":     "openai_endpoint",
        "vision_model": "openai_vision_model",
        "text_model":   "openai_text_model",
    },
    "claude": {
        "api_key":      "anthropic_api_key",
        "endpoint":     "anthropic_endpoint",
        "vision_model": "claude_vision_model",
        "text_model":   "claude_text_model",
    },
    "doubao": {
        "api_key":      "doubao_api_key",
        "endpoint":     "doubao_endpoint",
        "vision_model": "doubao_vision_model",
        "text_model":   "doubao_text_model",
    },
    "minimax": {
        "api_key":      "minimax_api_key",
        "endpoint":     "minimax_endpoint",
        "vision_model": "minimax_vision_model",
        "text_model":   "minimax_text_model",
    },
    "zhipu": {
        "api_key":      "zhipu_api_key",
        "endpoint":     "zhipu_endpoint",
        "vision_model": "zhipu_vision_model",
        "text_model":   "zhipu_text_model",
    },
    "deepseek": {
        "api_key":      "deepseek_api_key",
        "endpoint":     "deepseek_endpoint",
        "text_model":   "deepseek_text_model",
    },
    "aliyun": {
        "api_key":      "aliyun_api_key",
        "endpoint":     "aliyun_endpoint",
        "vision_model": "aliyun_vision_model",
        "text_model":   "aliyun_text_model",
    },
}


def _make_provider_cfg(cfg, provider: str) -> types.SimpleNamespace:
    """Bridge config_json blob → flat-attribute namespace each model class expects."""
    providers: dict = cfg.get_providers() if hasattr(cfg, "get_providers") else {}
    p = providers.get(provider, {})
    ns = types.SimpleNamespace()
    for json_key, attr_name in _ATTR_MAP.get(provider, {}).items():
        setattr(ns, attr_name, p.get(json_key) or None)
    # aliyun: fall back to _aliyun_api_key (shared with video generation)
    if provider == "aliyun" and not getattr(ns, "aliyun_api_key", None):
        setattr(ns, "aliyun_api_key", providers.get("_aliyun_api_key") or None)
    return ns


def get_model(name: str, cfg=None) -> AIModel:
    """Instantiate and return the named AI model.

    Args:
        name: Provider name, e.g. "openai", "claude".
        cfg: ModelConfig ORM object (has get_providers() method).
    """
    entry = _REGISTRY.get(name)
    if not entry:
        raise ValueError(f"Unknown model '{name}'. Available: {AVAILABLE_MODELS}")
    module_name, class_name = entry
    mod = importlib.import_module(f"app.ai_models.{module_name}")
    provider_cfg = _make_provider_cfg(cfg, name) if cfg is not None else None
    return getattr(mod, class_name)(cfg=provider_cfg)
