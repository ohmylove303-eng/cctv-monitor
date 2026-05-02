from __future__ import annotations

import json
import re
from typing import Any

from .models import TrackResponse
from .settings import get_settings

try:  # Optional dependency for fallback-safe deployments.
    import psycopg
except Exception:  # pragma: no cover - import availability is environment-specific.
    psycopg = None  # type: ignore[assignment]

TRACKING_TABLE_DEFAULT = "tracking_results"
IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _normalize_backend(value: str) -> str:
    backend = value.strip().lower() or "auto"
    if backend in {"auto", "memory", "json_file", "postgres"}:
        return backend
    return "auto"


def _get_dsn() -> str:
    return get_settings().track_store_dsn.strip()


def _get_table_name() -> str:
    table = get_settings().track_store_table.strip() or TRACKING_TABLE_DEFAULT
    if not IDENTIFIER_RE.match(table):
        raise ValueError(f"invalid TRACK_STORE_TABLE value: {table}")
    return table


def _quote_identifier(value: str) -> str:
    return f'"{value}"'


def _serialize_result(result: TrackResponse) -> str:
    return json.dumps(result.model_dump(mode="json"), ensure_ascii=False)


def _deserialize_result(payload: Any) -> TrackResponse | None:
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            return None
    if not isinstance(payload, dict):
        return None
    try:
        return TrackResponse.model_validate(payload)
    except Exception:
        return None


def _connect():
    if psycopg is None:
        raise RuntimeError("psycopg_not_installed")
    dsn = _get_dsn()
    if not dsn:
        raise RuntimeError("track_store_dsn_missing")
    return psycopg.connect(dsn, autocommit=True)


def _ensure_table(conn) -> str:
    table = _get_table_name()
    quoted = _quote_identifier(table)
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {quoted} (
            tracking_id text PRIMARY KEY,
            status text NOT NULL,
            searched_cameras integer NOT NULL,
            origin_timestamp timestamptz NULL,
            payload jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )
    return quoted


def _select_row(conn, tracking_id: str):
    quoted = _ensure_table(conn)
    with conn.cursor() as cursor:
        cursor.execute(f"SELECT payload FROM {quoted} WHERE tracking_id = %s", (tracking_id,))
        return cursor.fetchone()


def probe_postgres_tracking_store() -> dict[str, Any]:
    settings = get_settings()
    requested_backend = _normalize_backend(settings.track_store_backend)
    dsn = _get_dsn()
    table = settings.track_store_table.strip() or TRACKING_TABLE_DEFAULT
    dsn_configured = bool(dsn)
    configured = requested_backend == "postgres" or requested_backend == "auto" and dsn_configured

    if requested_backend not in {"auto", "postgres"}:
        return {
            "requested_backend": requested_backend,
            "backend": None,
            "configured": configured,
            "dsn_configured": dsn_configured,
            "table": table,
            "ready": False,
            "status": "disabled",
            "active_report_count": 0,
            "runtime_integrated": False,
            "error": None,
        }

    if not dsn_configured:
        if requested_backend == "auto":
            return {
                "requested_backend": requested_backend,
                "backend": None,
                "configured": configured,
                "dsn_configured": dsn_configured,
                "table": table,
                "ready": False,
                "status": "disabled",
                "active_report_count": 0,
                "runtime_integrated": False,
                "error": None,
            }
        return {
            "requested_backend": requested_backend,
            "backend": None,
            "configured": configured,
            "dsn_configured": dsn_configured,
            "table": table,
            "ready": False,
            "status": "missing",
            "active_report_count": 0,
            "runtime_integrated": False,
            "error": "TRACK_STORE_DSN is missing",
        }

    try:
        with _connect() as conn:
            quoted = _ensure_table(conn)
            with conn.cursor() as cursor:
                cursor.execute(f"SELECT count(*) FROM {quoted}")
                row = cursor.fetchone()
                count = int(row[0]) if row else 0

        return {
            "requested_backend": requested_backend,
            "backend": "postgres",
            "configured": True,
            "dsn_configured": True,
            "table": table,
            "ready": True,
            "status": "active_report_ready",
            "active_report_count": count,
            "runtime_integrated": True,
            "error": None,
        }
    except Exception as error:
        return {
            "requested_backend": requested_backend,
            "backend": None,
            "configured": True,
            "dsn_configured": True,
            "table": table,
            "ready": False,
            "status": "unavailable",
            "active_report_count": 0,
            "runtime_integrated": False,
            "error": str(error),
        }


def save_tracking_result_postgres(result: TrackResponse) -> None:
    with _connect() as conn:
        quoted = _ensure_table(conn)
        payload = _serialize_result(result)
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                INSERT INTO {quoted} (
                    tracking_id,
                    status,
                    searched_cameras,
                    origin_timestamp,
                    payload,
                    created_at,
                    updated_at
                ) VALUES (%s, %s, %s, %s, %s::jsonb, now(), now())
                ON CONFLICT (tracking_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    searched_cameras = EXCLUDED.searched_cameras,
                    origin_timestamp = EXCLUDED.origin_timestamp,
                    payload = EXCLUDED.payload,
                    updated_at = now()
                """,
                (
                    result.tracking_id,
                    result.status,
                    result.searched_cameras,
                    result.origin_timestamp,
                    payload,
                ),
            )


def get_tracking_result_postgres(tracking_id: str) -> TrackResponse | None:
    with _connect() as conn:
        row = _select_row(conn, tracking_id)
        if not row:
            return None
        return _deserialize_result(row[0])
