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
    track_store_backend: str = Field(default="auto", alias="TRACK_STORE_BACKEND")
    track_store_path: str = Field(default="", alias="TRACK_STORE_PATH")
    track_store_dsn: str = Field(default="", alias="TRACK_STORE_DSN")
    track_store_table: str = Field(default="tracking_results", alias="TRACK_STORE_TABLE")
    ocr_alpr_backtest_path: str = Field(default="data/ocr-alpr-backtest-readiness.json", alias="OCR_ALPR_BACKTEST_PATH")
    vehicle_reid_runtime_backtest_path: str = Field(default="data/vehicle-reid-runtime-backtest-report.json", alias="VEHICLE_REID_RUNTIME_BACKTEST_PATH")
    vehicle_reference_catalog_path: str = Field(default="data/vehicle-reference-catalog.json", alias="VEHICLE_REFERENCE_CATALOG_PATH")
    vehicle_vmmr_readiness_path: str = Field(default="data/vehicle-vmmr-readiness.json", alias="VEHICLE_VMMR_READINESS_PATH")
    vehicle_reid_readiness_path: str = Field(default="data/vehicle-reid-readiness.json", alias="VEHICLE_REID_READINESS_PATH")
    vehicle_reid_runtime_enabled: bool = Field(default=False, alias="VEHICLE_REID_RUNTIME_ENABLED")
    vehicle_reid_runtime_backend: str = Field(default="baseline", alias="VEHICLE_REID_RUNTIME_BACKEND")
    vehicle_reid_runtime_model_path: str = Field(default="", alias="VEHICLE_REID_RUNTIME_MODEL_PATH")
    vehicle_reid_runtime_embedding_dimension: int = Field(default=0, alias="VEHICLE_REID_RUNTIME_EMBEDDING_DIMENSION")
    vehicle_reid_gallery_path: str = Field(default="data/vehicle-reid-gallery.json", alias="VEHICLE_REID_GALLERY_PATH")
    vehicle_reid_match_threshold: float = Field(default=0.86, alias="VEHICLE_REID_MATCH_THRESHOLD")
    vehicle_reid_gallery_limit: int = Field(default=2000, alias="VEHICLE_REID_GALLERY_LIMIT")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
