from __future__ import annotations

import json
import os
import sys
import tempfile
import types
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "forensic-api"))


@dataclass
class StubSettings:
    track_store_backend: str = "auto"
    track_store_path: str = ""
    track_store_dsn: str = ""
    track_store_table: str = "tracking_results"


CURRENT_SETTINGS = StubSettings()
INITIAL_TRACK_STORE_DSN = os.environ.get("TRACK_STORE_DSN", "").strip()


@dataclass
class StubTrackResponse:
    tracking_id: str
    status: str
    searched_cameras: int
    origin_timestamp: datetime | None = None
    hits: list[dict] = field(default_factory=list)
    message: str | None = None

    def model_dump(self, mode: str = "python"):
        return {
            "tracking_id": self.tracking_id,
            "status": self.status,
            "searched_cameras": self.searched_cameras,
            "origin_timestamp": self.origin_timestamp.isoformat() if self.origin_timestamp else None,
            "hits": self.hits,
            "message": self.message,
        }

    @classmethod
    def model_validate(cls, payload):
        origin_timestamp = payload.get("origin_timestamp")
        if isinstance(origin_timestamp, str):
            origin_timestamp = datetime.fromisoformat(origin_timestamp.replace("Z", "+00:00"))
        return cls(
            tracking_id=str(payload["tracking_id"]),
            status=str(payload["status"]),
            searched_cameras=int(payload["searched_cameras"]),
            origin_timestamp=origin_timestamp,
            hits=list(payload.get("hits") or []),
            message=payload.get("message"),
        )


def get_settings():
    return CURRENT_SETTINGS


settings_module = types.ModuleType("app.settings")
settings_module.get_settings = get_settings

models_module = types.ModuleType("app.models")
models_module.TrackResponse = StubTrackResponse

sys.modules["app.settings"] = settings_module
sys.modules["app.models"] = models_module

from app import store as tracking_store  # noqa: E402


def reset_store():
    tracking_store._TRACKING_STORE.clear()


def set_env(**pairs: str | None):
    for key, value in pairs.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value

    CURRENT_SETTINGS.track_store_backend = os.environ.get("TRACK_STORE_BACKEND", "auto")
    CURRENT_SETTINGS.track_store_path = os.environ.get("TRACK_STORE_PATH", "")
    CURRENT_SETTINGS.track_store_dsn = os.environ.get("TRACK_STORE_DSN", "")
    CURRENT_SETTINGS.track_store_table = os.environ.get("TRACK_STORE_TABLE", "tracking_results")
    reset_store()


def make_result(tracking_id: str) -> StubTrackResponse:
    return StubTrackResponse(
        tracking_id=tracking_id,
        status="completed",
        searched_cameras=2,
        origin_timestamp=datetime.now(timezone.utc),
        hits=[],
        message="ok",
    )


def assert_memory_mode():
    set_env(
        TRACK_STORE_BACKEND="auto",
        TRACK_STORE_PATH="",
        TRACK_STORE_DSN="",
    )
    status = tracking_store.get_tracking_store_status()
    assert status["backend"] == "memory"
    assert status["external_db"] is False
    assert status["durable"] is False
    result = make_result("track-memory")
    tracking_store.save_tracking_result(result)
    saved = tracking_store.get_tracking_result("track-memory")
    assert saved is not None and saved.tracking_id == "track-memory"


def assert_json_file_mode():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "tracking-store.json"
        set_env(
            TRACK_STORE_BACKEND="json_file",
            TRACK_STORE_PATH=str(path),
            TRACK_STORE_DSN="",
        )
        status = tracking_store.get_tracking_store_status()
        assert status["backend"] == "json_file"
        assert status["durable"] is True
        assert status["external_db"] is False
        result = make_result("track-json")
        tracking_store.save_tracking_result(result)
        assert path.exists()
        saved = tracking_store.get_tracking_result("track-json")
        assert saved is not None and saved.tracking_id == "track-json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert "track-json" in payload


def assert_postgres_fallback_mode():
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "fallback-tracking-store.json"
        set_env(
            TRACK_STORE_BACKEND="postgres",
            TRACK_STORE_PATH=str(path),
            TRACK_STORE_DSN="postgresql://127.0.0.1:1/does_not_exist",
        )
        status = tracking_store.get_tracking_store_status()
        assert status["backend"] == "json_file"
        assert status["requested_backend"] == "postgres"
        assert status["external_db"] is False
        assert status["error"]
        result = make_result("track-postgres-fallback")
        tracking_store.save_tracking_result(result)
        saved = tracking_store.get_tracking_result("track-postgres-fallback")
        assert saved is not None and saved.tracking_id == "track-postgres-fallback"
        assert path.exists()


def assert_live_postgres_mode():
    dsn = INITIAL_TRACK_STORE_DSN
    if not dsn:
        print("skip - live postgres tracking store validation (TRACK_STORE_DSN is not set)")
        return False

    set_env(
        TRACK_STORE_BACKEND="auto",
        TRACK_STORE_PATH="",
        TRACK_STORE_DSN=dsn,
    )
    status = tracking_store.get_tracking_store_status()
    assert status["backend"] == "postgres"
    assert status["requested_backend"] == "auto"
    assert status["external_db"] is True
    assert status["durable"] is True

    tracking_id = f"track-postgres-live-{uuid4().hex}"
    result = make_result(tracking_id)
    tracking_store.save_tracking_result(result)
    saved = tracking_store.get_tracking_result(tracking_id)
    assert saved is not None and saved.tracking_id == tracking_id
    assert saved.status == "completed"
    assert saved.searched_cameras == 2

    roundtrip_status = tracking_store.get_tracking_store_status()
    assert roundtrip_status["backend"] == "postgres"
    assert roundtrip_status["external_db"] is True
    assert roundtrip_status["durable"] is True
    return True


def main():
    assert_memory_mode()
    assert_json_file_mode()
    assert_postgres_fallback_mode()
    live_postgres_ran = assert_live_postgres_mode()
    if live_postgres_ran:
        print("ok - tracking store backend fallback, json persistence, and live postgres checks passed")
    else:
        print("ok - tracking store backend fallback and json persistence checks passed")


if __name__ == "__main__":
    main()
