import json
import re
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import config, grsai
from .templates import TEMPLATES, TEMPLATE_BY_ID

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
    return {"templates": TEMPLATES}


def _fallback_prompt(product: ProductInfo, template_id: str) -> str:
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
    return f"Professional e-commerce photo of {subject}. {guidance}{extra_str}"


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

    template_desc = "\n".join(
        f"- id: {t['id']} | name: {t['name']} ({t['en']}) | guidance: {t['guidance']}"
        for t in selected
    )
    product_desc = json.dumps(req.product.model_dump(), ensure_ascii=False)
    image_note = (
        "A reference product image will be supplied to the image model, so describe "
        "the desired scene/styling while keeping the actual product identity from the "
        "reference image."
        if req.has_image
        else "No reference image is provided, so fully describe the product itself."
    )

    system = (
        "You are an expert e-commerce product photography art director and prompt "
        "engineer for a text-to-image model (gpt-image-2). Produce vivid, concrete, "
        "detailed English prompts optimized for commercial product photography."
    )
    user = (
        f"Product info (JSON): {product_desc}\n"
        f"{image_note}\n\n"
        f"Create one detailed image-generation prompt for EACH of the following "
        f"template types:\n{template_desc}\n\n"
        "Each prompt should incorporate the product info, respect the template "
        "guidance, and specify composition, lighting, mood, and quality. "
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
        prompts.setdefault(t["id"], _fallback_prompt(req.product, t["id"]))

    return GeneratePromptsResponse(prompts=prompts)


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest) -> GenerateResponse:
    if not req.jobs:
        raise HTTPException(status_code=400, detail="No jobs provided")

    tasks: List[TaskInfo] = []
    for job in req.jobs:
        urls = [job.image_base64] if job.image_base64 else None
        try:
            task_id = await grsai.submit_draw(
                prompt=job.prompt,
                aspect_ratio=job.aspectRatio,
                quality=job.quality,
                urls=urls,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Generation submit failed: {exc}")
        tasks.append(
            TaskInfo(task_id=task_id, template_id=job.template_id, label=job.label)
        )
    return GenerateResponse(tasks=tasks)


@app.post("/api/result")
async def result(req: ResultRequest) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for task_id in req.ids:
        try:
            data = await grsai.get_result(task_id)
            d = data.get("data", {})
            out[task_id] = {
                "status": d.get("status", "unknown"),
                "progress": d.get("progress", 0),
                "results": d.get("results") or [],
                "failure_reason": d.get("failure_reason", ""),
                "error": d.get("error", ""),
            }
        except Exception as exc:
            out[task_id] = {"status": "error", "error": str(exc), "results": []}
    return {"results": out}
