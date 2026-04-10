from __future__ import annotations

import hashlib
import os
import random
import re
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any
from uuid import uuid4

import numpy as np

from .models import AnalyzeRequest, AnalyzeResponse, QualityReport, TrackCamera, TrackHit, TrackRequest, TrackResponse
from .settings import Settings, get_settings

KST = timezone(timedelta(hours=9))
VEHICLE_CLASS_IDS = {2: "sedan", 3: "motorcycle", 5: "bus", 7: "truck"}
OCR_RUNTIME_STATE = {
    "engine": None,
    "attempted": False,
    "ready": False,
    "error": None,
}
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
        OCR_RUNTIME_STATE.update({
            "engine": "disabled",
            "attempted": False,
            "ready": False,
            "error": "FORENSIC_DEMO_MODE=true",
        })
        return None

    engine = settings.ocr_engine.strip().lower()
    if engine != "easyocr":
        OCR_RUNTIME_STATE.update({
            "engine": settings.ocr_engine,
            "attempted": False,
            "ready": False,
            "error": "OCR_ENGINE is not easyocr",
        })
        return None

    OCR_RUNTIME_STATE.update({
        "engine": "easyocr",
        "attempted": True,
        "ready": False,
        "error": None,
    })

    try:
        import easyocr
    except Exception as error:
        OCR_RUNTIME_STATE.update({
            "ready": False,
            "error": f"import_failed: {error}",
        })
        return None

    try:
        languages = [
            token.strip()
            for token in settings.ocr_lang_list.split(",")
            if token.strip()
        ] or ["ko", "en"]
        reader = easyocr.Reader(languages, gpu=False, verbose=False)
        OCR_RUNTIME_STATE.update({
            "ready": True,
            "error": None,
        })
        return reader
    except Exception as error:
        OCR_RUNTIME_STATE.update({
            "ready": False,
            "error": f"reader_init_failed: {error}",
        })
        return None


def get_ocr_runtime_state() -> dict[str, Any]:
    settings = get_settings()
    engine = settings.ocr_engine.strip().lower()
    configured = engine == "easyocr" and not settings.forensic_demo_mode
    attempted = OCR_RUNTIME_STATE["attempted"]
    ready = OCR_RUNTIME_STATE["ready"]
    error = OCR_RUNTIME_STATE["error"]
    status = (
        "ready"
        if ready
        else "lazy_not_initialized"
        if configured and not attempted
        else "unavailable"
        if configured
        else "disabled"
    )
    state = {
        "engine": settings.ocr_engine,
        "configured": configured,
        "attempted": attempted,
        "ready": ready,
        "lazy_load": configured and not attempted,
        "status": status,
        "error": error,
    }
    return state


def sample_frames(stream_url: str, frame_limit: int) -> list[np.ndarray]:
    settings = get_settings()

    frames = sample_frames_with_ffmpeg(stream_url, frame_limit, settings)
    if frames:
        return frames

    try:
        import cv2
    except Exception:
        return []

    capture = cv2.VideoCapture(stream_url, getattr(cv2, "CAP_FFMPEG", 0))
    if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
        capture.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, settings.stream_open_timeout_ms)
    if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
        capture.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, settings.stream_read_timeout_ms)
    if hasattr(cv2, "CAP_PROP_BUFFERSIZE"):
        capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    if not capture.isOpened():
        return []

    frames: list[np.ndarray] = []
    started = time.monotonic()
    try:
        while len(frames) < frame_limit:
            if (time.monotonic() - started) * 1000 >= settings.stream_total_budget_ms:
                break
            ok, frame = capture.read()
            if not ok or frame is None:
                break
            frames.append(frame)
    finally:
        capture.release()

    return frames


def sample_frames_with_ffmpeg(stream_url: str, frame_limit: int, settings: Settings) -> list[np.ndarray]:
    try:
        import cv2
    except Exception:
        return []

    effective_limit = max(1, min(frame_limit, 2))
    timeout_seconds = max(4, int(settings.stream_total_budget_ms / 1000) + 2)

    with tempfile.TemporaryDirectory(prefix="forensic-frames-") as temp_dir:
        output_pattern = os.path.join(temp_dir, "frame-%02d.jpg")
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-rw_timeout",
            str(settings.stream_read_timeout_ms * 1000),
            "-threads",
            "1",
            "-i",
            stream_url,
            "-frames:v",
            str(effective_limit),
            "-q:v",
            "2",
            output_pattern,
        ]

        try:
            subprocess.run(
                command,
                check=False,
                timeout=timeout_seconds,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            return []

        frames: list[np.ndarray] = []
        for index in range(1, effective_limit + 1):
            frame_path = os.path.join(temp_dir, f"frame-{index:02d}.jpg")
            if not os.path.exists(frame_path):
                continue
            frame = cv2.imread(frame_path)
            if frame is not None:
                frames.append(frame)

        return frames


def score_frame_quality(frame: np.ndarray) -> float:
    try:
        import cv2
    except Exception:
        return 0.0

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    height, width = gray.shape[:2]
    center_left = int(width * 0.2)
    center_right = int(width * 0.8)
    center_top = int(height * 0.2)
    center_bottom = int(height * 0.8)
    center = gray[center_top:center_bottom, center_left:center_right]
    brightness = float(center.mean()) if center.size else float(gray.mean())

    # Prefer sharper frames with usable exposure; avoid over-weighting very dark or washed-out frames.
    brightness_penalty = abs(brightness - 138.0) * 0.35
    return sharpness - brightness_penalty


def prioritize_frames(frames: list[np.ndarray], limit: int | None = None) -> list[np.ndarray]:
    ranked = sorted(
        frames,
        key=score_frame_quality,
        reverse=True,
    )
    if limit is None:
        return ranked
    return ranked[:limit]


def crop_vehicle_regions(frame: np.ndarray, boxes: list[list[float]], max_crops_per_frame: int = 2) -> list[np.ndarray]:
    height, width = frame.shape[:2]
    ranked_boxes = sorted(
        boxes,
        key=lambda box: max(0.0, (box[2] - box[0]) * (box[3] - box[1])),
        reverse=True,
    )

    crops: list[np.ndarray] = []
    for box in ranked_boxes[:max_crops_per_frame]:
        x1, y1, x2, y2 = [int(round(value)) for value in box]
        x1 = max(0, min(x1, width - 1))
        x2 = max(0, min(x2, width))
        y1 = max(0, min(y1, height - 1))
        y2 = max(0, min(y2, height))
        if x2 <= x1 or y2 <= y1:
            continue

        box_width = x2 - x1
        box_height = y2 - y1
        if box_width < 24 or box_height < 24:
            continue

        pad_x = max(4, int(box_width * 0.08))
        pad_y = max(4, int(box_height * 0.08))

        full_left = max(0, x1 - pad_x)
        full_top = max(0, y1 - pad_y)
        full_right = min(width, x2 + pad_x)
        full_bottom = min(height, y2 + pad_y)
        full_crop = frame[full_top:full_bottom, full_left:full_right]
        if full_crop.size > 0:
            crops.append(full_crop)

        plate_band_top = y1 + int(box_height * 0.4)
        plate_band_bottom = y2 + pad_y
        plate_band = frame[
            max(0, plate_band_top):min(height, plate_band_bottom),
            full_left:full_right,
        ]
        if plate_band.size > 0:
            crops.append(plate_band)

    return crops


def run_yolo_vehicle_scan(frames: list[np.ndarray], settings: Settings) -> tuple[int, list[str], list[np.ndarray]]:
    model = get_yolo_model()
    if model is None or not frames:
        return 0, [], []

    detections = 0
    labels: list[str] = []
    ocr_inputs: list[np.ndarray] = []
    prioritized_frames = prioritize_frames(frames, min(len(frames), 4))
    for frame in prioritized_frames:
        results = model.predict(frame, verbose=False, conf=settings.yolo_confidence)
        frame_boxes: list[list[float]] = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None or getattr(boxes, "cls", None) is None:
                continue
            class_ids = boxes.cls.tolist()
            coords = boxes.xyxy.tolist() if getattr(boxes, "xyxy", None) is not None else []
            for index, class_id in enumerate(class_ids):
                class_int = int(class_id)
                if class_int in VEHICLE_CLASS_IDS:
                    detections += 1
                    labels.append(VEHICLE_CLASS_IDS[class_int])
                    if index < len(coords):
                        frame_boxes.append(coords[index])
        if frame_boxes:
            ocr_inputs.extend(crop_vehicle_regions(frame, frame_boxes))

    return detections, labels, ocr_inputs


def normalize_ocr_text(text: str) -> str:
    return re.sub(r"[\s\-_:./]", "", text.strip())


def iter_plate_search_texts(texts: list[str]) -> list[str]:
    normalized = [
        normalize_ocr_text(text)
        for text in texts
        if normalize_ocr_text(text)
    ]
    search_texts: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            search_texts.append(value)

    for index, text in enumerate(normalized):
        add(text)
        # EasyOCR often splits plates into adjacent tokens like "12가" + "3456".
        # Only combine OCR-observed neighbors; do not invent missing plate text.
        for window_size in (2, 3):
            combined = "".join(normalized[index:index + window_size])
            if len(combined) <= 12:
                add(combined)

    return search_texts


def extract_plate_candidates(texts: list[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    for normalized in iter_plate_search_texts(texts):
        for pattern in PLATE_REGEXES:
            for match in pattern.findall(normalized):
                if match not in seen:
                    seen.add(match)
                    found.append(match)

    return found[:5]


def build_algorithm_label(settings: Settings, ocr_status: str, ocr_engine: str | None, analysis_mode: str = "verify") -> str:
    if settings.forensic_demo_mode:
        if analysis_mode == "scan":
            return "demo-yolo-vehicle-detect / scan-only / mfsr-chain"
        return "demo-yolo-vehicle-detect / target-hint / mfsr-chain"

    if analysis_mode == "scan":
        return "ultralytics-yolo / scan-only"

    if ocr_status == "ocr_active":
        return f"ultralytics-yolo / frame-sampling / {ocr_engine or 'ocr'}-hook"

    if ocr_status == "ocr_unavailable":
        requested_engine = settings.ocr_engine.strip().lower()
        if requested_engine not in {"", "disabled", "none", "off"}:
            return f"ultralytics-yolo / frame-sampling / {requested_engine}-unavailable"

    if ocr_status == "skipped_no_vehicle":
        return "ultralytics-yolo / frame-sampling / ocr-skipped-no-vehicle"

    if ocr_status == "skipped_no_frames":
        return "ultralytics-yolo / frame-sampling / ocr-skipped-no-frames"

    requested_engine = settings.ocr_engine.strip().lower()
    if requested_engine not in {"", "disabled", "none", "off"}:
        return f"ultralytics-yolo / frame-sampling / {requested_engine}-unavailable"

    return "ultralytics-yolo / frame-sampling / no-live-ocr"


def collect_easyocr_texts(reader: Any, frame: np.ndarray) -> list[str]:
    variants: list[Any] = [frame]
    allowlist = "0123456789가나다라마바사아자차카타파하허호배국합서울부산대구인천광주대전울산세종경기강원충북충남전북전남경북경남제주"

    try:
        import cv2

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        variants.append(gray)

        clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
        clahe_gray = clahe.apply(gray)
        variants.append(clahe_gray)

        enlarged = cv2.resize(gray, None, fx=1.8, fy=1.8, interpolation=cv2.INTER_CUBIC)
        variants.append(enlarged)

        enlarged_clahe = cv2.resize(clahe_gray, None, fx=1.8, fy=1.8, interpolation=cv2.INTER_CUBIC)
        variants.append(enlarged_clahe)

        _, binary = cv2.threshold(enlarged, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(binary)
        adaptive = cv2.adaptiveThreshold(
            enlarged_clahe,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,
            7,
        )
        variants.append(adaptive)
        variants.append(cv2.bitwise_not(adaptive))
    except Exception:
        pass

    texts: list[str] = []

    for variant in variants:
        try:
            entries = reader.readtext(
                variant,
                detail=1,
                paragraph=False,
                allowlist=allowlist,
            )
        except Exception:
            continue

        for entry in entries:
            if not isinstance(entry, (list, tuple)) or len(entry) < 2:
                continue

            text = str(entry[1]).strip()
            confidence = float(entry[2]) if len(entry) > 2 and isinstance(entry[2], (int, float)) else 0.0

            if text and confidence >= 0.15:
                texts.append(text)

    return texts


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
        return [], "ocr_unavailable", settings.ocr_engine

    if not frames:
        return [], "skipped_no_frames", settings.ocr_engine

    reader = get_easyocr_reader()
    if reader is None:
        return [], "ocr_unavailable", settings.ocr_engine

    ocr_texts: list[str] = []
    for frame in frames[: settings.ocr_frame_limit]:
        ocr_texts.extend(collect_easyocr_texts(reader, frame))

    candidates = extract_plate_candidates(ocr_texts)
    return candidates, "ocr_active", "easyocr"


def analyze_stream(request: AnalyzeRequest) -> AnalyzeResponse:
    settings = get_settings()
    timestamp = now_kst()
    analysis_mode = request.analysis_mode or "verify"

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
            algorithm=build_algorithm_label(settings, "target_hint_only", None, analysis_mode),
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

    frame_limit = settings.analyze_frame_limit if analysis_mode == "verify" else max(1, min(2, settings.analyze_frame_limit))
    frames = sample_frames(str(request.hls_url), frame_limit)
    frames = prioritize_frames(frames, frame_limit)
    vehicle_count, labels, ocr_inputs = run_yolo_vehicle_scan(frames, settings)
    should_run_ocr = analysis_mode == "verify" and len(frames) > 0 and vehicle_count > 0
    plate_candidates, ocr_status, ocr_engine = (
        run_plate_ocr(ocr_inputs or frames[: settings.ocr_frame_limit], request, settings)
        if should_run_ocr
        else (
            [],
            "skipped_no_frames" if len(frames) == 0 else "skipped_no_vehicle",
            settings.ocr_engine if settings.ocr_engine.strip().lower() not in {"", "disabled", "none", "off"} else None,
        )
    )

    total_input = frame_limit
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
        algorithm=build_algorithm_label(settings, ocr_status, ocr_engine, analysis_mode),
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
    if any(camera.travelOrder is not None for camera in cameras):
        shuffled = sorted(shuffled, key=lambda camera: camera.travelOrder if camera.travelOrder is not None else 9999)
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
                expected_eta_minutes=camera.expectedEtaMinutes,
                time_window_label=camera.timeWindowLabel,
                travel_assessment="unknown",
                travel_assessment_label="판단 보류",
                travel_order=camera.travelOrder,
                is_route_focus=camera.isRouteFocus,
            )
        )
    return sort_track_hits_by_route(hits)


def has_route_metadata(cameras: list[TrackCamera]) -> bool:
    return any(
        camera.travelOrder is not None
        or camera.expectedEtaMinutes is not None
        or camera.timeWindowLabel
        or camera.isRouteFocus
        for camera in cameras
    )


def sort_track_hits_by_route(hits: list[TrackHit]) -> list[TrackHit]:
    return sorted(
        hits,
        key=lambda hit: (
            hit.travel_order if hit.travel_order is not None else 9999,
            hit.expected_eta_minutes if hit.expected_eta_minutes is not None else 9999,
            hit.timestamp,
            -hit.confidence,
        ),
    )


def build_track_message(hit_count: int, cameras: list[TrackCamera], demo: bool = False) -> str:
    if hit_count <= 0:
        return "일치하는 차량 이동 후보가 없습니다."

    action = "생성했습니다" if demo else "찾았습니다"
    prefix = f"{hit_count}건의 {'데모 ' if demo else ''}차량 이동 후보를 {action}"
    if has_route_metadata(cameras):
        return f"{prefix}. 도로축 순서와 ETA 메타데이터를 보존해 정렬했습니다."
    return prefix


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
            message=build_track_message(len(hits), cameras, demo=True),
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
                expected_eta_minutes=camera.expectedEtaMinutes,
                time_window_label=camera.timeWindowLabel,
                travel_assessment="unknown",
                travel_assessment_label="판단 보류",
                travel_order=camera.travelOrder,
                is_route_focus=camera.isRouteFocus,
            )
        )
        if len(hits) >= settings.track_hit_limit:
            break
    hits = sort_track_hits_by_route(hits)

    return TrackResponse(
        tracking_id=tracking_id,
        status="completed",
        searched_cameras=len(cameras),
        hits=hits,
        message=build_track_message(len(hits), cameras),
    )
