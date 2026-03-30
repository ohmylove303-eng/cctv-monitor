from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, HTTPException

from .analyzer import analyze_stream, build_track_result
from .models import AnalyzeRequest, AnalyzeResponse, TrackRequest, TrackResponse
from .settings import get_settings
from .store import get_tracking_result, save_tracking_result

app = FastAPI(title="ITS Forensic API", version="0.1.0")


@app.get("/")
def root():
    settings = get_settings()
    return {
        "service": "its-forensic-api",
        "status": "ok",
        "mode": "demo" if settings.forensic_demo_mode else "yolo",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/healthz")
def healthz():
    settings = get_settings()
    return {
        "status": "ok",
        "mode": "demo" if settings.forensic_demo_mode else "yolo",
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
