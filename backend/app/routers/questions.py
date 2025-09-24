# app/routers/questions.py
from fastapi import APIRouter, HTTPException, Query
from app.utils.csv_loader import load_questions
from app.models.schemas import Question

router = APIRouter(tags=["questions"])

@router.get("/questions", response_model=list[Question])
def get_questions(slug: str = Query(..., description="e.g. chinese/grade1/colors-demo")):
    try:
        return load_questions(slug)
    except FileNotFoundError:
        raise HTTPException(404, detail=f"Pack not found: {slug}")
