# apps/backend/app/entitlements.py   ← 建議用這個檔名覆蓋
from __future__ import annotations
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone

from .db import SessionLocal
from .models import Customer, EntGrant

# === 方案旗標（前端廣告/報告判斷用） ==========================
PLANS: Dict[str, Dict[str, Any]] = {
    "free": {
        "max_students": 1,
        "report_enabled": False,
        "allowed_grades": [],
        "ads_enabled": True,   # 只有免費顯示廣告
        "name": "Free",
    },
    "starter": {
        "max_students": 1,
        "report_enabled": True,
        "allowed_grades": [f"grade{i}" for i in range(1, 7)],
        "ads_enabled": False,  # 付費免廣告
        "name": "Starter",
    },
    "pro": {
        "max_students": 2,
        "report_enabled": True,
        "allowed_grades": [f"grade{i}" for i in range(1, 7)],
        "ads_enabled": False,  # 付費免廣告
        "name": "Pro",
    },
}

def ads_enabled(plan: str) -> bool:
    return bool(PLANS.get(plan, PLANS["free"])["ads_enabled"])

def report_enabled(plan: str) -> bool:
    return bool(PLANS.get(plan, PLANS["free"])["report_enabled"])

def max_students(plan: str) -> int:
    return int(PLANS.get(plan, PLANS["free"])["max_students"])

# === 工具 ======================================================
_SUBJ_ALIASES = {
    "cn": "chinese", "chi": "chinese", "zh": "chinese",
    "maths": "math", "mathematics": "math",
    "gen": "general", "gs": "general",
}

def _norm_subject(s: Optional[str]) -> str:
    s = (s or "").strip().lower()
    return _SUBJ_ALIASES.get(s, s) if s else ""

def _parse_grade_to_num(grade: Optional[str | int]) -> int:
    if grade is None: return 0
    if isinstance(grade, int): g = grade
    else:
        t = grade.strip().lower()
        for pre in ("grade", "g", "p", "primary", "yr", "year"):
            if t.startswith(pre):
                t = t[len(pre):]
                break
        num = "".join(ch for ch in t if ch.isdigit())
        g = int(num) if num.isdigit() else 0
    return g if 1 <= g <= 6 else 0

def _now() -> datetime:
    return datetime.now(timezone.utc)

# === 對外 API ==================================================
def upsert_customer(user_id: str, email: str | None, stripe_customer_id: str | None):
    with SessionLocal() as s, s.begin():
        found = s.get(Customer, user_id)
        if found:
            if email is not None:
                found.email = email
            if stripe_customer_id is not None:
                found.stripe_customer_id = stripe_customer_id
        else:
            s.add(Customer(user_id=user_id, email=email, stripe_customer_id=stripe_customer_id))

def add_access(user_id: str, scope: dict, expires_at: Optional[int | datetime] = None) -> bool:
    """
    scope：
      - {"plan":"pro"} → 通配（可選）
      - {"plan":"starter","subject":"math","grade":"grade1"}
      - {"plan":"pro","subject":"chinese","grade":"grade3"}（自選 2 組時各寫一筆）
    合併規則：相同 plan + subjects 相容（任一為通配或集合相同）且年級區間相交／相鄰 → 合併
    """
    if not user_id:
        return False

    plan = (scope.get("plan") or "starter").lower()
    subj = _norm_subject(scope.get("subject"))
    g_from = scope.get("grade_from")
    g_to   = scope.get("grade_to")
    g_one  = scope.get("grade")

    # 規範化年級
    if plan == "pro" and not subj and not g_from and not g_to and not g_one:
        # 通配 Pro：subjects=None, 1..6
        subj_val = None
        gf, gt = 1, 6
    else:
        subj_val = subj or None
        if g_one is not None:
            gf = gt = _parse_grade_to_num(g_one)
        else:
            gf = _parse_grade_to_num(g_from)
            gt = _parse_grade_to_num(g_to)
        if not (1 <= gf <= 6):
            return False
        if not (1 <= gt <= 6):
            gt = gf
        if gf > gt:
            gf, gt = gt, gf

    exp_dt: datetime | None
    if expires_at is None:
        exp_dt = None
    elif isinstance(expires_at, int):
        exp_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc)
    else:
        exp_dt = expires_at

    with SessionLocal() as s, s.begin():
        # 嘗試合併
        q = (
            s.query(EntGrant)
             .filter(EntGrant.user_id == user_id, EntGrant.plan == plan)
        )
        if subj_val is None:
            q = q.filter(EntGrant.subject.is_(None))
        else:
            q = q.filter(EntGrant.subject == subj_val)

        merged = False
        for g in q.all():
            # 年級相交/相鄰即合併
            if g.grade_to + 1 < gf or gt + 1 < g.grade_from:
                continue
            g.grade_from = min(g.grade_from, gf)
            g.grade_to   = max(g.grade_to, gt)
            # 到期：取較晚（None 視為永久）
            if g.expires_at is None or exp_dt is None:
                g.expires_at = None
            else:
                g.expires_at = max(g.expires_at, exp_dt)
            merged = True
            break

        if not merged:
            s.add(EntGrant(
                user_id=user_id,
                plan=plan,
                subject=subj_val,    # None = 通配
                grade_from=gf,
                grade_to=gt,
                expires_at=exp_dt
            ))
    return True

def get_entitlement(user_id: Optional[str]) -> Optional[dict]:
    if not user_id:
        return None
    with SessionLocal() as s:
        grants = (
            s.query(EntGrant)
             .filter(EntGrant.user_id == user_id)
             .all()
        )
        if not grants:
            return None
        # 回傳 grants 形狀保持跟舊版一致
        return {
            "grants": [
                {
                    "plan": g.plan,
                    "subjects": ["*"] if g.subject is None else [g.subject],
                    "grade_from": g.grade_from,
                    "grade_to": g.grade_to,
                    "expires_at": int(g.expires_at.timestamp()) if g.expires_at else None,
                }
                for g in grants
            ]
        }

def has_access(user_id: str, subject: str, grade: str | int) -> bool:
    subj = _norm_subject(subject)
    gnum = _parse_grade_to_num(grade)
    if gnum == 0:
        return False
    now = _now()
    with SessionLocal() as s:
        q = (
            s.query(EntGrant)
             .filter(EntGrant.user_id == user_id)
             .filter((EntGrant.expires_at.is_(None)) | (EntGrant.expires_at > now))
             .filter(EntGrant.grade_from <= gnum, EntGrant.grade_to >= gnum)
        )
        # subject 命中：通配(None) 或等於
        q = q.filter((EntGrant.subject.is_(None)) | (EntGrant.subject == subj))
        return s.query(q.exists()).scalar() or False

def current_plan(user_id: str) -> str:
    """推論目前最高等級方案：有 pro grant 視為 pro；否則 starter；都沒有則 free。"""
    with SessionLocal() as s:
        exists_pro = s.query(
            s.query(EntGrant).filter(EntGrant.user_id == user_id, EntGrant.plan == "pro").exists()
        ).scalar()
        if exists_pro:
            return "pro"
        exists_starter = s.query(
            s.query(EntGrant).filter(EntGrant.user_id == user_id, EntGrant.plan == "starter").exists()
        ).scalar()
        return "starter" if exists_starter else "free"
