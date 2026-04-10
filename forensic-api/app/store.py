from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock

from .models import TrackResponse
from .settings import get_settings

_TRACKING_STORE: dict[str, TrackResponse] = {}
_STORE_LOCK = Lock()


def get_track_store_path() -> Path | None:
    raw_path = get_settings().track_store_path.strip()
    if not raw_path:
        return None
    return Path(raw_path).expanduser()


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
        if path is not None:
            _TRACKING_STORE.update(load_persisted_tracking_store(path))
        _TRACKING_STORE[result.tracking_id] = result
        if path is not None:
            persist_tracking_store(path, _TRACKING_STORE)


def get_tracking_result(tracking_id: str) -> TrackResponse | None:
    with _STORE_LOCK:
        path = get_track_store_path()
        if tracking_id not in _TRACKING_STORE and path is not None:
            _TRACKING_STORE.update(load_persisted_tracking_store(path))
        return _TRACKING_STORE.get(tracking_id)
