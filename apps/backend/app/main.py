# apps/backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.models.schemas import Health, ScoreIn
from app.routers import packs, questions
import os

FRONT_ORIGINS = [
    os.getenv("FRONTEND_ORIGIN", "https://study-game-front.onrender.com"),
    "http://localhost:5173",
]

class UTF8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"

app = FastAPI(
    title="Study Game API",
    default_response_class=UTF8JSONResponse,  # 👈 重點
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONT_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(packs.router, prefix="/api")
app.include_router(questions.router, prefix="/api")

@app.get("/api/ping", response_model=Health)
def ping():
    return Health(ok=True)

@app.post("/api/score")
def save_score(payload: ScoreIn):
    return {"status": "ok", "echo_score": payload.score}
