import asyncio
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from analyzer import CCTVAnalyzer
from hls_fetcher import HLSFetcher
from forensic_log import ForensicLogger
import uvicorn

app = FastAPI(title="CCTV MFSR Forensic API (S-Loop Optimized)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://cctv-monitor.vercel.app", "http://localhost:3000", "*"], # Vercel Origin 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = CCTVAnalyzer()
logger = ForensicLogger()

@app.post("/api/analyze")
async def analyze_cctv(data: dict):
    """단일 CCTV 스트림의 실시간 프레임 분석"""
    hls_url = data.get("hls_url")
    target_plate = data.get("target_plate")
    target_color = data.get("target_color")
    cctv_id = data.get("cctv_id")

    # ffmpeg 기반 Timeout 추출 구조 적용 (OpenCV Hang 차단)
    frame = await HLSFetcher.get_latest_frame_ffmpeg(hls_url, timeout=3.0)
    if frame is None:
        return {"status": "error", "message": "스트림 타임아웃 또는 연결 불가"}

    # YOLO + 면적 기반 OCR 필터링 분석
    result = await analyzer.analyze(frame, target_plate, target_color)

    # 포렌식 로깅 및 해시스탬프 발급
    log = logger.save(cctv_id, result, frame)

    return {
        "status": "ok",
        "cctv_id": cctv_id,
        "vehicles": result["vehicles"],
        "matched": result["matched"],
        "forensic_hash": log["hash"],
        "timestamp": log["timestamp"]
    }

@app.post("/api/track")
async def track_vehicle(data: dict, background_tasks: BackgroundTasks):
    """다중 CCTV 동시 순회 추적 (비동기 병렬 처리)"""
    import uuid
    tracking_id = str(uuid.uuid4())[:8]
    background_tasks.add_task(
        analyzer.track_across_cctvs_parallel,
        tracking_id,
        data.get("plate"),
        data.get("color"),
        data.get("cctv_list", [])
    )
    return {"tracking_id": tracking_id, "status": "추적 시작 (병렬 큐)"}

@app.get("/api/track/{tracking_id}")
async def get_tracking_result(tracking_id: str):
    return logger.get_tracking(tracking_id)

@app.get("/health")
async def health():
    return {"status": "ok", "server": "EQ12 S-Loop", "model": analyzer.model_name}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
