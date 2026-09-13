from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.asset_inventory import describe_asset_search_paths, list_asset_inventory
from app.comfy_graph import compile_workflow
from app.pipeline import (
    DEFAULT_MODEL,
    MOCK_MODE,
    configure_host_schedulers,
    pipeline_holder,
)
from app.queue import JobQueue, resolve_output_path
from app.schemas import (
    HealthResponse,
    JobStatusResponse,
    ListedModelResponse,
    ModelsResponse,
    Txt2ImgRequest,
    Txt2ImgResponse,
    UploadResponse,
    WorkflowClassifyResponse,
    WorkflowRequest,
    WorkflowResponse,
)
from app.workflow_exec import assets_preview

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = Path(os.environ.get("DIFFUSERS_OUTPUT_DIR", str(ROOT / "outputs"))).resolve()
INPUT_DIR = Path(os.environ.get("DIFFUSERS_INPUT_DIR", str(ROOT / "inputs"))).resolve()
ENGINE_URL = os.environ.get("DIFFUSERS_ENGINE_URL", "http://127.0.0.1:8190").rstrip("/")

INPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Castcut Diffusers Engine", version="0.2.0")
jobs = JobQueue(OUTPUT_DIR)


def _listed(item) -> ListedModelResponse:  # type: ignore[no-untyped-def]
    return ListedModelResponse(
        id=item.id,
        label=item.label,
        kind=item.kind,  # type: ignore[arg-type]
        family=item.family,
        default=getattr(item, "default", False),
        bucket=getattr(item, "bucket", None),
    )


@app.on_event("startup")
async def on_startup() -> None:
    configure_host_schedulers()
    jobs.start()


@app.get("/v1/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    device, model, mock = pipeline_holder.describe()
    return HealthResponse(
        ok=True,
        device=device,
        model=model or DEFAULT_MODEL,
        mock=mock or MOCK_MODE,
        search_paths=describe_asset_search_paths(),
    )


@app.get("/v1/models", response_model=ModelsResponse)
async def models() -> ModelsResponse:
    inventory = list_asset_inventory()
    checkpoints = [_listed(item) for item in inventory.get("checkpoints", [])]
    diffusion_models = [_listed(item) for item in inventory.get("diffusion_models", [])]
    # Prefer Qwen/Flux UNETs as the Diffusers default (not SDXL/RealVis).
    selectable = [*diffusion_models, *checkpoints]
    default_model = next((item.id for item in selectable if item.default), None)
    if default_model is None and selectable:
        preferred = next(
            (
                item.id
                for item in selectable
                if item.family == "qwen" and "edit" not in item.id.lower()
            ),
            None,
        )
        if preferred is None:
            preferred = next(
                (item.id for item in selectable if item.family == "flux"),
                None,
            )
        if preferred is None:
            preferred = selectable[0].id
        default_model = preferred
        for item in selectable:
            if item.id == default_model:
                item.default = True
                break

    return ModelsResponse(
        models=selectable,
        checkpoints=checkpoints,
        diffusion_models=diffusion_models,
        text_encoders=[_listed(item) for item in inventory.get("text_encoders", [])],
        vaes=[_listed(item) for item in inventory.get("vaes", [])],
        loras=[_listed(item) for item in inventory.get("loras", [])],
        default_model=default_model,
        search_paths=describe_asset_search_paths(),
    )


@app.post("/v1/txt2img", response_model=Txt2ImgResponse)
async def txt2img(body: Txt2ImgRequest) -> Txt2ImgResponse:
    job = await jobs.enqueue(body)
    return Txt2ImgResponse(prompt_id=job.prompt_id, engine_url=ENGINE_URL)


@app.post("/v1/workflow/classify", response_model=WorkflowClassifyResponse)
async def workflow_classify(body: WorkflowRequest) -> WorkflowClassifyResponse:
    result = compile_workflow(body.prompt)
    return WorkflowClassifyResponse(
        supported=result.supported,
        family=result.family,
        reason=result.reason,
        unsupported_nodes=result.unsupported_nodes,
        assets=assets_preview(result.compiled),
    )


@app.post("/v1/workflow", response_model=WorkflowResponse)
async def workflow(body: WorkflowRequest) -> WorkflowResponse:
    result = compile_workflow(body.prompt)
    if not result.supported:
        raise HTTPException(
            status_code=422,
            detail={
                "message": result.reason,
                "family": result.family,
                "unsupported_nodes": result.unsupported_nodes,
                "supported": False,
            },
        )
    job = await jobs.enqueue_workflow(body)
    return WorkflowResponse(
        prompt_id=job.prompt_id,
        engine_url=ENGINE_URL,
        family=result.family,
        supported=True,
    )


@app.get("/v1/jobs/{prompt_id}", response_model=JobStatusResponse)
async def job_status(prompt_id: str) -> JobStatusResponse:
    job = jobs.get(prompt_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown prompt_id.")
    return jobs.to_status(job)


@app.get("/v1/view")
async def view(
    filename: str = Query(...),
    subfolder: str = Query(""),
    type: str = Query("output"),  # noqa: A002 — matches Comfy query shape
) -> FileResponse:
    try:
        base = INPUT_DIR if type == "input" else OUTPUT_DIR
        path = resolve_output_path(base, filename, subfolder)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(path, media_type="image/png")


@app.post("/v1/upload", response_model=UploadResponse)
async def upload(image: UploadFile = File(...)) -> UploadResponse:
    if not image.filename:
        raise HTTPException(status_code=400, detail="Image file is required.")
    safe_name = Path(image.filename).name
    if not safe_name or ".." in safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    dest = INPUT_DIR / safe_name
    data = await image.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload.")
    dest.write_bytes(data)
    return UploadResponse(name=safe_name, subfolder="", type="input")
