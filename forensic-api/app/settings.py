from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    forensic_demo_mode: bool = Field(default=True, alias="FORENSIC_DEMO_MODE")
    yolo_model_path: str = Field(default="yolo26n.pt", alias="YOLO_MODEL_PATH")
    yolo_confidence: float = Field(default=0.25, alias="YOLO_CONFIDENCE")
    ocr_engine: str = Field(default="disabled", alias="OCR_ENGINE")
    ocr_lang_list: str = Field(default="ko,en", alias="OCR_LANG_LIST")
    ocr_frame_limit: int = Field(default=4, alias="OCR_FRAME_LIMIT")
    analyze_frame_limit: int = Field(default=18, alias="ANALYZE_FRAME_LIMIT")
    stream_open_timeout_ms: int = Field(default=5000, alias="STREAM_OPEN_TIMEOUT_MS")
    stream_read_timeout_ms: int = Field(default=4000, alias="STREAM_READ_TIMEOUT_MS")
    stream_total_budget_ms: int = Field(default=12000, alias="STREAM_TOTAL_BUDGET_MS")
    track_camera_limit: int = Field(default=24, alias="TRACK_CAMERA_LIMIT")
    track_hit_limit: int = Field(default=12, alias="TRACK_HIT_LIMIT")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
