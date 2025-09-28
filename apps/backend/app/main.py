# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import Health, ScoreIn
from app.routers import packs, questions
import os

FRONT_ORIGINS = [
    os.getenv("FRONTEND_ORIGIN", "https://study-game-front.onrender.com"),
    "http://localhost:5173",
]

app = FastAPI(title="Study Game API")

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
    # Demo：實務上你可寫 DB。這裡直接返回文字。
    return {"status": "ok", "echo_score": payload.score}
