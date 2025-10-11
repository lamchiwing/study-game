# apps/backend/app/entitlements.py
from typing import Optional, Dict, Any

# MVP：用記憶體假資料。之後可改接 DB。
# 意義：user_001 只有 P1（1年級），user_002 有 P1~P3
_FAKE_ENTS: Dict[str, Any] = {
    "user_001": {"grade_from": 1, "grade_to": 1, "subjects": ["math", "chinese", "general"]},
    "user_002": {"grade_from": 1, "grade_to": 3, "subjects": ["math", "chinese"]},
}

def get_entitlement(user_id: Optional[str]) -> Optional[dict]:
    if not user_id:
        return None
    return _FAKE_ENTS.get(user_id)

def has_access(user_id: Optional[str], subject: str, grade: int) -> bool:
    ent = get_entitlement(user_id)
    if not ent:
        return False
    g1, g2 = int(ent.get("grade_from", 0)), int(ent.get("grade_to", 0))
    if grade < g1 or grade > g2:
        return False
    # 如要限制科目就打開這段；若所有科目都可做可略過
    subs = ent.get("subjects") or []
    return True if not subs else (subject in subs)
