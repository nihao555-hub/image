import asyncio
import base64
import json
import os
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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
class SpecItem(BaseModel):
    k: str = ""
    v: str = ""


class ProductInfo(BaseModel):
    name: str = ""
    category: str = ""
    style: str = ""
    background: str = ""
    extra: str = ""
    # Category preset the structured params belong to (apparel/digital/...).
    categoryType: str = ""
    # SKU / article number and its variants (colours, models, sizes...).
    sku: str = ""
    variants: str = ""
    # Structured key/value specifications for spec-table style templates.
    specs: List[SpecItem] = []


class GeneratePromptsRequest(BaseModel):
    product: ProductInfo
    template_ids: List[str]
    has_image: bool = False
    platform: str = ""
    language: str = ""
    density: str = ""
    # Optional reference product image (data URL or http URL). When provided the
    # LLM is asked to visually inspect it before writing the prompts.
    image_base64: Optional[str] = None


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


class GenerateImageSetResponse(BaseModel):
    tasks: List[TaskInfo]
    prompts: Dict[str, str]
    template_ids: List[str]


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


def _parse_template_ids(value: str) -> List[str]:
    if not value.strip():
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        parsed = [item.strip() for item in value.split(",")]
    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        raise HTTPException(
            status_code=422,
            detail="template_ids must be a JSON string array or comma-separated string",
        )
    template_ids = list(dict.fromkeys(item.strip() for item in parsed if item.strip()))
    invalid = [template_id for template_id in template_ids if template_id not in TEMPLATE_BY_ID]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown template_ids: {', '.join(invalid)}",
        )
    return template_ids


def _image_media_type(data: bytes) -> Optional[str]:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _image_data_url(image: Optional[UploadFile]) -> Optional[str]:
    if image is None:
        return None
    try:
        data = await image.read(config.MAX_UPLOAD_BYTES + 1)
    finally:
        await image.close()
    if not data:
        raise HTTPException(status_code=422, detail="Uploaded image is empty")
    if len(data) > config.MAX_UPLOAD_BYTES:
        max_mb = config.MAX_UPLOAD_BYTES / 1024 / 1024
        raise HTTPException(
            status_code=413,
            detail=f"Uploaded image exceeds the {max_mb:g} MB limit",
        )
    media_type = _image_media_type(data)
    if media_type is None:
        raise HTTPException(
            status_code=415,
            detail="Only JPEG, PNG, and WebP reference images are supported",
        )
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{media_type};base64,{encoded}"


def _direct_set_prompt(
    prompt: str,
    template_id: str,
    language: str,
    density: str,
) -> str:
    template = TEMPLATE_BY_ID[template_id]
    text_level = template.get("textLevel", "none")
    if text_level == "none":
        text_rule = " Keep the image completely free of text and logos."
    else:
        amount = _text_amount(text_level, density)
        language_name = LANGUAGE_NAMES.get(language, "English")
        text_rule = (
            f" Render {amount} well-composed marketing labels on the image in "
            f"{language_name}."
        )
    return (
        f"{prompt.strip()}\n\n"
        f"Image type: {template['name']} ({template['en']}). "
        f"{template['guidance']}{text_rule}"
    )


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
    if req.image_base64:
        image_note = (
            "A reference product image is attached below — LOOK AT IT CAREFULLY "
            "first. Identify the actual product, its type, colour, material, shape "
            "and distinctive details, and base every prompt on THIS product so the "
            "generated set stays visually consistent with it. The same reference "
            "image is also fed to the image model, so keep the product identity "
            "from the reference and describe the desired scene/styling around it. "
            "Use the text product info only to fill gaps."
        )
    elif req.has_image:
        image_note = (
            "A reference product image will be supplied to the image model, so describe "
            "the desired scene/styling while keeping the actual product identity from the "
            "reference image."
        )
    else:
        image_note = "No reference image is provided, so fully describe the product itself."
    platform_note = (
        f"Target platform: {platform['name']} (recommended export {platform['size']}). "
        f"{platform.get('note', '')}\n"
        if platform
        else ""
    )
    density_note = DENSITY_INSTRUCTIONS[density] + "\n"

    specs = [s for s in req.product.specs if (s.k or s.v)]
    params_note = ""
    if specs:
        spec_str = "; ".join(f"{s.k}: {s.v}" for s in specs)
        params_note = (
            f"Structured product specifications: {spec_str}. For spec-table / "
            "dimension / parameter templates, lay these out as the on-image "
            "labels and values (verbatim, in the requested language).\n"
        )
    if req.product.variants.strip():
        params_note += (
            f"SKU variants: {req.product.variants.strip()}. For the color/SKU "
            "variant template, show the product in exactly these variants.\n"
        )

    system = (
        "You are an expert e-commerce product photography art director and prompt "
        "engineer for a text-to-image model (gpt-image-2). Produce vivid, concrete, "
        "detailed English prompts optimized for commercial product photography. "
        "The prompt text itself is always in English, but when a template requires "
        "on-image text you must specify the exact wording in the requested language."
    )
    user_text = (
        f"Product info (JSON): {product_desc}\n"
        f"{platform_note}"
        f"{density_note}"
        f"{params_note}"
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

    # When a reference image is provided, send it to the (vision-capable) LLM so
    # it can look at the actual product before writing prompts.
    if req.image_base64:
        user_content: Any = [
            {"type": "text", "text": user_text},
            {"type": "image_url", "image_url": {"url": req.image_base64}},
        ]
    else:
        user_content = user_text

    prompts: Dict[str, str] = {}
    # Retry the LLM a few times so a transient error / unparseable reply does not
    # silently degrade every prompt to the generic fallback.
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]
    for attempt in range(3):
        try:
            content = await grsai.chat_completion(messages)
            parsed = _extract_json(content)
            if parsed:
                for t in selected:
                    val = parsed.get(t["id"])
                    if isinstance(val, str) and val.strip():
                        prompts[t["id"]] = val.strip()
                if prompts:
                    break
        except Exception:
            pass
        if attempt < 2:
            await asyncio.sleep(1.0 * (attempt + 1))

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
        # Retry the submission a few times to ride out transient upstream errors.
        last_exc: Optional[Exception] = None
        for attempt in range(3):
            try:
                task_id = await grsai.submit_draw(
                    prompt=job.prompt,
                    aspect_ratio=job.aspectRatio,
                    quality=job.quality,
                    urls=urls,
                )
                return TaskInfo(
                    task_id=task_id, template_id=job.template_id, label=job.label
                )
            except Exception as exc:  # noqa: BLE001 - retry any submit failure
                last_exc = exc
                if attempt < 2:
                    await asyncio.sleep(1.5 * (attempt + 1))
        raise last_exc if last_exc else grsai.GrsaiError("submit failed")

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


@app.post("/api/image-sets/generate", response_model=GenerateImageSetResponse)
async def generate_image_set(
    prompt: str = Form(..., min_length=1, max_length=12000),
    image: Optional[UploadFile] = File(default=None),
    template_ids: str = Form(default=""),
    platform: str = Form(default="custom"),
    language: str = Form(default=""),
    density: str = Form(default=""),
    quality: str = Form(default="high"),
    aspect_ratio: str = Form(default=""),
    auto_prompts: bool = Form(default=True),
    label: str = Form(default="API 套图"),
) -> GenerateImageSetResponse:
    prompt = prompt.strip()
    if not prompt:
        raise HTTPException(status_code=422, detail="prompt cannot be blank")

    platform_config = PLATFORM_BY_ID.get(platform)
    if platform_config is None:
        raise HTTPException(status_code=422, detail=f"Unknown platform: {platform}")

    selected_ids = _parse_template_ids(template_ids)
    if not selected_ids:
        selected_ids = list(platform_config["templates"])

    resolved_language = language or platform_config["language"]
    if resolved_language not in LANGUAGE_NAMES:
        raise HTTPException(
            status_code=422, detail=f"Unsupported language: {resolved_language}"
        )
    resolved_density = density or platform_config["textDensity"]
    if resolved_density not in DENSITY_INSTRUCTIONS:
        raise HTTPException(
            status_code=422, detail=f"Unsupported density: {resolved_density}"
        )
    if quality not in {"auto", "low", "medium", "high"}:
        raise HTTPException(status_code=422, detail=f"Unsupported quality: {quality}")
    if aspect_ratio and aspect_ratio not in {
        "1024x1024",
        "1024x1536",
        "1536x1024",
    }:
        raise HTTPException(
            status_code=422, detail=f"Unsupported aspect_ratio: {aspect_ratio}"
        )

    image_base64 = await _image_data_url(image)
    product = ProductInfo(name=label.strip(), extra=prompt)
    if auto_prompts:
        prompt_response = await generate_prompts(
            GeneratePromptsRequest(
                product=product,
                template_ids=selected_ids,
                has_image=image_base64 is not None,
                platform=platform,
                language=resolved_language,
                density=resolved_density,
                image_base64=image_base64,
            )
        )
        prompts = prompt_response.prompts
    else:
        prompts = {
            template_id: _direct_set_prompt(
                prompt, template_id, resolved_language, resolved_density
            )
            for template_id in selected_ids
        }

    jobs = [
        GenerateJob(
            template_id=template_id,
            prompt=prompts[template_id],
            aspectRatio=aspect_ratio or TEMPLATE_BY_ID[template_id]["aspectRatio"],
            quality=quality,
            image_base64=image_base64,
            label=f"{label.strip() or 'API 套图'} · {TEMPLATE_BY_ID[template_id]['name']}",
        )
        for template_id in selected_ids
    ]
    generation = await generate(GenerateRequest(jobs=jobs))
    return GenerateImageSetResponse(
        tasks=generation.tasks,
        prompts=prompts,
        template_ids=selected_ids,
    )


@app.post("/api/result")
@app.post("/api/image-sets/result")
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


# --------------------------------------------------------------------------- #
# Static frontend (single-origin deployment)
# --------------------------------------------------------------------------- #
# When the built frontend is present (frontend/dist), serve it from the same
# origin as the API so the app can be deployed behind a single URL. API routes
# above are registered first, so they take precedence over this catch-all mount.
# In local dev the build lives in ../../frontend/dist; for a packaged deploy the
# build is copied to app/webdist so it ships inside the backend build context.
_DIST_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), "webdist"),
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"),
]
for _dist in _DIST_CANDIDATES:
    if os.path.isdir(_dist):
        app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
        break
