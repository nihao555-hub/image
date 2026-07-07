import asyncio
import base64
import io
import json
import os
import re
from typing import Any, Dict, List, Optional

from PIL import Image
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, config, geekai, grsai
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


class ResultRequest(BaseModel):
    ids: List[str]


class AuthRequest(BaseModel):
    email: str
    password: str


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "configured": bool(config.GRSAI_API_KEY)}


@app.post("/api/auth/register")
async def auth_register(req: AuthRequest) -> Dict[str, Any]:
    return auth.register(req.email, req.password)


@app.post("/api/auth/login")
async def auth_login(req: AuthRequest) -> Dict[str, Any]:
    return auth.login(req.email, req.password)


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
async def generate_prompts(
    req: GeneratePromptsRequest, _uid: int = Depends(auth.require_user)
) -> GeneratePromptsResponse:
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
async def generate(
    req: GenerateRequest, _uid: int = Depends(auth.require_user)
) -> GenerateResponse:
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


class WatermarkRequest(BaseModel):
    # Data URL or http URL of the source image.
    image_base64: str
    # "pro" (gpt-image-2) or "fast" (nano-banana-2-lite).
    mode: str = "pro"


WATERMARK_PROMPT = (
    "This is a photo-restoration task, not an image-generation task. "
    "Reproduce this exact photo pixel-for-pixel, only removing overlaid "
    "watermarks: semi-transparent stamps, logo overlays, website URLs, shop "
    "names, promotional banners/badges and any other text or graphics that "
    "were added on top of the photo, seamlessly reconstructing the areas "
    "underneath. STRICT REQUIREMENTS: the product itself must remain 100% "
    "identical — its shape, colors, materials, and especially any text, "
    "numbers, logos, labels, printing or patterns that are physically part of "
    "the product or its packaging must be preserved exactly as-is. Keep the "
    "same composition, camera angle, lighting, shadows and background. Do not "
    "beautify, restyle or regenerate anything. EDGE CASES: if the image has "
    "no overlaid watermark or added text at all, return it unchanged. If the "
    "image is a marketing poster / promotional composite (a product photo "
    "surrounded by designed headlines, slogans, price tags, decorative "
    "graphics or layout elements), extract only the original product photo: "
    "remove all the added poster text and decorative design elements and "
    "output a clean photo of the product alone, reconstructing the covered "
    "areas naturally. Output only the cleaned photo."
)

UPSCALE_PROMPT = (
    "This is an extreme super-resolution / deblurring task, not an "
    "image-generation task. Reconstruct this exact photo as an ultra-sharp, "
    "ultra-high-definition 4K image: completely remove blur, defocus, bokeh "
    "softness, motion blur and noise; restore crisp edges, realistic surface "
    "textures and fine detail everywhere in the frame, and make all text, "
    "numbers, parameters, charts and labels crisp and clearly legible. Even "
    "if the source is severely blurred or out of focus, infer and reconstruct "
    "the most plausible sharp version of the same scene — every object must "
    "end up in sharp focus. STRICT REQUIREMENTS: the content must remain "
    "100% identical — same subjects, same text and wording, same layout, "
    "composition, colors, lighting and background. Do not add, remove, "
    "restyle or reinterpret anything; only maximise sharpness, resolution "
    "and clarity. Output only the ultra-high-definition photo."
)


# gpt-image-2 size constraints: sides are multiples of 16 and <= 3840,
# total pixels within [655360, 8294400], aspect ratio <= 3:1.
def _fit_size(w: int, h: int, area: Optional[float] = None) -> str:
    ratio = min(max(w / h, 1 / 3), 3.0)
    area = float(min(max(area if area is not None else w * h, 655_360), 8_294_400))
    for _ in range(6):
        tw = min(max(int(round((area * ratio) ** 0.5 / 16)) * 16, 16), 3840)
        th = min(max(int(round((area / ratio) ** 0.5 / 16)) * 16, 16), 3840)
        # Rounding can push the ratio slightly past the 3:1 limit.
        while tw > th * 3:
            tw -= 16
        while th > tw * 3:
            th -= 16
        px = tw * th
        if 655_360 <= px <= 8_294_400:
            return f"{tw}x{th}"
        area *= 1.15 if px < 655_360 else 0.85
    return "1024x1024"


def _source_size(image: str, area: Optional[float] = None) -> str:
    """Derive an output size that keeps the source image's aspect ratio."""
    try:
        if not image.startswith("data:"):
            return "auto"
        raw = base64.b64decode(image.split(",", 1)[1])
        with Image.open(io.BytesIO(raw)) as im:
            return _fit_size(im.width, im.height, area)
    except Exception:  # noqa: BLE001 - fall back to upstream default
        return "auto"


async def _submit_restore(
    prompt: str, image: str, mode: str, area: Optional[float] = None
) -> str:
    if mode == "fast":
        return await grsai.submit_nano_banana(
            prompt=prompt, urls=[image], model=config.FAST_IMAGE_MODEL
        )
    return await grsai.submit_draw(
        prompt=prompt,
        aspect_ratio=_source_size(image, area),
        quality="auto",
        urls=[image],
    )


@app.post("/api/watermark")
async def watermark(
    req: WatermarkRequest, _uid: int = Depends(auth.require_user)
) -> Dict[str, str]:
    """Submit a single watermark-removal task; the client polls /api/result."""
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")
    try:
        task_id = await _submit_restore(WATERMARK_PROMPT, req.image_base64, req.mode)
    except Exception as exc:  # noqa: BLE001 - surface upstream failure to client
        raise HTTPException(status_code=502, detail=f"Watermark submit failed: {exc}")
    return {"task_id": task_id}


@app.post("/api/upscale")
async def upscale(
    req: WatermarkRequest, _uid: int = Depends(auth.require_user)
) -> Dict[str, str]:
    """Submit a single HD-enhancement task; the client polls /api/result."""
    if not req.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 is required")
    try:
        # Upscale always targets the maximum allowed pixel area (~4K).
        task_id = await _submit_restore(
            UPSCALE_PROMPT, req.image_base64, req.mode, area=8_294_400
        )
    except Exception as exc:  # noqa: BLE001 - surface upstream failure to client
        raise HTTPException(status_code=502, detail=f"Upscale submit failed: {exc}")
    return {"task_id": task_id}


@app.post("/api/result")
async def result(
    req: ResultRequest, _uid: int = Depends(auth.require_user)
) -> Dict[str, Any]:
    async def _one(task_id: str) -> tuple[str, Dict[str, Any]]:
        try:
            if task_id.startswith("gk:"):
                return task_id, await geekai.get_result(task_id[3:])
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
