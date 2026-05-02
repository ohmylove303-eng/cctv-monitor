from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock

from .models import TrackResponse
from .settings import get_settings
from .postgres_store import (
    get_tracking_result_postgres,
    probe_postgres_tracking_store,
    save_tracking_result_postgres,
)

_TRACKING_STORE: dict[str, TrackResponse] = {}
_STORE_LOCK = Lock()


def get_track_store_path() -> Path | None:
    raw_path = get_settings().track_store_path.strip()
    if not raw_path:
        return None
    return Path(raw_path).expanduser()


def _normalize_backend(value: str) -> str:
    backend = value.strip().lower() or "auto"
    if backend in {"auto", "memory", "json_file", "postgres"}:
        return backend
    return "auto"


def _resolve_effective_backend() -> tuple[str, dict[str, object] | None]:
    settings = get_settings()
    requested_backend = _normalize_backend(settings.track_store_backend)
    path = get_track_store_path()

    postgres_probe: dict[str, object] | None = None
    if requested_backend in {"auto", "postgres"}:
        postgres_probe = probe_postgres_tracking_store()
        if bool(postgres_probe.get("ready")):
            return "postgres", postgres_probe

    if path is not None:
        return "json_file", postgres_probe

    return "memory", postgres_probe


def load_persisted_tracking_store(path: Path) -> dict[str, TrackResponse]:
    if not path.exists():
        return {}

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}

    if not isinstance(payload, dict):
        return {}

    results: dict[str, TrackResponse] = {}
    for tracking_id, raw_result in payload.items():
        if not isinstance(tracking_id, str) or not isinstance(raw_result, dict):
            continue
        try:
            result = TrackResponse.model_validate(raw_result)
        except Exception:
            continue
        results[result.tracking_id] = result
    return results


def persist_tracking_store(path: Path, store: dict[str, TrackResponse]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    serializable = {
        tracking_id: result.model_dump(mode="json")
        for tracking_id, result in store.items()
    }
    tmp_path.write_text(
        json.dumps(serializable, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(tmp_path, path)


def save_tracking_result(result: TrackResponse) -> None:
    with _STORE_LOCK:
        path = get_track_store_path()
        effective_backend, _ = _resolve_effective_backend()
        if path is not None:
            _TRACKING_STORE.update(load_persisted_tracking_store(path))
        _TRACKING_STORE[result.tracking_id] = result
        if path is not None:
            persist_tracking_store(path, _TRACKING_STORE)
        if effective_backend == "postgres":
            try:
                save_tracking_result_postgres(result)
            except Exception:
                # Keep local fallback intact even when the external DB blips.
                pass


def get_tracking_result(tracking_id: str) -> TrackResponse | None:
    with _STORE_LOCK:
        path = get_track_store_path()
        effective_backend, _ = _resolve_effective_backend()
        if effective_backend == "postgres":
            try:
                result = get_tracking_result_postgres(tracking_id)
                if result is not None:
                    _TRACKING_STORE[tracking_id] = result
                return result
            except Exception:
                pass
        if tracking_id not in _TRACKING_STORE and path is not None:
            _TRACKING_STORE.update(load_persisted_tracking_store(path))
        return _TRACKING_STORE.get(tracking_id)


def get_tracking_store_status() -> dict[str, object]:
    with _STORE_LOCK:
        path = get_track_store_path()
        effective_backend, postgres_probe = _resolve_effective_backend()
        settings = get_settings()
        requested_backend = _normalize_backend(settings.track_store_backend)
        persisted_count = 0
        persistence_error = None
        if path is not None:
            try:
                persisted_count = len(load_persisted_tracking_store(path))
            except Exception as error:
                persistence_error = str(error)

        postgres_ready = bool(postgres_probe and postgres_probe.get("ready"))
        postgres_error = None if postgres_ready else (postgres_probe or {}).get("error")
        postgres_count = int((postgres_probe or {}).get("active_report_count") or 0)
        durable = effective_backend == "postgres" or (effective_backend == "json_file" and path is not None and persistence_error is None)

        return {
            "backend": effective_backend,
            "requested_backend": requested_backend,
            "configured": bool(
                path is not None
                or settings.track_store_dsn.strip()
                or requested_backend != "auto"
            ),
            "dsn_configured": bool(settings.track_store_dsn.strip()),
            "table": settings.track_store_table.strip() or None,
            "path": str(path) if path is not None else None,
            "memory_results": len(_TRACKING_STORE),
            "persisted_results": postgres_count if effective_backend == "postgres" and postgres_ready else persisted_count,
            "durable": durable,
            "external_db": effective_backend == "postgres" and postgres_ready,
            "error": postgres_error or persistence_error,
        }
