from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.supabase import supabase
from app.routers import scan, size, product, profile

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
app.include_router(profile.router, prefix="/profile", tags=["profile"])

@app.get("/")
async def root():
    return {"message": "ReadyMe Body Measurement API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/test-db")
def test_db():
    try:
        data = supabase.table("body_profiles").select("*").execute()
        return {"data": data.data}
    except Exception as e:
        return {"error": str(e)}