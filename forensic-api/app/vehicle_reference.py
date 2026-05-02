from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from .settings import get_settings


VehicleReferenceStatus = Literal["missing", "empty", "loaded"]


def get_vehicle_reference_catalog_path() -> Path:
    raw_path = get_settings().vehicle_reference_catalog_path.strip()
    path = Path(raw_path or "data/vehicle-reference-catalog.json")
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[2] / path


def get_vehicle_reference_status() -> dict[str, object]:
    path = get_vehicle_reference_catalog_path()
    if not path.exists():
        return {"status": "missing", "path": str(path), "entries": 0}

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        entries = payload.get("entries") if isinstance(payload, dict) else None
        entry_count = len(entries) if isinstance(entries, list) else 0
        return {
            "status": "loaded" if entry_count > 0 else "empty",
            "path": str(path),
            "entries": entry_count,
        }
    except Exception as error:
        return {"status": "missing", "path": str(path), "entries": 0, "error": str(error)}
