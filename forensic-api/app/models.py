from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class QualityReport(BaseModel):
    total_input: int
    passed: int
    dropped: int
    threshold: float


class AnalyzeRequest(BaseModel):
    cctv_id: str = Field(..., min_length=1)
    hls_url: HttpUrl
    target_plate: str | None = None
    target_color: str | None = None
    target_vehicle_type: str | None = None


class AnalyzeResponse(BaseModel):
    job_id: str
    cctv_id: str
    timestamp: datetime
    algorithm: str
    input_hash: str
    result_hash: str
    chain_hash: str
    prev_hash: str
    tsa_status: Literal["verified", "local_fallback"]
    generative_ai_used: bool = False
    quality_report: QualityReport
    events_detected: list[str]
    confidence: float
    verdict: str
    vehicle_count: int = 0
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
    color: str | None = None
    vehicle_type: str | None = None


class TrackResponse(BaseModel):
    tracking_id: str
    status: Literal["queued", "processing", "completed", "error"]
    searched_cameras: int
    hits: list[TrackHit] = Field(default_factory=list)
    message: str | None = None
