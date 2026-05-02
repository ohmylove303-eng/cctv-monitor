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
    top_candidate_reason: str | None = None


class VehicleSignature(BaseModel):
    detector: Literal["yolo"] = "yolo"
    taxonomy: Literal["coco_vehicle"] = "coco_vehicle"
    detected_labels: list[str] = Field(default_factory=list)
    generic_vehicle_type: str | None = None
    make: str | None = None
    model: str | None = None
    subtype: str | None = None
    verification_status: Literal["detector_only", "target_hint_only", "needs_reference_data"] = "needs_reference_data"
    reference_catalog_status: Literal["missing", "empty", "loaded"] = "missing"
    vmmr_readiness_status: Literal["missing", "empty", "no_active_model", "active_report_ready"] = "missing"
    vmmr_active_model_count: int = 0
    fine_grained_model_ready: bool = False
    reid_readiness_status: Literal["missing", "empty", "no_active_model", "active_report_ready"] = "missing"
    reid_active_model_count: int = 0
    same_vehicle_reid_ready: bool = False
    reid_runtime_status: Literal[
        "disabled",
        "readiness_not_active",
        "model_not_configured",
        "model_file_missing",
        "model_dimension_mismatch",
        "runtime_ready",
    ] = "disabled"
    reid_match_status: Literal["disabled", "no_crop", "no_embedding", "unmatched", "matched"] = "disabled"
    reid_match_score: float | None = None
    reid_match_threshold: float | None = None
    reid_match_gallery_entries: int | None = None
    reid_match_reference_id: str | None = None
    reid_match_reference_cctv_id: str | None = None
    reid_match_reference_timestamp: str | None = None
    reid_embedding_backend: str | None = None
    reid_embedding_dimension: int | None = None
    reid_stored_entry_id: str | None = None
    evidence: list[str] = Field(default_factory=list)


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
    vehicle_signature: VehicleSignature | None = None


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
    identificationScore: int | float | None = None
    identificationGrade: Literal["high", "medium", "low"] | None = None
    identificationReason: str | None = None
    laneDirectionStatus: Literal["unknown", "calibrated"] | None = None
    laneDirectionLabel: Literal["forward", "reverse"] | None = None
    laneDirectionSource: Literal["vision_line_zone", "not_calibrated"] | None = None
    delayRiskScore: float | None = None
    routeDeviationRisk: Literal["unknown", "low", "medium", "high"] | None = None
    trafficCongestionStatus: Literal["unavailable", "inferred", "verified"] | None = None
    trafficCongestionLevel: Literal["low", "medium", "high"] | None = None
    trafficCongestionSource: Literal["none", "eta_spacing", "external_traffic_api"] | None = None


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
    identification_score: int | float | None = None
    identification_grade: Literal["high", "medium", "low"] | None = None
    identification_reason: str | None = None
    lane_direction_status: Literal["unknown", "calibrated"] | None = None
    lane_direction_label: Literal["forward", "reverse"] | None = None
    lane_direction_source: Literal["vision_line_zone", "not_calibrated"] | None = None
    delay_risk_score: float | None = None
    route_deviation_risk: Literal["unknown", "low", "medium", "high"] | None = None
    traffic_congestion_status: Literal["unavailable", "inferred", "verified"] | None = None
    traffic_congestion_level: Literal["low", "medium", "high"] | None = None
    traffic_congestion_source: Literal["none", "eta_spacing", "external_traffic_api"] | None = None
    vehicle_signature: VehicleSignature | None = None


class TrackResponse(BaseModel):
    tracking_id: str
    status: Literal["queued", "processing", "completed", "error"]
    searched_cameras: int
    origin_timestamp: datetime | None = None
    hits: list[TrackHit] = Field(default_factory=list)
    message: str | None = None
