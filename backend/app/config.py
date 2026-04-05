from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # AI Model API Keys
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    doubao_api_key: str = ""
    minimax_api_key: str = ""
    zhipu_api_key: str = ""
    deepseek_api_key: str = ""

    # Default model selections
    default_vision_model: str = "openai"
    default_analysis_model: str = "openai"

    # File storage
    upload_dir: str = "uploads"
    processed_dir: str = "processed"
    max_file_size_mb: int = 500

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
