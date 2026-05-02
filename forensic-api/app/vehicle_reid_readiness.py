from __future__ import annotations

import json
from pathlib import Path

from .settings import get_settings


def get_vehicle_reid_readiness_path() -> Path:
    raw_path = get_settings().vehicle_reid_readiness_path.strip()
    path = Path(raw_path or "data/vehicle-reid-readiness.json")
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[2] / path


def _metric_passes(value: object, threshold: float) -> bool:
    return isinstance(value, (int, float)) and 0 <= float(value) <= 1 and float(value) >= threshold


def _false_positive_passes(value: object, max_rate: float) -> bool:
    return isinstance(value, (int, float)) and 0 <= float(value) <= 1 and float(value) <= max_rate


def _active_report_passes(report: object, known_dataset_ids: set[str], threshold: float, max_false_positive_rate: float) -> bool:
    if not isinstance(report, dict) or report.get("status") != "active":
        return False

    dataset_ids = report.get("datasetIds")
    if not isinstance(dataset_ids, list) or not dataset_ids:
        return False
    if any(not isinstance(dataset_id, str) or dataset_id not in known_dataset_ids for dataset_id in dataset_ids):
        return False

    metrics = report.get("metrics")
    if not isinstance(metrics, dict):
        return False

    return (
        _metric_passes(metrics.get("top1Accuracy"), threshold)
        and _metric_passes(metrics.get("crossCameraAccuracy"), threshold)
        and _false_positive_passes(metrics.get("falsePositiveRate"), max_false_positive_rate)
    )


def get_vehicle_reid_readiness_status() -> dict[str, object]:
    path = get_vehicle_reid_readiness_path()
    if not path.exists():
        return {
            "status": "missing",
            "path": str(path),
            "datasets": 0,
            "model_reports": 0,
            "active_models": 0,
            "activation_threshold": 0.85,
            "max_false_positive_rate": 0.05,
            "same_vehicle_reid_ready": False,
            "runtime_integrated": False,
        }

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("readiness payload must be an object")

        policy = payload.get("policy") if isinstance(payload.get("policy"), dict) else {}
        threshold = policy.get("activationThreshold", 0.85)
        threshold = float(threshold) if isinstance(threshold, (int, float)) else 0.85
        max_false_positive_rate = policy.get("maxFalsePositiveRate", 0.05)
        max_false_positive_rate = float(max_false_positive_rate) if isinstance(max_false_positive_rate, (int, float)) else 0.05

        datasets = payload.get("datasets") if isinstance(payload.get("datasets"), list) else []
        model_reports = payload.get("modelReports") if isinstance(payload.get("modelReports"), list) else []
        known_dataset_ids = {
            dataset.get("id")
            for dataset in datasets
            if isinstance(dataset, dict) and isinstance(dataset.get("id"), str)
        }
        active_models = [
            report
            for report in model_reports
            if _active_report_passes(report, known_dataset_ids, threshold, max_false_positive_rate)
        ]
        active_count = len(active_models)
        status = (
            "active_report_ready"
            if active_count > 0
            else "empty"
            if not datasets and not model_reports
            else "no_active_model"
        )

        return {
            "status": status,
            "path": str(path),
            "datasets": len(datasets),
            "model_reports": len(model_reports),
            "active_models": active_count,
            "activation_threshold": threshold,
            "max_false_positive_rate": max_false_positive_rate,
            "same_vehicle_reid_ready": active_count > 0,
            "runtime_integrated": False,
        }
    except Exception as error:
        return {
            "status": "missing",
            "path": str(path),
            "datasets": 0,
            "model_reports": 0,
            "active_models": 0,
            "activation_threshold": 0.85,
            "max_false_positive_rate": 0.05,
            "same_vehicle_reid_ready": False,
            "runtime_integrated": False,
            "error": str(error),
        }
