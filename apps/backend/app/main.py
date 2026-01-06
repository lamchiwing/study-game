# apps/backend/app/main.py
from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from auth import auth_router
from app.routers.report import router as report_router

app = FastAPI(
    title="Study Game API",
    version=os.getenv("APP_VERSION", "0.1.0"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://mypenisblue.com",
        "https://www.mypenisblue.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ prefix 統一
app.include_router(auth_router, prefix="/api")
app.include_router(report_router, prefix="/api")


@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"


@app.get("/health")
def health():
    return {"ok": True}
