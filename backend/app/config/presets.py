"""Provider preset templates — no sensitive data."""

PROVIDER_PRESETS: dict[str, dict] = {
    "openai": {
        "name": "OpenAI",
        "endpoint": "https://api.openai.com/v1",
        "vision_model": "gpt-4o",
        "text_model": "gpt-4o",
        "supports_vision": True,
        "icon": "🤖",
        "api_key_url": "https://platform.openai.com/api-keys",
    },
    "claude": {
        "name": "Claude",
        "endpoint": "https://api.anthropic.com",
        "vision_model": "claude-3-5-sonnet-20241022",
        "text_model": "claude-3-5-sonnet-20241022",
        "supports_vision": True,
        "icon": "🧠",
        "api_key_url": "https://console.anthropic.com/settings/keys",
    },
    "doubao": {
        "name": "豆包 2.0",
        "endpoint": "https://ark.cn-beijing.volces.com/api/v3",
        "vision_model": "doubao-vision-pro-32k",
        "text_model": "doubao-pro-32k",
        "supports_vision": True,
        "icon": "🔥",
        "api_key_url": "https://console.volcengine.com/ark",
    },
    "minimax": {
        "name": "MiniMax",
        "endpoint": "https://api.minimax.chat/v1",
        "vision_model": "",
        "text_model": "MiniMax-Text-01",
        "supports_vision": False,
        "icon": "📊",
        "api_key_url": "https://platform.minimaxi.com/",
    },
    "zhipu": {
        "name": "智谱 GLM",
        "endpoint": "https://open.bigmodel.cn/api/paas/v4",
        "vision_model": "glm-4v-plus",
        "text_model": "glm-4-plus",
        "supports_vision": True,
        "icon": "💎",
        "api_key_url": "https://open.bigmodel.cn/dev/api",
    },
    "deepseek": {
        "name": "DeepSeek",
        "endpoint": "https://api.deepseek.com/v1",
        "vision_model": "",
        "text_model": "deepseek-chat",
        "supports_vision": False,
        "icon": "🔮",
        "api_key_url": "https://platform.deepseek.com/api_keys",
    },
}

PROVIDER_ORDER = ["openai", "claude", "doubao", "minimax", "zhipu", "deepseek"]


def get_provider_presets() -> list[dict]:
    return [{"id": pid, **PROVIDER_PRESETS[pid]} for pid in PROVIDER_ORDER]
