# app/routers/packs.py
from fastapi import APIRouter
from app.utils.csv_loader import list_packs
from app.models.schemas import Pack

router = APIRouter(tags=["packs"])

@router.get("/packs", response_model=list[Pack])
def get_packs():
    return list_packs()
