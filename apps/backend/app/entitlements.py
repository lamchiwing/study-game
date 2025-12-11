# apps/backend/app/entitlements.py
from __future__ import annotations

from typing import Optional, Dict, Any
from datetime import datetime, timezone

from database import SessionLocal          # ✅ 改：由 apps/backend/database.py 引入
from .models import Customer, EntGrant

# === 方案旗標（前端廣告/報告/可見年級判斷用） ==========================
PLANS: Dict[str, Dict[str, Any]] = {
    "free": {
        "max_students": 1,
        "report_enabled": False,
        # ✅ 免費只允許一個年級（小一）
        "allowed_grades": ["grade1"],
        "ads_enabled": True,   # 免費顯示廣告
        "name": "Free",
    },
    "starter": {
        "max_students": 1,
        "report_enabled": True,
        # Starter/Pro 預設支援 1–6 年級（實際可見題包仍由授權 grants 決定）
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


def canonical_grade_str(grade: str | int | None) -> str:
    """
    將輸入年級正規化為 'gradeN' 字串；無效回傳空字串。
    例：'G1'/'p1'/'1' → 'grade1'
    """
    n = _parse_grade_to_num(grade)
    return f"grade{n}" if n else ""


def grade_allowed(plan: str, grade: str | int) -> bool:
    """
    只根據方案本身的可見列表做 UI/入口層級的判斷；
    真正的授權仍以 grants（has_access）為準。
    """
    p = (plan or "free").lower()
    cg = canonical_grade_str(grade)
    allowed = PLANS.get(p, PLANS["free"]).get("allowed_grades", [])
    # 空陣列視為不限制（此專案中都給定了清單）
    return (not allowed) or (cg in allowed)


# === 工具 ======================================================
_SUBJ_ALIASES = {
    "cn": "chinese",
    "chi": "chinese",
    "zh": "chinese",
    "maths": "math",
    "mathematics": "math",
    "gen": "general",
    "gs": "general",
}


def _norm_subject(s: Optional[str]) -> str:
    s = (s or "").strip().lower()
    return _SUBJ_ALIASES.get(s, s) if s else ""


def _parse_grade_to_num(grade: Optional[str | int]) -> int:
    """接受 'grade1' / 'g1' / 'p1' / '1' / 1 → 1..6；無效回 0。"""
    if grade is None:
        return 0
    if isinstance(grade, int):
        g = grade
    else:
        t = grade.strip().lower()
        for pre in ("grade", "g", "p", "primary", "yr", "year"):
            if t.startswith(pre):
                t = t[len(pre):]
                break
        digits = "".join(ch for ch in t if ch.isdigit())
        g = int(digits) if digits.isdigit() else 0
    return g if 1 <= g <= 6 else 0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_subject_grade_from_slug(slug: str) -> tuple[str, int]:
    """
    讓 has_access 亦可接受 slug：
      - "chinese/grade3/reading-a" → ("chinese", 3)
      - "math/grade5"             → ("math", 5)
    """
    s = (slug or "").strip().strip("/")
    if not s:
        return "", 0
    parts = s.split("/")
    subject = parts[0] if parts else ""
    grade_raw: str | int | None = None
    if len(parts) > 1:
        grade_raw = parts[1]  # "grade3" 之類
    return _norm_subject(subject), _parse_grade_to_num(grade_raw)


# === 對外 API：顧客 / 授權（存取 Postgres） ======================
def upsert_customer(user_id: str, email: str | None, stripe_customer_id: str | None):
    with SessionLocal() as s, s.begin():
        found = s.get(Customer, user_id)
        if found:
            if email is not None:
                found.email = email
            if stripe_customer_id is not None:
                found.stripe_customer_id = stripe_customer_id
        else:
            s.add(
                Customer(
                    user_id=user_id,
                    email=email,
                    stripe_customer_id=stripe_customer_id,
                )
            )


def add_access(
    user_id: str,
    scope: dict,
    expires_at: Optional[int | datetime] = None,
) -> bool:
    """
    scope 範例：
      - {"plan":"pro"}  → Pro 通配（科目不限、年級 1..6）
      - {"plan":"starter","subject":"math","grade":"grade1"}
      - {"plan":"pro","subject":"chinese","grade":"grade3"}（Pro 自選 2 組時各寫一筆）
      - 區間也可：{"plan":"starter","subject":"chinese","grade_from":1,"grade_to":3}
    合併規則：相同 plan + 相同 subject（或通配 None）且年級區間相交/相鄰 → 合併
    """
    if not user_id:
        return False

    plan = (scope.get("plan") or "starter").lower()
    subj = _norm_subject(scope.get("subject"))
    g_from = scope.get("grade_from")
    g_to = scope.get("grade_to")
    g_one = scope.get("grade")

    # 年級規範化
    if plan == "pro" and not subj and not g_from and not g_to and not g_one:
        # 通配 Pro：subject=None, grade 1..6
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

    # 到期時間標準化
    if expires_at is None:
        exp_dt: Optional[datetime] = None
    elif isinstance(expires_at, int):
        exp_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc)
    else:
        exp_dt = expires_at

    # 合併/新增
    with SessionLocal() as s, s.begin():
        q = s.query(EntGrant).filter(
            EntGrant.user_id == user_id,
            EntGrant.plan == plan,
        )
        if subj_val is None:
            q = q.filter(EntGrant.subject.is_(None))
        else:
            q = q.filter(EntGrant.subject == subj_val)

        merged = False
        for g in q.all():
            # 年級區間相交或相鄰才合併
            if g.grade_to + 1 < gf or gt + 1 < g.grade_from:
                continue
            g.grade_from = min(g.grade_from, gf)
            g.grade_to = max(g.grade_to, gt)
            # 到期：取較晚（None 視為永久）
            if g.expires_at is None or exp_dt is None:
                g.expires_at = None
            else:
                g.expires_at = max(g.expires_at, exp_dt)
            merged = True
            break

        if not merged:
            s.add(
                EntGrant(
                    user_id=user_id,
                    plan=plan,
                    subject=subj_val,  # None = 通配
                    grade_from=gf,
                    grade_to=gt,
                    expires_at=exp_dt,
                )
            )
    return True


def get_entitlement(user_id: Optional[str]) -> Optional[dict]:
    if not user_id:
        return None
    with SessionLocal() as s:
        grants = s.query(EntGrant).filter(EntGrant.user_id == user_id).all()
        if not grants:
            return None
        # 與舊版回傳結構相容
        return {
            "grants": [
                {
                    "plan": g.plan,
                    "subjects": ["*"] if g.subject is None else [g.subject],
                    "grade_from": g.grade_from,
                    "grade_to": g.grade_to,
                    "expires_at": int(g.expires_at.timestamp())
                    if g.expires_at
                    else None,
                }
                for g in grants
            ]
        }


def has_access(
    user_id: str,
    subject_or_slug: str,
    grade: str | int | None = None,
) -> bool:
    """
    真正的授權判斷：必須命中一筆有效 grant（未過期 + subject 相容 + 年級區間包含）。

    ✅ 兼容兩種用法：
      1) has_access(user_id, "chinese", "grade3")
      2) has_access(user_id, "chinese/grade3/reading-a")（第二參數當 slug，用唔傳 grade）
    """
    if not user_id:
        return False

    # 如果 grade 無傳，而且 subject_or_slug 裏面有 "/"，當 slug 用：
    subj = ""
    gnum = 0
    if grade is None and "/" in (subject_or_slug or ""):
        subj, gnum = _parse_subject_grade_from_slug(subject_or_slug)
    else:
        subj = _norm_subject(subject_or_slug)
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
    if not user_id:
        return "free"

    with SessionLocal() as s:
        has_pro = s.query(
            s.query(EntGrant)
            .filter(EntGrant.user_id == user_id, EntGrant.plan == "pro")
            .exists()
        ).scalar()
        if has_pro:
            return "pro"

        has_starter = s.query(
            s.query(EntGrant)
            .filter(EntGrant.user_id == user_id, EntGrant.plan == "starter")
            .exists()
        ).scalar()

        return "starter" if has_starter else "free"
