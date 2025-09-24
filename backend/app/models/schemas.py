# app/models/schemas.py
from typing import List, Optional
from pydantic import BaseModel, Field

class Health(BaseModel):
    ok: bool = True

class Pack(BaseModel):
    """題包清單用：/api/packs"""
    slug: str = Field(..., description="例如 chinese/grade1/colors-demo")
    count: Optional[int] = Field(None, description="題數（local_csv 時可預先估計，r2_csv 可能為 None）")

class Question(BaseModel):
    """單一題目結構（不含 image）"""
    id: str
    subject: str
    grade: str
    topic: str
    LO: str
    diff: str
    question: str
    choices: List[str]  # 預期長度 4（A,B,C,D）
    answer: str         # 'A'/'B'/'C'/'D' 或 '1'..'4'
    explain: str

class ScoreIn(BaseModel):
    """/api/score 範例用的請求體"""
    score: int
