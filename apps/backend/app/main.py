import os, io, csv
from fastapi import Query
from fastapi.responses import JSONResponse

PREFIX = "packs/"
def slug_to_key(slug: str) -> str: return f"{PREFIX}{slug}.csv"

def smart_decode(b: bytes) -> str:
    # 依序嘗試常見編碼：utf-8-sig -> utf-8 -> cp950/big5 -> gb18030
    for enc in ("utf-8-sig", "utf-8", "cp950", "big5", "gb18030"):
        try:
            return b.decode(enc)
        except Exception:
            continue
    # 最後保底：用 utf-8 並替換錯字元
    return b.decode("utf-8", errors="replace")

@app.get("/quiz"); @app.get("/api/quiz")
def get_quiz(slug: str = Query("")):
    if not slug:
        return JSONResponse({"questions": []}, media_type="application/json; charset=utf-8")

    key = slug_to_key(slug)
    try:
        obj = s3.get_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        # 找不到檔案或權限問題 → 回空集合，前端會顯示 No questions
        return JSONResponse({"questions": []}, media_type="application/json; charset=utf-8")

    raw = obj["Body"].read()
    text = smart_decode(raw)

    rows = list(csv.DictReader(io.StringIO(text)))
    qs = []
    for i, r in enumerate(rows, start=1):
        qs.append({
            "id": r.get("id") or str(i),
            "question": r.get("question") or r.get("題目") or "",
            "choiceA": r.get("choiceA") or r.get("A") or "",
            "choiceB": r.get("choiceB") or r.get("B") or "",
            "choiceC": r.get("choiceC") or r.get("C") or "",
            "choiceD": r.get("choiceD") or r.get("D") or "",
            "answer":  r.get("answer") or r.get("答案") or "",
            "explain": r.get("explain") or r.get("解析") or "",
            "type":    r.get("type") or r.get("kind") or "",
            "pairs":   r.get("pairs") or "",
            "image":   r.get("image") or "",
        })

    # 明確用 JSON + UTF-8 回應（避免瀏覽器誤判）
    return JSONResponse({"questions": qs}, media_type="application/json; charset=utf-8")
