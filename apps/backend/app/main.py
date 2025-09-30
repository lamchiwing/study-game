# apps/backend/app/main.py
from fastapi import FastAPI, Query
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ---- CORS：允許前端來源 ----
allowlist = [
    "https://study-game-front.onrender.com",
    "http://localhost:5173",
]
frontend_origin = None
import os
if os.getenv("FRONTEND_ORIGIN"):
    allowlist.append(os.getenv("FRONTEND_ORIGIN"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowlist,
    allow_credentials=False,   # 若未用 cookie，建議 False
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)

# ---- 健康檢查 ----
@app.get("/", response_class=PlainTextResponse)
def root():
    return "study-game-back OK"

# ---- /packs 與 /api/packs ----
@app.get("/packs")
@app.get("/api/packs")
def get_packs():
    # TODO: 之後接資料來源（DB/CSV/R2）
    packs = [
        {"slug": "chinese/grade1/colors-demo", "title": "Colors Demo", "subject": "Chinese", "grade": "Grade 1"}
    ]
    return packs  # 建議即使沒資料也回 200 + []

# ---- /quiz 與 /api/quiz ----
@app.get("/quiz")
@app.get("/api/quiz")
def get_quiz(slug: str = Query("", description="e.g. chinese/grade1/colors-demo")):
    if not slug:
        return {"questions": []}

    if slug == "chinese/grade1/colors-demo":
        return {
            "questions": [
                {
                    "id": "1",
                    "question": "紅色的英文是？",
                    "choiceA": "Red",
                    "choiceB": "Blue",
                    "choiceC": "Green",
                    "choiceD": "Yellow",
                    "answer": "A",
                    "explain": "Red 就是紅色",
                }
            ]
        }

    # 找不到該 slug：回空集合（避免 404）
    return {"questions": []}
