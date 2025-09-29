# apps/backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.models.schemas import Health, ScoreIn
from app.routers import packs, questions
import os

# ==== UTF-8 JSON（避免中文亂碼）====
class UTF8JSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"

# ==== App ====
app = FastAPI(
    title="Study Game API",
    default_response_class=UTF8JSONResponse,
)

# ==== CORS 設定 ====
# 以環境變數切換「放寬/鎖回」模式
ALLOW_ALL_CORS = os.getenv("ALLOW_ALL_CORS") == "1"
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://study-game-front.onrender.com").rstrip("/")

if ALLOW_ALL_CORS:
    # 放寬（用於排錯）：任何來源都允許（不帶認證）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # 正常模式：只允許你的前端與本地開發
    FRONT_ORIGINS = [FRONTEND_ORIGIN, "http://localhost:5173"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=FRONT_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ==== Routers ====
app.include_router(packs.router, prefix="/api", tags=["packs"])
app.include_router(questions.router, prefix="/api", tags=["questions"])

# ==== Health & Demo ====
@app.get("/api/ping", response_model=Health)
def ping():
    return Health(ok=True)

@app.post("/api/score")
def save_score(payload: ScoreIn):
    # Demo：實務上可寫 DB；這裡回 echo
    return {"status": "ok", "echo_score": payload.score}
