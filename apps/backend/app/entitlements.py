# apps/backend/app/entitlements.py
from __future__ import annotations
from typing import Optional, Dict, Any, List
import time

# === MVP 內存儲存（之後可換 DB）==========================================
# 兼容兩種形態：
#  A) 舊版（單一物件）：
#     {"grade_from":1,"grade_to":1,"subjects":["math","chinese","general"]}
#  B) 新版（多筆授權 grants）：
#     {"grants":[
#        {"plan":"starter","subjects":["math"],"grade_from":1,"grade_to":1,"expires_at":None},
#        {"plan":"pro","subjects":["*"],"grade_from":1,"grade_to":6,"expires_at":None},
#     ]}
_FAKE_ENTS: Dict[str, Any] = {
    "user_001": {"grade_from": 1, "grade_to": 1, "subjects": ["math", "chinese", "general"]},
    "user_002": {"grade_from": 1, "grade_to": 3, "subjects": ["math", "chinese"]},
}

# === 小工具 ===============================================================
_SUBJ_ALIASES = {
    "cn": "chinese", "chi": "chinese", "zh": "chinese",
    "maths": "math", "mathematics": "math",
    "gen": "general", "gs": "general",
}

def _now_ts() -> int:
    return int(time.time())

def _norm_subject(s: Optional[str]) -> str:
    s = (s or "").strip().lower()
    if not s:
        return ""
    return _SUBJ_ALIASES.get(s, s)

def _parse_grade(grade: Optional[str | int]) -> int:
    """接受 'grade1' / 'g1' / 'p1' / '1' / 1 → 1~6。無效回 0。"""
    if grade is None:
        return 0
    if isinstance(grade, int):
        g = grade
    else:
        t = grade.strip().lower()
        # 去掉前綴
        for pre in ("grade", "g", "p", "primary", "yr", "year"):
            if t.startswith(pre):
                t = t[len(pre):]
                break
        # 取數字
        num = ""
        for ch in t:
            if ch.isdigit():
                num += ch
            else:
                break
        g = int(num) if num.isdigit() else 0
    return g if 1 <= g <= 6 else 0

def _ensure_grants_shape(uobj: Dict[str, Any]) -> Dict[str, Any]:
    """把舊版單一物件轉成新版 grants 陣列；已是新版則原樣返回。"""
    if "grants" in uobj and isinstance(uobj["grants"], list):
        return uobj

    grade_from = int(uobj.get("grade_from", 0))
    grade_to   = int(uobj.get("grade_to", 0))
    subs       = uobj.get("subjects") or []
    if not isinstance(subs, list):
        subs = []

    uobj["grants"] = [{
        "plan": "starter",
        "subjects": subs or ["*"],     # 若舊資料沒科目清單就給通配
        "grade_from": grade_from or 1,
        "grade_to": grade_to or 6,
        "expires_at": None,
    }]
    # 清掉舊鍵避免混亂（非必須）
    for k in ("grade_from", "grade_to", "subjects"):
        uobj.pop(k, None)
    return uobj

def _grant_valid_for(grant: Dict[str, Any], subject: str, gnum: int, now_ts: int) -> bool:
    exp = grant.get("expires_at")
    if exp is not None and isinstance(exp, (int, float)) and exp < now_ts:
        return False  # 已過期
    # 科目
    subs = grant.get("subjects") or []
    if subs != ["*"]:
        if subject and subject not in subs:
            return False
    # 年級
    gf = int(grant.get("grade_from", 1))
    gt = int(grant.get("grade_to", 6))
    return gf <= gnum <= gt

# === 對外 API =============================================================
def get_entitlement(user_id: Optional[str]) -> Optional[dict]:
    if not user_id:
        return None
    uobj = _FAKE_ENTS.get(user_id)
    if not uobj:
        return None
    return _ensure_grants_shape(uobj)

def has_access(user_id: str, subject: str, grade: str | int) -> bool:
    """
    規則：
      - 任何一筆有效 grant 命中（未過期 + 科目吻合/通配 + 年級區間包含）即 True
      - pro 與 starter 在命中邏輯上一樣，只是 pro 通常是 subjects=['*']、grade 1~6
    """
    uobj = get_entitlement(user_id)
    if not uobj:
        return False

    subject = _norm_subject(subject)
    gnum = _parse_grade(grade)
    if gnum == 0:
        return False

    now_ts = _now_ts()
    for grant in uobj.get("grants", []):
        if _grant_valid_for(grant, subject, gnum, now_ts):
            return True
    return False

def add_access(user_id: str, scope: dict, expires_at: Optional[int] = None) -> bool:
    """
    scope 範例：
      - {"plan":"pro"}  → 視為 subjects=['*'], grade 1~6
      - {"plan":"starter","subject":"math","grade":"grade1"}
      - 也可給區間：{"plan":"starter","subject":"chinese","grade_from":1,"grade_to":3}
    行為：
      - 把新授權合併到 grants；若相同 plan/科目/年級重疊，則擴大區間、延長到期日（取較晚）
    """
    if not user_id:
        return False

    plan = (scope.get("plan") or "starter").lower()
    subj = _norm_subject(scope.get("subject"))
    g_from = scope.get("grade_from")
    g_to   = scope.get("grade_to")
    g_one  = scope.get("grade")

    # 規範化年級
    if plan == "pro":
        subj_list = ["*"]
        gf, gt = 1, 6
    else:
        subj_list = [subj] if subj else ["*"]
        if g_one is not None:
            gf = gt = _parse_grade(g_one)
        else:
            gf = _parse_grade(g_from)
            gt = _parse_grade(g_to)
        if not (1 <= gf <= 6):
            return False
        if not (1 <= gt <= 6):
            gt = gf
        if gf > gt:
            gf, gt = gt, gf

    # 拿到或建立使用者物件
    uobj = _FAKE_ENTS.get(user_id)
    if not uobj:
        uobj = {"grants": []}
        _FAKE_ENTS[user_id] = uobj
    else:
        uobj = _ensure_grants_shape(uobj)

    # 準備新 grant
    new_g = {
        "plan": plan,
        "subjects": subj_list,
        "grade_from": gf,
        "grade_to": gt,
        "expires_at": expires_at,  # None = 永久
    }

    # 合併策略：同 plan、同 subjects（完全相等或任一為 ['*']）、區間相交即合併
    grants: List[Dict[str, Any]] = uobj.get("grants", [])
    merged = False
    for g in grants:
        if g.get("plan") != plan:
            continue
        # subjects 兼容：若任何一邊是 ['*'] 視為相容
        s_old = g.get("subjects") or []
        if s_old != ["*"] and new_g["subjects"] != ["*"] and set(s_old) != set(new_g["subjects"]):
            continue
        # 年級相交或相鄰即合併
        gf_old, gt_old = int(g.get("grade_from", 1)), int(g.get("grade_to", 6))
        if gt_old + 1 < gf or gt + 1 < gf_old:
            continue
        # 合併
        g["subjects"]   = ["*"] if (s_old == ["*"] or new_g["subjects"] == ["*"]) else sorted(list(set(s_old) | set(new_g["subjects"])))
        g["grade_from"] = min(gf_old, gf)
        g["grade_to"]   = max(gt_old, gt)
        # 到期日：取較晚（None 視為永久）
        old_exp, new_exp = g.get("expires_at"), new_g.get("expires_at")
        if old_exp is None or new_exp is None:
            g["expires_at"] = None
        else:
            g["expires_at"] = max(int(old_exp), int(new_exp))
        merged = True
        break

    if not merged:
        grants.append(new_g)

    uobj["grants"] = grants
    _FAKE_ENTS[user_id] = uobj
    return True
