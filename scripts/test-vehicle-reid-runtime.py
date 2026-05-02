from __future__ import annotations

import json
import os
import sys
import tempfile
import types
from argparse import ArgumentParser
from dataclasses import dataclass
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "forensic-api"))
DEFAULT_SUMMARY_PATH = REPO_ROOT / "data" / "vehicle-reid-runtime-backtest-summary.json"


@dataclass
class StubSettings:
    vehicle_reid_runtime_enabled: bool = False
    vehicle_reid_runtime_backend: str = "baseline"
    vehicle_reid_runtime_model_path: str = ""
    vehicle_reid_runtime_embedding_dimension: int = 0
    vehicle_reid_gallery_path: str = ""
    vehicle_reid_match_threshold: float = 0.86
    vehicle_reid_gallery_limit: int = 100
    vehicle_reid_readiness_path: str = "data/vehicle-reid-readiness.json"
    vehicle_reid_runtime_backtest_path: str = "data/vehicle-reid-runtime-backtest-report.json"


CURRENT_SETTINGS = StubSettings()


def get_settings():
    return CURRENT_SETTINGS


settings_module = types.ModuleType("app.settings")
settings_module.get_settings = get_settings
sys.modules["app.settings"] = settings_module

from app.vehicle_reid_runtime import (  # noqa: E402
    get_vehicle_reid_runtime_status,
    match_vehicle_reid_observations,
)
from app.vehicle_reid_runtime_backtest import get_vehicle_reid_runtime_backtest_status  # noqa: E402


def set_env(**pairs: str | None) -> None:
    for key, value in pairs.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

    CURRENT_SETTINGS.vehicle_reid_runtime_enabled = os.environ.get("VEHICLE_REID_RUNTIME_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}
    CURRENT_SETTINGS.vehicle_reid_runtime_backend = os.environ.get("VEHICLE_REID_RUNTIME_BACKEND", "baseline")
    CURRENT_SETTINGS.vehicle_reid_runtime_model_path = os.environ.get("VEHICLE_REID_RUNTIME_MODEL_PATH", "")
    raw_dimension = os.environ.get("VEHICLE_REID_RUNTIME_EMBEDDING_DIMENSION", "").strip()
    try:
        CURRENT_SETTINGS.vehicle_reid_runtime_embedding_dimension = int(raw_dimension) if raw_dimension else 0
    except ValueError:
        CURRENT_SETTINGS.vehicle_reid_runtime_embedding_dimension = 0
    CURRENT_SETTINGS.vehicle_reid_gallery_path = os.environ.get("VEHICLE_REID_GALLERY_PATH", "")
    raw_threshold = os.environ.get("VEHICLE_REID_MATCH_THRESHOLD", "0.86").strip()
    try:
        CURRENT_SETTINGS.vehicle_reid_match_threshold = float(raw_threshold or 0.86)
    except ValueError:
        CURRENT_SETTINGS.vehicle_reid_match_threshold = 0.86
    raw_limit = os.environ.get("VEHICLE_REID_GALLERY_LIMIT", "100").strip()
    try:
        CURRENT_SETTINGS.vehicle_reid_gallery_limit = int(raw_limit or 100)
    except ValueError:
        CURRENT_SETTINGS.vehicle_reid_gallery_limit = 100
    CURRENT_SETTINGS.vehicle_reid_readiness_path = os.environ.get("VEHICLE_REID_READINESS_PATH", "data/vehicle-reid-readiness.json")
    CURRENT_SETTINGS.vehicle_reid_runtime_backtest_path = os.environ.get("VEHICLE_REID_RUNTIME_BACKTEST_PATH", "data/vehicle-reid-runtime-backtest-report.json")


def write_readiness(path: Path, embedding_dimension: int | None = None) -> None:
    model_report = {
        "id": "reid-model-001",
        "status": "active",
        "modelFamily": "embedding-reid",
        "weightsPath": "/verified/reid/best.pt",
        "datasetIds": ["dataset-001"],
        "metrics": {
            "top1Accuracy": 0.9,
            "meanAveragePrecision": 0.81,
            "crossCameraAccuracy": 0.87,
            "precision": 0.9,
            "recall": 0.86,
            "falsePositiveRate": 0.03,
        },
        "evidence": {
            "reportPath": "/verified/reports/reid-backtest.json",
            "reviewer": "auditor",
            "reviewedAt": "2026-04-29",
        },
    }
    if embedding_dimension is not None:
        model_report["embeddingDimension"] = embedding_dimension

    payload = {
        "schemaVersion": 1,
        "taxonomy": "vehicle_reid_readiness_v1",
        "policy": {
            "noIdentityMatchWithoutValidatedEmbedding": True,
            "activationMetric": "top1Accuracy",
            "activationThreshold": 0.85,
            "maxFalsePositiveRate": 0.05,
        },
        "datasets": [
            {
                "id": "dataset-001",
                "sourceName": "reviewed-reid-dataset",
                "sourceType": "manual_review",
                "licenseStatus": "approved",
                "reviewStatus": "approved",
                "identityCount": 40,
                "imageCount": 160,
                "cameraCount": 4,
                "evidence": {
                    "datasetPath": "/verified/reid-dataset",
                    "reviewer": "auditor",
                    "reviewedAt": "2026-04-29",
                },
            },
        ],
        "modelReports": [model_report],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_runtime_backtest_report(path: Path, status: str = "pending_review", active_report_count: int = 0) -> None:
    report_payload = {
        "schemaVersion": 1,
        "taxonomy": "vehicle_reid_runtime_backtest_report_v1",
        "active_report_count": active_report_count,
        "policy": {
            "noRuntimeMatchApprovalWithoutReviewedReport": True,
            "requiredBuckets": ["day", "night", "cross_camera", "long_distance", "low_resolution"],
            "minSamplesPerBucket": 20,
            "minSamplesTotal": 100,
            "matchSuccessRateThreshold": 0.85,
            "falsePositiveRateMax": 0.05,
            "falseNegativeRateMax": 0.15,
        },
        "reports": [
            {
                "id": "reid-runtime-backtest-main",
                "status": status,
                "engine": "baseline",
                "datasetId": "vehicle-reid-backtest-samples",
                "sampleCountTotal": 0 if status != "active" else 100,
                "reviewedSampleCount": 0 if status != "active" else 100,
                "missingObservationCount": 0,
                "bucketResults": [
                    {
                        "bucket": bucket,
                        "sampleCount": 0 if status != "active" else 20,
                        "reviewedSampleCount": 0 if status != "active" else 20,
                        "missingObservationCount": 0,
                        "expectedPositiveCount": 0,
                        "expectedNegativeCount": 0,
                        "truePositiveMatches": 0 if status != "active" else 20,
                        "trueNegativeUnmatched": 0,
                        "falsePositiveMatches": 0,
                        "falseNegativeUnmatched": 0,
                        "matchSuccessRate": 0 if status != "active" else 1,
                        "falsePositiveRate": 0,
                        "falseNegativeRate": 0,
                    }
                    for bucket in ["day", "night", "cross_camera", "long_distance", "low_resolution"]
                ],
                "summary": {
                    "sampleCountTotal": 0 if status != "active" else 100,
                    "reviewedSampleCount": 0 if status != "active" else 100,
                    "missingObservationCount": 0,
                    "expectedPositiveCount": 0 if status != "active" else 40,
                    "expectedNegativeCount": 0 if status != "active" else 60,
                    "truePositiveMatches": 0 if status != "active" else 40,
                    "trueNegativeUnmatched": 0 if status != "active" else 60,
                    "falsePositiveMatches": 0,
                    "falseNegativeUnmatched": 0,
                    "matchSuccessRate": 0 if status != "active" else 1,
                    "falsePositiveRate": 0,
                    "falseNegativeRate": 0,
                    "galleryEntriesBefore": 0,
                    "galleryEntriesAfter": 0 if status != "active" else 100,
                    "galleryGrowth": 0 if status != "active" else 100,
                    "observationCoverage": 0 if status != "active" else 1,
                },
                "evidence": {
                    "datasetPath": "/verified/reid-backtest",
                    "samplesPath": "/verified/reid-backtest-samples.csv",
                    "observationsPath": "/verified/reid-backtest-observations.json",
                    "reportPath": str(path),
                    "reviewer": "auditor",
                    "reviewedAt": "2026-04-29",
                    "generatedAt": "2026-05-01T00:00:00Z",
                    "runtimeBackend": "baseline",
                    "matchThreshold": 0.92,
                },
            }
        ],
    }
    path.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")


def make_crop(
    color: tuple[int, int, int],
    accent: tuple[int, int, int],
    shift: int = 0,
    stripes: bool = True,
) -> np.ndarray:
    image = np.zeros((72, 96, 3), dtype=np.uint8)
    image[:, :] = color
    image[12 + shift : 60 + shift, 16:80] = accent
    if stripes:
        image[24:48, 28:68] = (255, 255, 255)
        image[30:42, 18:78] = (255, 255, 255)
    return image


def assert_status(expected: str) -> dict[str, object]:
    status = get_vehicle_reid_runtime_status()
    assert status["status"] == expected, f"expected {expected}, got {status['status']}"
    return status


def build_summary_payload(
    threshold: float,
    first: dict[str, object],
    second: dict[str, object],
    third: dict[str, object],
) -> dict[str, object]:
    cases = [
        {"id": "first_seen_seed", "expected": "unmatched", "actual": str(first["match_status"]), "score": None},
        {
            "id": "cross_camera_repeat",
            "expected": "matched",
            "actual": str(second["match_status"]),
            "score": float(second["match_score"]) if isinstance(second.get("match_score"), (float, int)) else None,
        },
        {"id": "different_vehicle_probe", "expected": "unmatched", "actual": str(third["match_status"]), "score": None},
    ]
    true_positive = sum(1 for case in cases if case["expected"] == "matched" and case["actual"] == "matched")
    false_positive = sum(1 for case in cases if case["expected"] == "unmatched" and case["actual"] == "matched")
    false_negative = sum(1 for case in cases if case["expected"] == "matched" and case["actual"] != "matched")
    true_negative = sum(1 for case in cases if case["expected"] == "unmatched" and case["actual"] != "matched")
    expected_positive = sum(1 for case in cases if case["expected"] == "matched")
    expected_negative = sum(1 for case in cases if case["expected"] == "unmatched")

    return {
        "schemaVersion": 1,
        "taxonomy": "vehicle_reid_runtime_backtest_summary_v1",
        "status": "synthetic_validated",
        "backend": "baseline",
        "matchThreshold": threshold,
        "totalCases": len(cases),
        "expectedPositiveCases": expected_positive,
        "expectedNegativeCases": expected_negative,
        "truePositiveMatches": true_positive,
        "trueNegativeUnmatched": true_negative,
        "falsePositiveMatches": false_positive,
        "falseNegativeUnmatched": false_negative,
        "matchSuccessRate": true_positive / expected_positive if expected_positive else 0.0,
        "falsePositiveRate": false_positive / expected_negative if expected_negative else 0.0,
        "galleryEntriesAfterRun": int(third["gallery_entries_after"]),
        "cases": cases,
        "notes": [
            "Synthetic baseline ReID backtest only; not a reviewed production activation report.",
            "Runtime gate remains separate from readiness and real-world cross-camera validation.",
        ],
    }


def parse_args() -> ArgumentParser:
    parser = ArgumentParser(description="Vehicle ReID runtime smoke test and synthetic backtest summary")
    parser.add_argument("--write-summary", action="store_true", help="Write a JSON summary to data/vehicle-reid-runtime-backtest-summary.json")
    parser.add_argument("--summary-path", default=str(DEFAULT_SUMMARY_PATH), help="Path for the JSON summary output")
    return parser


def main() -> None:
    args = parse_args().parse_args()
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        readiness_empty = tmpdir_path / "reid-readiness-empty.json"
        readiness_active = tmpdir_path / "reid-readiness-active.json"
        readiness_dim_mismatch = tmpdir_path / "reid-readiness-mismatch.json"
        runtime_backtest_missing = tmpdir_path / "reid-runtime-backtest-missing.json"
        runtime_backtest_active = tmpdir_path / "reid-runtime-backtest-active.json"

        readiness_empty.write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "taxonomy": "vehicle_reid_readiness_v1",
                    "policy": {
                        "noIdentityMatchWithoutValidatedEmbedding": True,
                        "activationMetric": "top1Accuracy",
                        "activationThreshold": 0.85,
                        "maxFalsePositiveRate": 0.05,
                    },
                    "datasets": [],
                    "modelReports": [],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        write_readiness(readiness_active)
        write_readiness(readiness_dim_mismatch, embedding_dimension=512)
        write_runtime_backtest_report(runtime_backtest_missing, status="pending_review", active_report_count=0)
        write_runtime_backtest_report(runtime_backtest_active, status="active", active_report_count=1)

        gallery_path = tmpdir_path / "reid-gallery.json"
        unsupported_model = tmpdir_path / "unsupported-model.bin"
        unsupported_model.write_text("placeholder", encoding="utf-8")

        set_env(
            VEHICLE_REID_RUNTIME_ENABLED="false",
            VEHICLE_REID_RUNTIME_BACKEND="baseline",
            VEHICLE_REID_RUNTIME_MODEL_PATH="",
            VEHICLE_REID_RUNTIME_EMBEDDING_DIMENSION="",
            VEHICLE_REID_GALLERY_PATH=str(gallery_path),
            VEHICLE_REID_MATCH_THRESHOLD="0.86",
            VEHICLE_REID_READINESS_PATH=str(readiness_empty),
        )
        disabled = assert_status("disabled")
        assert disabled["runtime_integrated"] is False

        set_env(
            VEHICLE_REID_RUNTIME_ENABLED="true",
            VEHICLE_REID_RUNTIME_BACKEND="baseline",
            VEHICLE_REID_RUNTIME_MODEL_PATH="",
            VEHICLE_REID_RUNTIME_EMBEDDING_DIMENSION="",
            VEHICLE_REID_GALLERY_PATH=str(gallery_path),
            VEHICLE_REID_MATCH_THRESHOLD="0.86",
            VEHICLE_REID_READINESS_PATH=str(readiness_empty),
        )
        readiness_not_active = assert_status("readiness_not_active")
        assert readiness_not_active["readiness_active_models"] == 0

        set_env(
            VEHICLE_REID_RUNTIME_ENABLED="true",
            VEHICLE_REID_RUNTIME_BACKEND="unsupported",
            VEHICLE_REID_RUNTIME_MODEL_PATH=str(unsupported_model),
            VEHICLE_REID_RUNTIME_EMBEDDING_DIMENSION="",
            VEHICLE_REID_GALLERY_PATH=str(gallery_path),
            VEHICLE_REID_MATCH_THRESHOLD="0.86",
            VEHICLE_REID_READINESS_PATH=str(readiness_active),
        )
        model_not_configured = assert_status("model_not_configured")
        assert model_not_configured["runtime_integrated"] is False

        set_env(
            VEHICLE_REID_RUNTIME_ENABLED="true",
            VEHICLE_REID_RUNTIME_BACKEND="baseline",
            VEHICLE_REID_RUNTIME_MODEL_PATH="",
            VEHICLE_REID_RUNTIME_EMBEDDING_DIMENSION="",
            VEHICLE_REID_GALLERY_PATH=str(gallery_path),
            VEHICLE_REID_MATCH_THRESHOLD="0.92",
            VEHICLE_REID_READINESS_PATH=str(readiness_active),
        )
        ready = assert_status("runtime_ready")
        assert ready["runtime_integrated"] is True
        assert ready["gallery_entries"] == 0

        similar_a = make_crop((38, 34, 130), (74, 66, 210), shift=0)
        similar_b = make_crop((40, 36, 126), (72, 64, 208), shift=1)
        different = make_crop((10, 180, 40), (0, 0, 0), shift=0, stripes=False)

        first = match_vehicle_reid_observations(
            [(similar_a, 1.0)],
            {
                "job_id": "job-a",
                "observation_id": "job-a",
                "cctv_id": "cctv-a",
                "timestamp": "2026-05-01T00:00:00Z",
                "vehicle_type_hint": "car",
                "vehicle_labels": ["car"],
                "source_frame_count": 1,
            },
        )
        assert first["match_status"] == "unmatched"
        assert first["gallery_entries_before"] == 0
        assert first["gallery_entries_after"] == 1

        second = match_vehicle_reid_observations(
            [(similar_b, 1.0)],
            {
                "job_id": "job-b",
                "observation_id": "job-b",
                "cctv_id": "cctv-b",
                "timestamp": "2026-05-01T00:01:00Z",
                "vehicle_type_hint": "car",
                "vehicle_labels": ["car"],
                "source_frame_count": 1,
            },
        )
        assert second["match_status"] == "matched"
        assert isinstance(second["match_score"], (float, int)) and second["match_score"] >= 0.92
        assert second["best_match_id"] == first["stored_entry_id"]
        assert second["gallery_entries_after"] == 2

        third = match_vehicle_reid_observations(
            [(different, 1.0)],
            {
                "job_id": "job-c",
                "observation_id": "job-c",
                "cctv_id": "cctv-c",
                "timestamp": "2026-05-01T00:02:00Z",
                "vehicle_type_hint": "truck",
                "vehicle_labels": ["truck"],
                "source_frame_count": 1,
            },
        )
        assert third["match_status"] == "unmatched"
        assert third["gallery_entries_after"] == 3
        assert Path(gallery_path).exists()

        set_env(
            VEHICLE_REID_RUNTIME_ENABLED="true",
            VEHICLE_REID_RUNTIME_BACKEND="baseline",
            VEHICLE_REID_RUNTIME_MODEL_PATH="",
            VEHICLE_REID_RUNTIME_EMBEDDING_DIMENSION="512",
            VEHICLE_REID_GALLERY_PATH=str(gallery_path),
            VEHICLE_REID_MATCH_THRESHOLD="0.92",
            VEHICLE_REID_READINESS_PATH=str(readiness_dim_mismatch),
        )
        mismatch = assert_status("model_dimension_mismatch")
        assert mismatch["runtime_integrated"] is False

        set_env(
            VEHICLE_REID_RUNTIME_BACKTEST_PATH=str(runtime_backtest_missing),
        )
        runtime_backtest_pending = get_vehicle_reid_runtime_backtest_status()
        assert runtime_backtest_pending["status"] == "pending_review"
        assert runtime_backtest_pending["active_report_count"] == 0
        assert runtime_backtest_pending["runtime_integrated"] is False

        set_env(
            VEHICLE_REID_RUNTIME_BACKTEST_PATH=str(runtime_backtest_active),
        )
        runtime_backtest_active_status = get_vehicle_reid_runtime_backtest_status()
        assert runtime_backtest_active_status["status"] == "active"
        assert runtime_backtest_active_status["active_report_count"] == 1
        assert runtime_backtest_active_status["runtime_integrated"] is True

        summary = build_summary_payload(0.92, first, second, third)
        if args.write_summary:
            summary_path = Path(args.summary_path).resolve()
            summary_path.parent.mkdir(parents=True, exist_ok=True)
            summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
            print(f"ok - vehicle ReID runtime backtest summary written to {summary_path}")

    print("ok - vehicle ReID runtime inference, gallery search, and match gate passed")


if __name__ == "__main__":
    main()
