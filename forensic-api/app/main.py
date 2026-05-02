from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException

from .analyzer import analyze_stream, build_track_result, get_ocr_runtime_state
from .execution_harness import get_execution_harness_status
from .models import AnalyzeRequest, AnalyzeResponse, TrackRequest, TrackResponse
from .settings import get_settings
from .store import get_tracking_result, get_tracking_store_status, save_tracking_result
from .vehicle_reference import get_vehicle_reference_status
from .vehicle_reid_runtime import get_vehicle_reid_runtime_status
from .vehicle_reid_runtime_backtest import get_vehicle_reid_runtime_backtest_status
from .vehicle_reid_readiness import get_vehicle_reid_readiness_status
from .vehicle_vmmr_readiness import get_vehicle_vmmr_readiness_status

app = FastAPI(title="ITS Forensic API", version="0.1.0")


@app.get("/")
def root():
    settings = get_settings()
    return {
        "service": "its-forensic-api",
        "status": "ok",
        "mode": "demo" if settings.forensic_demo_mode else "yolo",
        "vehicle_reference": get_vehicle_reference_status(),
        "vehicle_vmmr_readiness": get_vehicle_vmmr_readiness_status(),
        "vehicle_reid_readiness": get_vehicle_reid_readiness_status(),
        "vehicle_reid_runtime": get_vehicle_reid_runtime_status(),
        "vehicle_reid_runtime_backtest": get_vehicle_reid_runtime_backtest_status(),
        "tracking_store": get_tracking_store_status(),
        "execution_harness": get_execution_harness_status(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/healthz")
def healthz():
    settings = get_settings()
    return {
        "status": "ok",
        "mode": "demo" if settings.forensic_demo_mode else "yolo",
        "ocr": get_ocr_runtime_state(),
        "vehicle_reference": get_vehicle_reference_status(),
        "vehicle_vmmr_readiness": get_vehicle_vmmr_readiness_status(),
        "vehicle_reid_readiness": get_vehicle_reid_readiness_status(),
        "vehicle_reid_runtime": get_vehicle_reid_runtime_status(),
        "vehicle_reid_runtime_backtest": get_vehicle_reid_runtime_backtest_status(),
        "tracking_store": get_tracking_store_status(),
        "execution_harness": get_execution_harness_status(),
    }


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest):
    return analyze_stream(request)


def run_tracking_job(tracking_id: str, request: TrackRequest):
    try:
        result = build_track_result(request, tracking_id)
        save_tracking_result(result)
    except Exception as error:
        save_tracking_result(
            TrackResponse(
                tracking_id=tracking_id,
                status="error",
                searched_cameras=len(request.cctv_list),
                hits=[],
                message=str(error),
            )
        )


@app.post("/api/track", response_model=TrackResponse)
def track(request: TrackRequest, background_tasks: BackgroundTasks):
    tracking_id = f"track-{uuid4().hex[:12]}"
    queued = TrackResponse(
        tracking_id=tracking_id,
        status="queued",
        searched_cameras=len(request.cctv_list),
        hits=[],
        message="차량 추적 작업이 시작되었습니다.",
    )
    save_tracking_result(queued)
    background_tasks.add_task(run_tracking_job, tracking_id, request)
    return queued


@app.get("/api/track/{tracking_id}", response_model=TrackResponse)
def read_tracking_result(tracking_id: str):
    result = get_tracking_result(tracking_id)
    if result is None:
        raise HTTPException(status_code=404, detail="tracking result not found")
    return result
