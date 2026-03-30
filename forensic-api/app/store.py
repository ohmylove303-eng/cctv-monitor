from __future__ import annotations

from threading import Lock

from .models import TrackResponse

_TRACKING_STORE: dict[str, TrackResponse] = {}
_STORE_LOCK = Lock()


def save_tracking_result(result: TrackResponse) -> None:
    with _STORE_LOCK:
        _TRACKING_STORE[result.tracking_id] = result


def get_tracking_result(tracking_id: str) -> TrackResponse | None:
    with _STORE_LOCK:
        return _TRACKING_STORE.get(tracking_id)
