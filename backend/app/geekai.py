"""Thin async client for the GeekAI image API (gpt-image-2)."""

from typing import Any, Dict

import httpx

from . import config


class GeekaiError(Exception):
    pass


def _headers() -> Dict[str, str]:
    if not config.GEEKAI_API_KEY:
        raise GeekaiError(
            "GEEKAI_API_KEY is not configured on the server. Set it as an environment variable."
        )
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.GEEKAI_API_KEY}",
    }


async def submit_edit(prompt: str, image: str, quality: str = "medium") -> str:
    """Submit an async image-edit task. Returns the task id."""
    payload: Dict[str, Any] = {
        "model": config.GEEKAI_IMAGE_MODEL,
        "prompt": prompt,
        "image": image,
        "quality": quality,
        "response_format": "url",
        "async": True,
    }
    async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
        resp = await client.post(
            f"{config.GEEKAI_BASE_URL}/images/edits",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
    task_id = data.get("task_id")
    if not task_id:
        raise GeekaiError(f"No task id returned: {data}")
    return task_id


async def get_result(task_id: str) -> Dict[str, Any]:
    """Poll a task and normalize to {status, progress, results, failure_reason, error}."""
    async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
        resp = await client.get(
            f"{config.GEEKAI_BASE_URL}/images/{task_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        data = resp.json()

    status = data.get("task_status") or data.get("status") or "unknown"
    urls = []
    for item in data.get("data") or []:
        if isinstance(item, dict) and item.get("url"):
            urls.append({"url": item["url"]})
    ok_statuses = ("succeed", "succeeded", "success", "completed")
    if status in ok_statuses and urls:
        norm = "succeeded"
    elif status in ("failed", "error", "canceled"):
        norm = "failed"
    elif status in ok_statuses:
        # Completed but no url returned — treat as failure so the client retries.
        norm = "failed"
    else:
        norm = "running"
    return {
        "status": norm,
        "progress": 100 if norm == "succeeded" else data.get("progress", 0),
        "results": urls,
        "failure_reason": data.get("failure_reason", ""),
        "error": data.get("error") or data.get("message") or "",
    }
