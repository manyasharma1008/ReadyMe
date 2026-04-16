import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import scan, size, product, profile, vto

app = FastAPI(
    title="ReadyMe Body Measurement API",
    description="API for body measurement scanning and size prediction",
    version="1.0.0"
)

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "https://ready-me-liart.vercel.app",
]
DEFAULT_CORS_ALLOW_ORIGIN_REGEX = r"(https://.*\.vercel\.app|chrome-extension://.*)"


def get_allowed_origins() -> list[str]:
    raw_origins = os.getenv("BACKEND_CORS_ORIGINS", "")
    configured_origins = [
        origin.strip().rstrip("/")
        for origin in raw_origins.split(",")
        if origin.strip()
    ]

    merged_origins = []
    for origin in DEFAULT_CORS_ORIGINS + configured_origins:
        normalized_origin = origin.rstrip("/")
        if normalized_origin and normalized_origin not in merged_origins:
            merged_origins.append(normalized_origin)

    return merged_origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_origin_regex=os.getenv("BACKEND_CORS_ALLOW_ORIGIN_REGEX", DEFAULT_CORS_ALLOW_ORIGIN_REGEX),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scan.router, prefix="/scan", tags=["scan"])
app.include_router(size.router, prefix="/size", tags=["size"])
app.include_router(product.router, prefix="/product", tags=["product"])
app.include_router(profile.router, prefix="/profile", tags=["profile"])
app.include_router(vto.router, prefix="/vto", tags=["vto"])

@app.get("/")
async def root():
    return {"message": "ReadyMe Body Measurement API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# For Render deployment - use dynamic port
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
