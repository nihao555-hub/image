"""Thin async client for the grsai (gpt-image-2 / gemini) API."""

from typing import Any, Dict, List, Optional

import httpx

from . import config


class GrsaiError(Exception):
    pass


def _headers() -> Dict[str, str]:
    if not config.GRSAI_API_KEY:
        raise GrsaiError(
            "GRSAI_API_KEY is not configured on the server. Set it as an environment variable."
        )
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config.GRSAI_API_KEY}",
    }


async def chat_completion(messages: List[Dict[str, Any]], model: Optional[str] = None) -> str:
    """Non-streaming chat completion. Returns the assistant message content."""
    payload = {
        "model": model or config.LLM_MODEL,
        "stream": False,
        "messages": messages,
    }
    async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
        resp = await client.post(
            f"{config.GRSAI_BASE_URL}/v1/chat/completions",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as exc:  # pragma: no cover - defensive
        raise GrsaiError(f"Unexpected chat response: {data}") from exc


async def submit_draw(
    prompt: str,
    aspect_ratio: str = "1024x1024",
    quality: str = "auto",
    urls: Optional[List[str]] = None,
    model: Optional[str] = None,
) -> str:
    """Submit an image generation task in polling mode. Returns the task id."""
    payload: Dict[str, Any] = {
        "model": model or config.IMAGE_MODEL,
        "prompt": prompt,
        "aspectRatio": aspect_ratio,
        "quality": quality,
        # webHook "-1" => return an id immediately, poll for the result.
        "webHook": "-1",
        "shutProgress": True,
    }
    if urls:
        payload["urls"] = urls

    async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
        resp = await client.post(
            f"{config.GRSAI_BASE_URL}/v1/draw/completions",
            headers=_headers(),
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
    if data.get("code") != 0:
        raise GrsaiError(f"Draw submit failed: {data}")
    task_id = data.get("data", {}).get("id")
    if not task_id:
        raise GrsaiError(f"No task id returned: {data}")
    return task_id


async def get_result(task_id: str) -> Dict[str, Any]:
    """Poll the result of an image generation task."""
    async with httpx.AsyncClient(timeout=config.REQUEST_TIMEOUT) as client:
        resp = await client.post(
            f"{config.GRSAI_BASE_URL}/v1/draw/result",
            headers=_headers(),
            json={"id": task_id},
        )
        resp.raise_for_status()
        return resp.json()
