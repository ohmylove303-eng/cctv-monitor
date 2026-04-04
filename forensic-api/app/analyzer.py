from __future__ import annotations

import hashlib
import random
import re
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from uuid import uuid4

import numpy as np

from .models import AnalyzeRequest, AnalyzeResponse, QualityReport, TrackCamera, TrackHit, TrackRequest, TrackResponse
from .settings import Settings, get_settings

KST = timezone(timedelta(hours=9))
VEHICLE_CLASS_IDS = {2: "sedan", 3: "motorcycle", 5: "bus", 7: "truck"}
PLATE_REGEXES = [
    re.compile(r"\d{2,3}[가-힣]\d{4}"),
    re.compile(r"[가-힣]{1,2}\d{2,3}[가-힣]\d{4}"),
]


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_chain_hash(*parts: str) -> tuple[str, str, str]:
    input_hash = sha256_text(parts[0])
    result_hash = sha256_text("|".join(parts[1:]))
    chain_hash = sha256_text(f"{input_hash}:{result_hash}")
    prev_hash = sha256_text(chain_hash[:32])
    return input_hash, result_hash, chain_hash, prev_hash


def now_kst() -> datetime:
    return datetime.now(KST)


@lru_cache(maxsize=1)
def get_yolo_model() -> Any | None:
    settings = get_settings()
    if settings.forensic_demo_mode:
        return None

    try:
        from ultralytics import YOLO
    except Exception:
        return None

    try:
        return YOLO(settings.yolo_model_path)
    except Exception:
        return None


@lru_cache(maxsize=1)
def get_easyocr_reader() -> Any | None:
    settings = get_settings()
    if settings.forensic_demo_mode:
        return None

    if settings.ocr_engine.strip().lower() != "easyocr":
        return None

    try:
        import easyocr
    except Exception:
        return None

    try:
        languages = [
            token.strip()
            for token in settings.ocr_lang_list.split(",")
            if token.strip()
        ] or ["ko", "en"]
        return easyocr.Reader(languages, gpu=False, verbose=False)
    except Exception:
        return None


def sample_frames(stream_url: str, frame_limit: int) -> list[np.ndarray]:
    try:
        import cv2
    except Exception:
        return []

    capture = cv2.VideoCapture(stream_url)
    if not capture.isOpened():
        return []

    frames: list[np.ndarray] = []
    try:
        while len(frames) < frame_limit:
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            frames.append(frame)
    finally:
        capture.release()

    return frames


def run_yolo_vehicle_count(frames: list[np.ndarray], settings: Settings) -> tuple[int, list[str]]:
    model = get_yolo_model()
    if model is None or not frames:
        return 0, []

    detections = 0
    labels: list[str] = []
    for frame in frames:
        results = model.predict(frame, verbose=False, conf=settings.yolo_confidence)
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None or getattr(boxes, "cls", None) is None:
                continue
            class_ids = boxes.cls.tolist()
            for class_id in class_ids:
                class_int = int(class_id)
                if class_int in VEHICLE_CLASS_IDS:
                    detections += 1
                    labels.append(VEHICLE_CLASS_IDS[class_int])

    return detections, labels


def normalize_ocr_text(text: str) -> str:
    return re.sub(r"[\s\-_:./]", "", text.strip())


def extract_plate_candidates(texts: list[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    for text in texts:
        normalized = normalize_ocr_text(text)
        if not normalized:
            continue
        for pattern in PLATE_REGEXES:
            for match in pattern.findall(normalized):
                if match not in seen:
                    seen.add(match)
                    found.append(match)

    return found[:5]


def run_plate_ocr(
    frames: list[np.ndarray],
    request: AnalyzeRequest,
    settings: Settings,
) -> tuple[list[str], str, str | None]:
    # OCR/ALPR hook. Keep the contract stable so we can add EasyOCR/PaddleOCR
    # later without changing the API shape again.
    if settings.forensic_demo_mode:
        return [], "target_hint_only", None

    engine = settings.ocr_engine.strip().lower()
    if engine in {"", "disabled", "none", "off"}:
        return [], "not_available", None

    if engine != "easyocr":
        return [], "not_available", settings.ocr_engine

    reader = get_easyocr_reader()
    if reader is None:
        return [], "not_available", settings.ocr_engine

    ocr_texts: list[str] = []
    for frame in frames[: settings.ocr_frame_limit]:
        try:
            lines = reader.readtext(frame, detail=0, paragraph=False)
        except Exception:
            continue
        for line in lines:
            if isinstance(line, str):
                ocr_texts.append(line)

    candidates = extract_plate_candidates(ocr_texts)
    return candidates, "ocr_active", "easyocr"


def analyze_stream(request: AnalyzeRequest) -> AnalyzeResponse:
    settings = get_settings()
    timestamp = now_kst()

    if settings.forensic_demo_mode:
        seed = sha256_text(f"{request.cctv_id}|{request.hls_url}|{request.target_plate or ''}")
        rng = random.Random(seed)
        total_input = settings.analyze_frame_limit
        passed = max(4, int(total_input * rng.uniform(0.55, 0.9)))
        dropped = total_input - passed
        vehicle_count = rng.randint(1, 5)
        confidence = round(rng.uniform(78.0, 95.0), 1)
        input_hash, result_hash, chain_hash, prev_hash = build_chain_hash(
            request.cctv_id,
            str(request.hls_url),
            request.target_plate or "",
            request.target_color or "",
            request.target_vehicle_type or "",
            str(vehicle_count),
        )

        return AnalyzeResponse(
            job_id=f"analysis-{uuid4().hex[:12]}",
            cctv_id=request.cctv_id,
            timestamp=timestamp,
            algorithm="demo-yolo-vehicle-detect / target-hint / mfsr-chain",
            input_hash=input_hash,
            result_hash=result_hash,
            chain_hash=chain_hash,
            prev_hash=prev_hash,
            tsa_status="demo_fallback",
            quality_report=QualityReport(
                total_input=total_input,
                passed=passed,
                dropped=dropped,
                threshold=42.5,
            ),
            events_detected=["vehicle_detected", "traffic_flow_sampled"],
            confidence=confidence,
            verdict="데모 차량 분석 완료",
            vehicle_count=vehicle_count,
            ocr_status="target_hint_only",
            ocr_engine=None,
            target_plate=request.target_plate,
            target_color=request.target_color,
            target_vehicle_type=request.target_vehicle_type,
            plate_candidates=[],
        )

    frames = sample_frames(str(request.hls_url), settings.analyze_frame_limit)
    vehicle_count, labels = run_yolo_vehicle_count(frames, settings)
    plate_candidates, ocr_status, ocr_engine = run_plate_ocr(frames, request, settings)

    total_input = settings.analyze_frame_limit
    passed = len(frames)
    dropped = max(0, total_input - passed)
    distinct_labels = sorted(set(labels))
    confidence = round(min(97.0, 55.0 + vehicle_count * 6.0), 1) if vehicle_count else 41.0
    input_hash, result_hash, chain_hash, prev_hash = build_chain_hash(
        request.cctv_id,
        str(request.hls_url),
        ",".join(distinct_labels),
        str(vehicle_count),
    )

    return AnalyzeResponse(
        job_id=f"analysis-{uuid4().hex[:12]}",
        cctv_id=request.cctv_id,
        timestamp=timestamp,
        algorithm="ultralytics-yolo / frame-sampling / no-live-ocr",
        input_hash=input_hash,
        result_hash=result_hash,
        chain_hash=chain_hash,
        prev_hash=prev_hash,
        tsa_status="yolo_active",
        quality_report=QualityReport(
            total_input=total_input,
            passed=passed,
            dropped=dropped,
            threshold=settings.yolo_confidence,
        ),
        events_detected=["vehicle_detected"] if vehicle_count else ["no_vehicle_detected"],
        confidence=confidence,
        verdict="차량 검출 완료" if vehicle_count else "차량 검출 실패",
        vehicle_count=vehicle_count,
        ocr_status=ocr_status,
        ocr_engine=ocr_engine,
        target_plate=request.target_plate,
        target_color=request.target_color,
        target_vehicle_type=request.target_vehicle_type or (distinct_labels[0] if distinct_labels else None),
        plate_candidates=plate_candidates,
    )


def build_demo_track_hits(request: TrackRequest, tracking_id: str, cameras: list[TrackCamera], settings: Settings) -> list[TrackHit]:
    if not cameras:
        return []

    seed = sha256_text(
        f"{tracking_id}|{request.plate or ''}|{request.color or ''}|{request.vehicle_type or ''}|{len(cameras)}"
    )
    rng = random.Random(seed)
    shuffled = cameras[:]
    rng.shuffle(shuffled)
    count = min(len(shuffled), max(1, min(settings.track_hit_limit, rng.randint(2, 5))))
    base_time = now_kst()

    hits: list[TrackHit] = []
    for index, camera in enumerate(shuffled[:count]):
        hits.append(
            TrackHit(
                id=f"hit-{uuid4().hex[:10]}",
                cctv_id=camera.id,
                cctv_name=camera.name,
                region=camera.region,
                address=camera.address,
                timestamp=base_time + timedelta(minutes=index * 2),
                confidence=round(rng.uniform(74.0, 96.0), 1),
                plate=request.plate,
                plate_candidates=[],
                color=request.color,
                vehicle_type=request.vehicle_type,
            )
        )
    return sorted(hits, key=lambda hit: hit.timestamp)


def build_track_result(request: TrackRequest, tracking_id: str) -> TrackResponse:
    settings = get_settings()
    cameras = request.cctv_list[: settings.track_camera_limit]

    if settings.forensic_demo_mode:
        hits = build_demo_track_hits(request, tracking_id, cameras, settings)
        return TrackResponse(
            tracking_id=tracking_id,
            status="completed",
            searched_cameras=len(cameras),
            hits=hits,
            message=f"{len(hits)}건의 데모 이동 후보를 생성했습니다.",
        )

    hits: list[TrackHit] = []
    for camera in cameras:
        analysis = analyze_stream(
            AnalyzeRequest(
                cctv_id=camera.id,
                hls_url=camera.streamUrl,
                target_plate=request.plate,
                target_color=request.color,
                target_vehicle_type=request.vehicle_type,
            )
        )
        if analysis.vehicle_count <= 0:
            continue
        hits.append(
            TrackHit(
                id=f"hit-{uuid4().hex[:10]}",
                cctv_id=camera.id,
                cctv_name=camera.name,
                region=camera.region,
                address=camera.address,
                timestamp=analysis.timestamp,
                confidence=analysis.confidence,
                plate=analysis.plate_candidates[0] if analysis.plate_candidates else request.plate,
                plate_candidates=analysis.plate_candidates,
                color=request.color,
                vehicle_type=request.vehicle_type or analysis.target_vehicle_type,
            )
        )
        if len(hits) >= settings.track_hit_limit:
            break

    return TrackResponse(
        tracking_id=tracking_id,
        status="completed",
        searched_cameras=len(cameras),
        hits=hits,
        message=f"{len(hits)}건의 차량 이동 후보를 찾았습니다." if hits else "일치하는 차량 이동 후보가 없습니다.",
    )
