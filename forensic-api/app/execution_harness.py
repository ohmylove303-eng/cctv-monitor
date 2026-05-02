from __future__ import annotations

from typing import Any

EXECUTION_HARNESS: dict[str, Any] = {
    "taxonomy": "execution_harness_v1",
    "status": "active",
    "current_stage": "implementation",
    "current_stage_model": "GPT-5.4 mini",
    "current_goal": "existing-layer overlay with minimal token use",
    "phases": [
        {"stage": "design", "model": "GPT-5.5"},
        {"stage": "implementation", "model": "GPT-5.4 mini"},
        {"stage": "verification", "model": "GPT-5.4 mini"},
        {"stage": "backtest", "model": "GPT-5.4 nano"},
        {"stage": "final_approval", "model": "GPT-5.5"},
    ],
}


def get_execution_harness_status() -> dict[str, Any]:
    return dict(EXECUTION_HARNESS)
