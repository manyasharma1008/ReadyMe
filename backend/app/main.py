from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import scan, size, product

app = FastAPI(
    title="ReadyMe Body Measurement API",
    description="API for body measurement scanning and size prediction",
    version="1.0.0"
)

# Configure CORS for extension origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(scan.router, prefix="/scan", tags=["scan"])
app.include_router(size.router, prefix="/size", tags=["size"])
app.include_router(product.router, prefix="/product", tags=["product"])

@app.get("/")
async def root():
    return {"message": "ReadyMe Body Measurement API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}