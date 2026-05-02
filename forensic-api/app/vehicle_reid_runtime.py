from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from typing import Any

import numpy as np

from .settings import get_settings
from .vehicle_reid_readiness import get_vehicle_reid_readiness_path, get_vehicle_reid_readiness_status

BASELINE_EMBEDDING_DIMENSION = 344
SUPPORTED_BACKENDS = {"baseline"}


def _normalize_backend(value: str) -> str:
    backend = value.strip().lower() or "baseline"
    return backend


def get_vehicle_reid_runtime_backend() -> str:
    return _normalize_backend(get_settings().vehicle_reid_runtime_backend)


def get_vehicle_reid_runtime_model_path() -> Path | None:
    raw_path = get_settings().vehicle_reid_runtime_model_path.strip()
    if not raw_path:
        return None
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[2] / path


def get_vehicle_reid_gallery_path() -> Path:
    raw_path = get_settings().vehicle_reid_gallery_path.strip()
    path = Path(raw_path or "data/vehicle-reid-gallery.json")
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[2] / path


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _coerce_image(image: Any) -> np.ndarray | None:
    try:
        arr = np.asarray(image)
    except Exception:
        return None
    if arr.ndim not in {2, 3} or arr.size == 0:
        return None
    arr = arr.astype(np.float32)
    if float(np.nanmax(arr)) <= 1.5:
        arr = arr * 255.0
    return np.clip(arr, 0.0, 255.0)


def _resize_nearest(image: np.ndarray, target_height: int, target_width: int) -> np.ndarray:
    height, width = image.shape[:2]
    if height <= 0 or width <= 0:
        if image.ndim == 2:
            return np.zeros((target_height, target_width), dtype=np.float32)
        return np.zeros((target_height, target_width, image.shape[2]), dtype=np.float32)
    y_indices = np.linspace(0, height - 1, target_height).round().astype(int)
    x_indices = np.linspace(0, width - 1, target_width).round().astype(int)
    if image.ndim == 2:
        return image[y_indices][:, x_indices]
    return image[y_indices][:, x_indices, :]


def _to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image.astype(np.float32)
    channels = image[:, :, :3]
    if channels.shape[2] == 1:
        return channels[:, :, 0].astype(np.float32)
    blue = channels[:, :, 0].astype(np.float32)
    green = channels[:, :, 1].astype(np.float32)
    red = channels[:, :, 2].astype(np.float32)
    return 0.114 * blue + 0.587 * green + 0.299 * red


def _normalize_vector(vector: np.ndarray) -> np.ndarray:
    vector = vector.astype(np.float32).reshape(-1)
    norm = float(np.linalg.norm(vector))
    if norm <= 1e-12:
        return vector
    return vector / norm


def _histogram(values: np.ndarray, bins: int, value_range: tuple[float, float]) -> np.ndarray:
    hist, _ = np.histogram(values.reshape(-1), bins=bins, range=value_range)
    hist = hist.astype(np.float32)
    total = float(hist.sum())
    if total > 0:
        hist /= total
    return hist


def _baseline_embedding(image: Any) -> np.ndarray | None:
    arr = _coerce_image(image)
    if arr is None:
        return None

    if arr.ndim == 2:
        arr = np.repeat(arr[:, :, None], 3, axis=2)
    elif arr.shape[2] == 1:
        arr = np.repeat(arr, 3, axis=2)
    elif arr.shape[2] > 3:
        arr = arr[:, :, :3]

    resized = _resize_nearest(arr, 64, 64).astype(np.float32)
    gray = _to_gray(resized)

    features: list[np.ndarray] = []

    for channel_index in range(3):
        features.append(_histogram(resized[:, :, channel_index], bins=16, value_range=(0.0, 255.0)))

    features.append(_histogram(gray, bins=16, value_range=(0.0, 255.0)))

    small_gray = _resize_nearest(gray, 16, 16).reshape(-1).astype(np.float32) / 255.0
    features.append(small_gray)

    grad_x = np.diff(gray, axis=1, append=gray[:, -1:])
    grad_y = np.diff(gray, axis=0, append=gray[-1:, :])
    magnitude = np.sqrt(grad_x * grad_x + grad_y * grad_y)
    mag_max = float(np.max(magnitude))
    features.append(_histogram(magnitude, bins=16, value_range=(0.0, mag_max if mag_max > 0 else 1.0)))

    half_h = max(1, gray.shape[0] // 2)
    half_w = max(1, gray.shape[1] // 2)
    quadrants = [
        gray[:half_h, :half_w],
        gray[:half_h, half_w:],
        gray[half_h:, :half_w],
        gray[half_h:, half_w:],
    ]
    quad_stats: list[float] = []
    for quadrant in quadrants:
        if quadrant.size == 0:
            quad_stats.extend([0.0, 0.0])
            continue
        quad_stats.append(float(quadrant.mean()) / 255.0)
        quad_stats.append(float(quadrant.std()) / 255.0)
    features.append(np.asarray(quad_stats, dtype=np.float32))

    embedding = np.concatenate(features, axis=0)
    if embedding.shape[0] != BASELINE_EMBEDDING_DIMENSION:
        raise ValueError(f"unexpected baseline embedding dimension: {embedding.shape[0]}")
    return _normalize_vector(embedding)


def _load_gallery_payload() -> dict[str, object]:
    path = get_vehicle_reid_gallery_path()
    if not path.exists():
        return {
            "schemaVersion": 1,
            "taxonomy": "vehicle_reid_gallery_v1",
            "updatedAt": None,
            "entries": [],
        }

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {
            "schemaVersion": 1,
            "taxonomy": "vehicle_reid_gallery_v1",
            "updatedAt": None,
            "entries": [],
        }

    if not isinstance(payload, dict):
        return {
            "schemaVersion": 1,
            "taxonomy": "vehicle_reid_gallery_v1",
            "updatedAt": None,
            "entries": [],
        }

    entries = payload.get("entries")
    normalized_entries: list[dict[str, object]] = []
    if isinstance(entries, list):
        for raw_entry in entries:
            if not isinstance(raw_entry, dict):
                continue
            embedding = raw_entry.get("embedding")
            if not isinstance(embedding, list) or not embedding:
                continue
            try:
                embedding_vector = _normalize_vector(np.asarray(embedding, dtype=np.float32))
            except Exception:
                continue
            if embedding_vector.shape[0] != BASELINE_EMBEDDING_DIMENSION:
                continue
            normalized_entry = dict(raw_entry)
            normalized_entry["embedding"] = embedding_vector.astype(float).tolist()
            normalized_entries.append(normalized_entry)

    return {
        "schemaVersion": int(payload.get("schemaVersion") or 1),
        "taxonomy": str(payload.get("taxonomy") or "vehicle_reid_gallery_v1"),
        "updatedAt": payload.get("updatedAt"),
        "entries": normalized_entries,
    }


def _save_gallery_payload(payload: dict[str, object]) -> None:
    path = get_vehicle_reid_gallery_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def load_vehicle_reid_gallery() -> dict[str, object]:
    return _load_gallery_payload()


def count_vehicle_reid_gallery_entries() -> int:
    gallery = _load_gallery_payload()
    entries = gallery.get("entries")
    return len(entries) if isinstance(entries, list) else 0


def search_vehicle_reid_gallery(embedding: np.ndarray, limit: int = 5) -> list[dict[str, object]]:
    gallery = _load_gallery_payload()
    entries = gallery.get("entries")
    if not isinstance(entries, list) or not entries:
        return []

    query = _normalize_vector(np.asarray(embedding, dtype=np.float32))
    matches: list[dict[str, object]] = []

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        entry_embedding = entry.get("embedding")
        if not isinstance(entry_embedding, list):
            continue
        candidate = _normalize_vector(np.asarray(entry_embedding, dtype=np.float32))
        if candidate.shape[0] != query.shape[0]:
            continue
        similarity = float(np.clip(np.dot(query, candidate), -1.0, 1.0))
        matches.append({
            "id": entry.get("id"),
            "observation_id": entry.get("observation_id"),
            "job_id": entry.get("job_id"),
            "cctv_id": entry.get("cctv_id"),
            "timestamp": entry.get("timestamp"),
            "vehicle_type_hint": entry.get("vehicle_type_hint"),
            "similarity": similarity,
        })

    matches.sort(key=lambda item: float(item.get("similarity") or 0.0), reverse=True)
    return matches[: max(1, limit)]


def append_vehicle_reid_gallery_entry(
    embedding: np.ndarray,
    metadata: dict[str, object] | None = None,
) -> dict[str, object]:
    metadata = metadata or {}
    gallery = _load_gallery_payload()
    entries = list(gallery.get("entries") if isinstance(gallery.get("entries"), list) else [])

    observation_id = str(metadata.get("observation_id") or metadata.get("job_id") or metadata.get("id") or f"reid-{uuid4().hex[:12]}")
    embedding_vector = _normalize_vector(np.asarray(embedding, dtype=np.float32))
    entry = {
        "id": str(metadata.get("id") or f"reid-{uuid4().hex[:12]}"),
        "observation_id": observation_id,
        "job_id": metadata.get("job_id"),
        "cctv_id": metadata.get("cctv_id"),
        "timestamp": metadata.get("timestamp") or _now_iso(),
        "vehicle_type_hint": metadata.get("vehicle_type_hint"),
        "vehicle_labels": metadata.get("vehicle_labels") or [],
        "match_status": metadata.get("match_status"),
        "embedding_backend": metadata.get("embedding_backend") or get_vehicle_reid_runtime_backend(),
        "embedding_dimension": int(embedding_vector.shape[0]),
        "source_crop_count": int(metadata.get("source_crop_count") or 0),
        "source_frame_count": int(metadata.get("source_frame_count") or 0),
        "embedding": embedding_vector.astype(float).tolist(),
    }

    entries = [existing for existing in entries if not (isinstance(existing, dict) and existing.get("observation_id") == observation_id)]
    entries.append(entry)

    gallery_limit = max(1, int(get_settings().vehicle_reid_gallery_limit or 2000))
    if len(entries) > gallery_limit:
        entries = entries[-gallery_limit:]

    gallery["entries"] = entries
    gallery["updatedAt"] = _now_iso()
    _save_gallery_payload(gallery)
    return entry


def _normalize_crops(crops: list[tuple[np.ndarray, float]] | list[np.ndarray] | None) -> list[tuple[np.ndarray, float]]:
    if not crops:
        return []

    normalized: list[tuple[np.ndarray, float]] = []
    for crop_input in crops:
        if isinstance(crop_input, tuple):
            crop, weight = crop_input[0], crop_input[1] if len(crop_input) > 1 else 1.0
        else:
            crop, weight = crop_input, 1.0

        image = _coerce_image(crop)
        if image is None:
            continue

        try:
            numeric_weight = float(weight)
        except Exception:
            numeric_weight = 1.0
        if not np.isfinite(numeric_weight) or numeric_weight <= 0:
            numeric_weight = 1.0
        normalized.append((image, numeric_weight))

    return normalized


def build_vehicle_reid_embedding(crops: list[tuple[np.ndarray, float]] | list[np.ndarray] | None) -> dict[str, object]:
    normalized_crops = _normalize_crops(crops)
    if not normalized_crops:
        return {
            "status": "no_crop",
            "embedding": None,
            "embedding_backend": get_vehicle_reid_runtime_backend(),
            "embedding_dimension": BASELINE_EMBEDDING_DIMENSION,
            "source_crop_count": 0,
        }

    crop_embeddings: list[np.ndarray] = []
    weights: list[float] = []
    for image, weight in normalized_crops:
        embedding = _baseline_embedding(image)
        if embedding is None:
            continue
        crop_embeddings.append(embedding)
        weights.append(weight)

    if not crop_embeddings:
        return {
            "status": "no_embedding",
            "embedding": None,
            "embedding_backend": get_vehicle_reid_runtime_backend(),
            "embedding_dimension": BASELINE_EMBEDDING_DIMENSION,
            "source_crop_count": len(normalized_crops),
        }

    stacked = np.stack(crop_embeddings, axis=0)
    weights_array = np.asarray(weights, dtype=np.float32)
    if weights_array.shape[0] != stacked.shape[0]:
        weights_array = np.ones(stacked.shape[0], dtype=np.float32)
    weights_array = weights_array / max(float(weights_array.sum()), 1e-12)
    embedding = np.average(stacked, axis=0, weights=weights_array)
    embedding = _normalize_vector(np.asarray(embedding, dtype=np.float32))

    return {
        "status": "ready",
        "embedding": embedding,
        "embedding_backend": get_vehicle_reid_runtime_backend(),
        "embedding_dimension": int(embedding.shape[0]),
        "source_crop_count": len(normalized_crops),
    }


def get_vehicle_reid_runtime_status() -> dict[str, object]:
    settings = get_settings()
    enabled = bool(settings.vehicle_reid_runtime_enabled)
    backend = get_vehicle_reid_runtime_backend()
    model_path = get_vehicle_reid_runtime_model_path()
    requested_embedding_dimension = int(settings.vehicle_reid_runtime_embedding_dimension or 0)
    readiness = get_vehicle_reid_readiness_status()
    readiness_status = str(readiness.get("status") or "missing")
    readiness_active_models = int(readiness.get("active_models") or 0)
    readiness_ready = bool(readiness.get("same_vehicle_reid_ready"))
    gallery_path = get_vehicle_reid_gallery_path()
    gallery_entries = count_vehicle_reid_gallery_entries()
    match_threshold = float(settings.vehicle_reid_match_threshold or 0.86)
    embedding_dimension = requested_embedding_dimension if requested_embedding_dimension > 0 else BASELINE_EMBEDDING_DIMENSION

    if not enabled:
        return {
            "taxonomy": "vehicle_reid_runtime_v1",
            "backend": backend,
            "status": "disabled",
            "enabled": False,
            "configured": False,
            "model_path": str(model_path) if model_path is not None else None,
            "embedding_dimension": embedding_dimension,
            "gallery_path": str(gallery_path),
            "gallery_entries": gallery_entries,
            "match_threshold": match_threshold,
            "readiness_status": readiness_status,
            "readiness_active_models": readiness_active_models,
            "runtime_integrated": False,
            "validation_note": "VEHICLE_REID_RUNTIME_ENABLED is false",
        }

    if not readiness_ready:
        return {
            "taxonomy": "vehicle_reid_runtime_v1",
            "backend": backend,
            "status": "readiness_not_active",
            "enabled": True,
            "configured": False,
            "model_path": str(model_path) if model_path is not None else None,
            "embedding_dimension": embedding_dimension,
            "gallery_path": str(gallery_path),
            "gallery_entries": gallery_entries,
            "match_threshold": match_threshold,
            "readiness_status": readiness_status,
            "readiness_active_models": readiness_active_models,
            "runtime_integrated": False,
            "validation_note": "same-vehicle ReID readiness is not active",
        }

    if backend not in SUPPORTED_BACKENDS:
        return {
            "taxonomy": "vehicle_reid_runtime_v1",
            "backend": backend,
            "status": "model_not_configured",
            "enabled": True,
            "configured": False,
            "model_path": str(model_path) if model_path is not None else None,
            "embedding_dimension": embedding_dimension,
            "gallery_path": str(gallery_path),
            "gallery_entries": gallery_entries,
            "match_threshold": match_threshold,
            "readiness_status": readiness_status,
            "readiness_active_models": readiness_active_models,
            "runtime_integrated": False,
            "validation_note": f"unsupported runtime backend: {backend}",
        }

    if requested_embedding_dimension > 0 and requested_embedding_dimension != BASELINE_EMBEDDING_DIMENSION:
        return {
            "taxonomy": "vehicle_reid_runtime_v1",
            "backend": backend,
            "status": "model_dimension_mismatch",
            "enabled": True,
            "configured": False,
            "model_path": str(model_path) if model_path is not None else None,
            "embedding_dimension": embedding_dimension,
            "gallery_path": str(gallery_path),
            "gallery_entries": gallery_entries,
            "match_threshold": match_threshold,
            "readiness_status": readiness_status,
            "readiness_active_models": readiness_active_models,
            "runtime_integrated": False,
            "validation_note": f"requested embedding dimension {requested_embedding_dimension} does not match baseline runtime dimension {BASELINE_EMBEDDING_DIMENSION}",
        }

    return {
        "taxonomy": "vehicle_reid_runtime_v1",
        "backend": backend,
        "status": "runtime_ready",
        "enabled": True,
        "configured": True,
        "model_path": str(model_path) if model_path is not None else None,
        "embedding_dimension": embedding_dimension,
        "gallery_path": str(gallery_path),
        "gallery_entries": gallery_entries,
        "match_threshold": match_threshold,
        "readiness_status": readiness_status,
        "readiness_active_models": readiness_active_models,
        "runtime_integrated": True,
        "validation_note": f"baseline embedding runtime ready; gallery entries={gallery_entries}",
    }


def match_vehicle_reid_observations(
    crops: list[tuple[np.ndarray, float]] | list[np.ndarray] | None,
    metadata: dict[str, object] | None = None,
) -> dict[str, object]:
    metadata = metadata or {}
    runtime_status = get_vehicle_reid_runtime_status()
    runtime_ready = runtime_status.get("status") == "runtime_ready"
    match_threshold = float(runtime_status.get("match_threshold") or get_settings().vehicle_reid_match_threshold or 0.86)

    if not runtime_ready:
        return {
            "status": runtime_status.get("status"),
            "match_status": "disabled",
            "match_score": None,
            "match_threshold": match_threshold,
            "gallery_entries_before": runtime_status.get("gallery_entries") or 0,
            "gallery_entries_after": runtime_status.get("gallery_entries") or 0,
            "embedding_backend": runtime_status.get("backend"),
            "embedding_dimension": runtime_status.get("embedding_dimension"),
            "stored_entry_id": None,
            "best_match_id": None,
            "best_match_cctv_id": None,
            "best_match_observation_id": None,
            "best_match_timestamp": None,
            "search_results": [],
            "validation_note": runtime_status.get("validation_note"),
        }

    embedding_result = build_vehicle_reid_embedding(crops)
    if embedding_result.get("status") != "ready" or embedding_result.get("embedding") is None:
        return {
            "status": "no_crop",
            "match_status": str(embedding_result.get("status") or "no_crop"),
            "match_score": None,
            "match_threshold": match_threshold,
            "gallery_entries_before": runtime_status.get("gallery_entries") or 0,
            "gallery_entries_after": runtime_status.get("gallery_entries") or 0,
            "embedding_backend": embedding_result.get("embedding_backend") or runtime_status.get("backend"),
            "embedding_dimension": embedding_result.get("embedding_dimension") or runtime_status.get("embedding_dimension"),
            "stored_entry_id": None,
            "best_match_id": None,
            "best_match_cctv_id": None,
            "best_match_observation_id": None,
            "best_match_timestamp": None,
            "search_results": [],
            "validation_note": "no usable vehicle crops for ReID",
        }

    embedding = np.asarray(embedding_result["embedding"], dtype=np.float32)
    gallery_before = count_vehicle_reid_gallery_entries()
    search_results = search_vehicle_reid_gallery(embedding, limit=5)
    best_match = search_results[0] if search_results else None
    best_score = float(best_match.get("similarity") or 0.0) if best_match else None
    match_status = "matched" if best_match and best_score is not None and best_score >= match_threshold else "unmatched"

    stored_entry = append_vehicle_reid_gallery_entry(
        embedding,
        metadata={
            "id": metadata.get("id") or metadata.get("observation_id"),
            "observation_id": metadata.get("observation_id") or metadata.get("job_id") or f"reid-{uuid4().hex[:12]}",
            "job_id": metadata.get("job_id"),
            "cctv_id": metadata.get("cctv_id"),
            "timestamp": metadata.get("timestamp") or _now_iso(),
            "vehicle_type_hint": metadata.get("vehicle_type_hint"),
            "vehicle_labels": metadata.get("vehicle_labels") or [],
            "match_status": match_status,
            "embedding_backend": embedding_result.get("embedding_backend") or runtime_status.get("backend"),
            "source_crop_count": int(embedding_result.get("source_crop_count") or 0),
            "source_frame_count": int(metadata.get("source_frame_count") or 0),
        },
    )
    gallery_after = count_vehicle_reid_gallery_entries()

    return {
        "status": runtime_status.get("status"),
        "match_status": match_status,
        "match_score": best_score,
        "match_threshold": match_threshold,
        "gallery_entries_before": gallery_before,
        "gallery_entries_after": gallery_after,
        "embedding_backend": embedding_result.get("embedding_backend") or runtime_status.get("backend"),
        "embedding_dimension": embedding_result.get("embedding_dimension") or runtime_status.get("embedding_dimension"),
        "stored_entry_id": stored_entry.get("id"),
        "best_match_id": best_match.get("id") if best_match else None,
        "best_match_cctv_id": best_match.get("cctv_id") if best_match else None,
        "best_match_observation_id": best_match.get("observation_id") if best_match else None,
        "best_match_timestamp": best_match.get("timestamp") if best_match else None,
        "search_results": search_results[:3],
        "validation_note": (
            f"best match score {best_score:.3f} >= threshold {match_threshold:.3f}"
            if match_status == "matched" and best_score is not None
            else f"best match score below threshold {match_threshold:.3f}"
        ),
    }
