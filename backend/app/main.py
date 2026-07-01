import asyncio
import json
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config, grsai
from .templates import CATEGORIES, TEMPLATES, TEMPLATE_BY_ID
from .platforms import (
    DENSITY_INSTRUCTIONS,
    LANGUAGE_NAMES,
    PLATFORMS,
    PLATFORM_BY_ID,
)

app = FastAPI(title="AI E-commerce Image Set Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class ProductInfo(BaseModel):
    name: str = ""
    category: str = ""
    style: str = ""
    background: str = ""
    extra: str = ""


class GeneratePromptsRequest(BaseModel):
    product: ProductInfo
    template_ids: List[str]
    has_image: bool = False
    platform: str = ""
    language: str = ""
    density: str = ""


class GeneratePromptsResponse(BaseModel):
    prompts: Dict[str, str]


class GenerateJob(BaseModel):
    template_id: str
    prompt: str
    aspectRatio: str = "1024x1024"
    quality: str = "auto"
    image_base64: Optional[str] = None
    label: str = ""


class GenerateRequest(BaseModel):
    jobs: List[GenerateJob]


class TaskInfo(BaseModel):
    task_id: str
    template_id: str
    label: str


class GenerateResponse(BaseModel):
    tasks: List[TaskInfo]


class ResultRequest(BaseModel):
    ids: List[str]


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "configured": bool(config.GRSAI_API_KEY)}


@app.get("/api/templates")
async def list_templates() -> Dict[str, Any]:
    return {"templates": TEMPLATES, "categories": CATEGORIES}


@app.get("/api/platforms")
async def list_platforms() -> Dict[str, Any]:
    return {"platforms": PLATFORMS}


# How much on-image text to ask for, combining the template's own textLevel with
# the platform's overall density preference.
_AMOUNT = {
    ("light", "clean"): "one very short",
    ("light", "balanced"): "one short",
    ("light", "rich"): "a couple of short",
    ("rich", "clean"): "a few concise",
    ("rich", "balanced"): "several well-organised",
    ("rich", "rich"): "generous, densely-organised",
}


def _text_amount(level: str, density: str) -> str:
    return _AMOUNT.get((level, density), "concise")


def _fallback_prompt(
    product: ProductInfo,
    template_id: str,
    language: str = "",
    density: str = "balanced",
) -> str:
    tpl = TEMPLATE_BY_ID.get(template_id)
    guidance = tpl["guidance"] if tpl else ""
    parts = []
    if product.name:
        parts.append(product.name)
    if product.category:
        parts.append(f"({product.category})")
    subject = " ".join(parts) or "the product"
    extra = []
    if product.style:
        extra.append(f"style: {product.style}")
    if product.background:
        extra.append(f"background: {product.background}")
    if product.extra:
        extra.append(product.extra)
    extra_str = (". " + ", ".join(extra)) if extra else ""
    text_str = ""
    level = tpl.get("textLevel", "none") if tpl else "none"
    if level != "none":
        lang = LANGUAGE_NAMES.get(language, "English")
        amount = _text_amount(level, density)
        text_str = (
            f" Render {amount} marketing copy / callout labels ON the image in "
            f"{lang}, highlighting the product's key selling points."
        )
    return f"Professional e-commerce photo of {subject}. {guidance}{extra_str}{text_str}"


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    text = text.strip()
    # strip markdown code fences if present
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        brace = re.search(r"\{.*\}", text, re.DOTALL)
        if brace:
            text = brace.group(0)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


@app.post("/api/generate-prompts", response_model=GeneratePromptsResponse)
async def generate_prompts(req: GeneratePromptsRequest) -> GeneratePromptsResponse:
    if not req.template_ids:
        raise HTTPException(status_code=400, detail="No template_ids provided")

    selected = [TEMPLATE_BY_ID[t] for t in req.template_ids if t in TEMPLATE_BY_ID]
    if not selected:
        raise HTTPException(status_code=400, detail="No valid templates selected")

    # Resolve platform + on-image text language + text density.
    platform = PLATFORM_BY_ID.get(req.platform)
    language = req.language or (platform["language"] if platform else "en")
    lang_name = LANGUAGE_NAMES.get(language, "English")
    density = req.density or (platform.get("textDensity") if platform else "balanced")
    if density not in DENSITY_INSTRUCTIONS:
        density = "balanced"

    def _tpl_line(t: Dict[str, Any]) -> str:
        level = t.get("textLevel", "none")
        if level == "none":
            text_rule = " | NO TEXT: keep the image completely free of any text or logos."
        else:
            amount = _text_amount(level, density)
            text_rule = (
                f" | ON-IMAGE TEXT ({level.upper()}): render {amount} tasteful, "
                f"well-composed marketing copy / labels on the image in "
                f"{lang_name} (correctly spelled selling points)."
            )
        return f"- id: {t['id']} | name: {t['name']} ({t['en']}) | guidance: {t['guidance']}{text_rule}"

    template_desc = "\n".join(_tpl_line(t) for t in selected)
    product_desc = json.dumps(req.product.model_dump(), ensure_ascii=False)
    image_note = (
        "A reference product image will be supplied to the image model, so describe "
        "the desired scene/styling while keeping the actual product identity from the "
        "reference image."
        if req.has_image
        else "No reference image is provided, so fully describe the product itself."
    )
    platform_note = (
        f"Target platform: {platform['name']} (recommended export {platform['size']}). "
        f"{platform.get('note', '')}\n"
        if platform
        else ""
    )
    density_note = DENSITY_INSTRUCTIONS[density] + "\n"

    system = (
        "You are an expert e-commerce product photography art director and prompt "
        "engineer for a text-to-image model (gpt-image-2). Produce vivid, concrete, "
        "detailed English prompts optimized for commercial product photography. "
        "The prompt text itself is always in English, but when a template requires "
        "on-image text you must specify the exact wording in the requested language."
    )
    user = (
        f"Product info (JSON): {product_desc}\n"
        f"{platform_note}"
        f"{density_note}"
        f"{image_note}\n\n"
        f"Create one detailed image-generation prompt for EACH of the following "
        f"template types:\n{template_desc}\n\n"
        "Each prompt should incorporate the product info, respect the template "
        "guidance, follow its TEXT rule strictly, and specify composition, "
        "lighting, mood, and quality. For templates requiring on-image text, write "
        f"the actual short copy in {lang_name}. "
        "Return ONLY a JSON object mapping each template id to its prompt string, "
        "no markdown, no extra commentary. Example: "
        '{"white_background": "...", "lifestyle_scene": "..."}'
    )

    prompts: Dict[str, str] = {}
    try:
        content = await grsai.chat_completion(
            [{"role": "system", "content": system}, {"role": "user", "content": user}]
        )
        parsed = _extract_json(content)
        if parsed:
            for t in selected:
                val = parsed.get(t["id"])
                if isinstance(val, str) and val.strip():
                    prompts[t["id"]] = val.strip()
    except Exception:
        # Fall through to fallbacks below.
        pass

    # Ensure every requested template has a prompt.
    for t in selected:
        prompts.setdefault(
            t["id"], _fallback_prompt(req.product, t["id"], language, density)
        )

    return GeneratePromptsResponse(prompts=prompts)


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    if not req.jobs:
        raise HTTPException(status_code=400, detail="No jobs provided")

    async def _submit(job: GenerateJob) -> TaskInfo:
        urls = [job.image_base64] if job.image_base64 else None
        task_id = await grsai.submit_draw(
            prompt=job.prompt,
            aspect_ratio=job.aspectRatio,
            quality=job.quality,
            urls=urls,
        )
        return TaskInfo(task_id=task_id, template_id=job.template_id, label=job.label)

    # Submit all jobs concurrently so the batch is generated in parallel.
    results = await asyncio.gather(
        *(_submit(job) for job in req.jobs), return_exceptions=True
    )
    tasks: List[TaskInfo] = []
    for r in results:
        if isinstance(r, Exception):
            raise HTTPException(status_code=502, detail=f"Generation submit failed: {r}")
        tasks.append(r)
    return GenerateResponse(tasks=tasks)


@app.post("/api/result")
async def result(req: ResultRequest) -> Dict[str, Any]:
    async def _one(task_id: str) -> tuple[str, Dict[str, Any]]:
        try:
            data = await grsai.get_result(task_id)
            d = data.get("data", {})
            return task_id, {
                "status": d.get("status", "unknown"),
                "progress": d.get("progress", 0),
                "results": d.get("results") or [],
                "failure_reason": d.get("failure_reason", ""),
                "error": d.get("error", ""),
            }
        except Exception as exc:
            return task_id, {"status": "error", "error": str(exc), "results": []}

    pairs = await asyncio.gather(*(_one(tid) for tid in req.ids))
    return {"results": dict(pairs)}
