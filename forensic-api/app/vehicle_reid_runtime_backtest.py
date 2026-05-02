from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .settings import get_settings

DEFAULT_REQUIRED_BUCKETS = ["day", "night", "cross_camera", "long_distance", "low_resolution"]

DEFAULT_STATUS: dict[str, Any] = {
    "taxonomy": "vehicle_reid_runtime_backtest_report_v1",
    "status": "pending_review",
    "path": None,
    "configured": False,
    "active_report_count": 0,
    "required_buckets": list(DEFAULT_REQUIRED_BUCKETS),
    "completed_buckets": [],
    "runtime_integrated": False,
    "verification_status": "pending_review",
    "validation_note": "ReID runtime backtest report remains pending review until reviewed observations are added.",
    "error": None,
}


def get_vehicle_reid_runtime_backtest_path() -> Path:
    raw_path = get_settings().vehicle_reid_runtime_backtest_path.strip()
    path = Path(raw_path or "data/vehicle-reid-runtime-backtest-report.json")
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[2] / path


def _load_payload(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _pick_first_report(reports: object) -> dict[str, Any] | None:
    if not isinstance(reports, list):
        return None
    for report in reports:
        if isinstance(report, dict):
            return report
    return None


def _coerce_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        numeric = float(value)
        return numeric if 0 <= numeric <= 1 else None
    return None


def get_vehicle_reid_runtime_backtest_status() -> dict[str, Any]:
    path = get_vehicle_reid_runtime_backtest_path()
    payload = _load_payload(path)
    if payload is None:
        status = dict(DEFAULT_STATUS)
        status.update({
            "path": str(path),
            "configured": True,
        })
        return status

    policy = payload.get("policy") if isinstance(payload.get("policy"), dict) else {}
    required_buckets = policy.get("requiredBuckets", DEFAULT_REQUIRED_BUCKETS)
    if not isinstance(required_buckets, list):
        required_buckets = list(DEFAULT_REQUIRED_BUCKETS)

    reports = payload.get("reports")
    active_report_count = payload.get("active_report_count", 0)
    if not isinstance(active_report_count, (int, float)):
        active_report_count = 0
    else:
        active_report_count = int(active_report_count)

    report = _pick_first_report(reports) or {}
    bucket_results = report.get("bucketResults") if isinstance(report.get("bucketResults"), list) else []
    completed_buckets = [
        str(bucket_result.get("bucket"))
        for bucket_result in bucket_results
        if isinstance(bucket_result, dict)
        and isinstance(bucket_result.get("bucket"), str)
        and bucket_result.get("bucket") in required_buckets
        and int(bucket_result.get("sampleCount") or 0) > 0
    ]

    summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
    evidence = report.get("evidence") if isinstance(report.get("evidence"), dict) else {}
    status = str(report.get("status") or "pending_review")
    if active_report_count > 0:
        status = "active"
    elif not reports:
        status = "pending_review"

    match_success_rate = _coerce_float(summary.get("matchSuccessRate"))
    false_positive_rate = _coerce_float(summary.get("falsePositiveRate"))
    false_negative_rate = _coerce_float(summary.get("falseNegativeRate"))
    gallery_growth = summary.get("galleryGrowth")
    if not isinstance(gallery_growth, (int, float)):
        gallery_growth = 0

    runtime_backend = str(report.get("engine") or evidence.get("runtimeBackend") or payload.get("runtime_backend") or "baseline")
    match_threshold = _coerce_float(evidence.get("matchThreshold")) or _coerce_float(payload.get("match_threshold")) or 0.86
    sample_count_total = int(summary.get("sampleCountTotal") or report.get("sampleCountTotal") or 0)
    reviewed_sample_count = int(summary.get("reviewedSampleCount") or report.get("reviewedSampleCount") or 0)
    missing_observation_count = int(summary.get("missingObservationCount") or report.get("missingObservationCount") or 0)

    if status == "active":
        validation_note = (
            f"matchSuccessRate={match_success_rate:.3f}"
            if match_success_rate is not None
            else "reviewed ReID runtime backtest report is active"
        )
    elif status == "review_needed":
        validation_note = "ReID runtime backtest report needs more reviewed samples before runtime approval."
    else:
        validation_note = "ReID runtime backtest report remains pending review until reviewed observations are added."

    if match_success_rate is not None and false_positive_rate is not None and false_negative_rate is not None:
        validation_note = (
            f"{validation_note} · match {match_success_rate:.3f} / fp {false_positive_rate:.3f} / fn {false_negative_rate:.3f} / gallery +{int(gallery_growth)}"
        )

    return {
        "taxonomy": payload.get("taxonomy", DEFAULT_STATUS["taxonomy"]),
        "status": status,
        "path": str(path),
        "configured": True,
        "active_report_count": active_report_count,
        "required_buckets": [str(bucket) for bucket in required_buckets],
        "completed_buckets": completed_buckets,
        "runtime_integrated": active_report_count > 0,
        "verification_status": status,
        "validation_note": validation_note,
        "runtime_backend": runtime_backend,
        "match_threshold": match_threshold,
        "sample_count_total": sample_count_total,
        "reviewed_sample_count": reviewed_sample_count,
        "missing_observation_count": missing_observation_count,
        "match_success_rate": match_success_rate,
        "false_positive_rate": false_positive_rate,
        "false_negative_rate": false_negative_rate,
        "gallery_growth": int(gallery_growth),
        "error": None,
    }
