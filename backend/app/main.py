from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from app import analytics, error_tracker
from app.config import settings
from app.routes import findings


async def _backfill_finding_hashes(db) -> None:
    """Register any existing findings that pre-date the finding_hashes collection."""
    from app.dedup import compute_content_hash, compute_title_hash, register_finding
    async for doc in db.findings.find({}, {"_id": 1, "title": 1, "content": 1, "content_hash": 1}):
        finding_id = doc["_id"]
        title = doc.get("title", "")
        content = doc.get("content", "")
        # Skip if already registered (check either hash sentinel exists)
        content_hash = doc.get("content_hash") or compute_content_hash(content)
        title_hash = compute_title_hash(title)
        already = await db.finding_hashes.find_one({"finding_id": finding_id})
        if not already:
            await register_finding(db, finding_id, title, content_hash, title_hash)


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncIOMotorClient(settings.mongo_url)
    app.state.mongo = client
    app.state.db = client[settings.mongo_db]
    db = app.state.db
    # Ensure indexes for dedup and fast lookups
    await db.findings.create_index("content_hash", unique=True, sparse=True)
    await db.finding_hashes.create_index("finding_id")
    # Backfill hash sentinels for findings that were submitted before dedup was added
    await _backfill_finding_hashes(db)
    try:
        yield
    finally:
        client.close()


app = FastAPI(
    title=settings.project_name,
    lifespan=lifespan,
    # Expose the OpenAPI spec under the /api prefix so it's reachable
    # through Vite's /api proxy from the preview URL. The orchestrator's
    # Routes panel reads this to auto-discover the app's endpoints.
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Builder-internal: tracks runtime errors so the App Builder can surface them
# as a "Send to agent" popup. Safe to keep in production builds; it has a
# fixed in-memory ring buffer and only adds /api/__app_errors routes.
error_tracker.install(app)

# Builder-internal: lightweight request analytics powering the Backend /
# Analytics tab. Records every request to a capped Mongo collection;
# /api/__analytics/summary serves aggregates the orchestrator proxies.
# Internal routes (/api/__*, /docs, etc.) are skipped automatically.
analytics.install(app)

app.include_router(findings.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "project": settings.project_name}


@app.get("/api/hello")
async def hello():
    db = app.state.db
    await db.greetings.update_one(
        {"_id": "default"},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"message": f"hello from {settings.project_name}"},
        },
        upsert=True,
    )
    doc = await db.greetings.find_one({"_id": "default"})
    return {"message": doc["message"], "count": doc["count"]}
