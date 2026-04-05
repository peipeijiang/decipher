import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.api.videos import router as videos_router
from app.api.reports import router as reports_router, config_router
from app.api.segments import router as segments_router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    os.makedirs("uploads", exist_ok=True)
    os.makedirs("processed", exist_ok=True)
    yield


app = FastAPI(title="TikTok Analyzer API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(videos_router)
app.include_router(reports_router)
app.include_router(config_router)


@app.get("/health")
def health():
    return {"status": "ok"}
