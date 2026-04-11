from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class QualityReport(BaseModel):
    total_input: int
    passed: int
    dropped: int
    threshold: float


class OcrDiagnostics(BaseModel):
    frame_batches: int = 0
    observation_count: int = 0
    raw_candidate_count: int = 0
    viable_candidate_count: int = 0
    final_candidate_count: int = 0
    suppressed_region_variants: int = 0
    top_candidate_support: int = 0
    top_candidate_weight: float = 0.0


class AnalyzeRequest(BaseModel):
    cctv_id: str = Field(..., min_length=1)
    hls_url: HttpUrl
    target_plate: str | None = None
    target_color: str | None = None
    target_vehicle_type: str | None = None
    analysis_mode: Literal["scan", "verify"] = "verify"


class AnalyzeResponse(BaseModel):
    job_id: str
    cctv_id: str
    timestamp: datetime
    algorithm: str
    input_hash: str
    result_hash: str
    chain_hash: str
    prev_hash: str
    tsa_status: Literal["verified", "demo_fallback", "yolo_active"]
    generative_ai_used: bool = False
    quality_report: QualityReport
    events_detected: list[str]
    confidence: float
    verdict: str
    vehicle_count: int = 0
    ocr_status: Literal[
        "not_available",
        "target_hint_only",
        "ocr_active",
        "ocr_unavailable",
        "skipped_no_vehicle",
        "skipped_no_frames",
    ] = "not_available"
    ocr_engine: str | None = None
    ocr_diagnostics: OcrDiagnostics | None = None
    target_plate: str | None = None
    target_color: str | None = None
    target_vehicle_type: str | None = None
    plate_candidates: list[str] = Field(default_factory=list)


class TrackCamera(BaseModel):
    id: str
    name: str
    region: Literal["김포", "인천", "서울"]
    address: str
    lat: float
    lng: float
    source: str | None = None
    streamUrl: str
    expectedEtaMinutes: int | float | None = None
    timeWindowLabel: str | None = None
    travelOrder: int | None = None
    isRouteFocus: bool | None = None


class TrackRequest(BaseModel):
    plate: str | None = None
    color: str | None = None
    vehicle_type: str | None = None
    origin_cctv_id: str | None = None
    cctv_list: list[TrackCamera] = Field(default_factory=list)


class TrackHit(BaseModel):
    id: str
    cctv_id: str
    cctv_name: str
    region: Literal["김포", "인천", "서울"]
    address: str
    timestamp: datetime
    confidence: float
    plate: str | None = None
    plate_candidates: list[str] = Field(default_factory=list)
    color: str | None = None
    vehicle_type: str | None = None
    expected_eta_minutes: int | float | None = None
    time_window_label: str | None = None
    travel_assessment: Literal["fast", "on_time", "delayed", "unknown"] | None = None
    travel_assessment_label: str | None = None
    travel_order: int | None = None
    is_route_focus: bool | None = None


class TrackResponse(BaseModel):
    tracking_id: str
    status: Literal["queued", "processing", "completed", "error"]
    searched_cameras: int
    origin_timestamp: datetime | None = None
    hits: list[TrackHit] = Field(default_factory=list)
    message: str | None = None
