from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .settings import get_settings


DEFAULT_STATUS: dict[str, Any] = {
    "taxonomy": "ocr_alpr_backtest_readiness_v1",
    "status": "missing",
    "path": None,
    "configured": False,
    "active_report_count": 0,
    "required_buckets": [],
    "completed_buckets": [],
    "runtime_integrated": False,
    "verification_status": "pending_review",
    "validation_note": "OCR/ALPR 실전 백테스트는 별도 검증 전까지 미활성 상태를 유지한다.",
    "backtest_engine_comparison_count": 0,
    "backtest_engine_comparisons": [],
    "error": None,
}


def _load_payload(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _normalize_engine_comparisons(comparisons: Any) -> list[dict[str, Any]]:
    if not isinstance(comparisons, list):
        return []

    normalized: list[dict[str, Any]] = []
    for entry in comparisons:
        if not isinstance(entry, dict):
            continue
        engine = str(entry.get("engine") or "").strip()
        if not engine:
            continue
        normalized.append({
            "engine": engine,
            "sampleCount": int(entry.get("sampleCount") or entry.get("sample_count") or 0),
            "exactPlateAccuracy": float(entry.get("exactPlateAccuracy") or entry.get("exact_plate_accuracy") or 0),
            "candidateRecall": float(entry.get("candidateRecall") or entry.get("candidate_recall") or 0),
            "falsePositiveRate": float(entry.get("falsePositiveRate") or entry.get("false_positive_rate") or 0),
        })
    return normalized


def get_ocr_alpr_backtest_status() -> dict[str, Any]:
    raw_path = get_settings().ocr_alpr_backtest_path.strip()
    if not raw_path:
        return dict(DEFAULT_STATUS)

    path = Path(raw_path).expanduser()
    payload = _load_payload(path)
    if payload is None:
        status = dict(DEFAULT_STATUS)
        status.update({
            "path": str(path),
            "configured": True,
        })
        return status

    required_buckets = payload.get("required_buckets", [])
    completed_buckets = payload.get("completed_buckets", [])
    if not isinstance(required_buckets, list):
        required_buckets = []
    if not isinstance(completed_buckets, list):
        completed_buckets = []

    active_report_count = payload.get("active_report_count", 0)
    runtime_integrated = bool(payload.get("runtime_integrated", False))
    status = payload.get("status", "pending_review")
    verification_status = payload.get("verification_status", "pending_review")
    validation_note = payload.get(
        "validation_note",
        "OCR/ALPR 실전 백테스트는 별도 검증 전까지 미활성 상태를 유지한다.",
    )
    engine_comparisons = _normalize_engine_comparisons(
        payload.get("engineComparisons", payload.get("engine_comparisons", []))
    )

    return {
        "taxonomy": payload.get("taxonomy", DEFAULT_STATUS["taxonomy"]),
        "status": status,
        "path": str(path),
        "configured": True,
        "active_report_count": int(active_report_count) if isinstance(active_report_count, (int, float)) else 0,
        "required_buckets": [str(bucket) for bucket in required_buckets],
        "completed_buckets": [str(bucket) for bucket in completed_buckets],
        "runtime_integrated": runtime_integrated,
        "verification_status": verification_status,
        "validation_note": validation_note,
        "backtest_engine_comparison_count": len(engine_comparisons),
        "backtest_engine_comparisons": engine_comparisons,
        "error": None,
    }
