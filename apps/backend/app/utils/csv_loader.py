# app/utils/csv_loader.py
import os, io, csv
from typing import List, Dict
import boto3

DATA_MODE = os.getenv("DATA_MODE", "local_csv")
CSV_BASE_PATH = os.getenv("CSV_BASE_PATH", "./content/study-game")

# R2（若未來要改回 r2_csv 仍相容；目前不需要可忽略環境變數）
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET = os.getenv("R2_BUCKET")
R2_PREFIX = os.getenv("R2_PREFIX", "study-game/")

_s3 = None
if DATA_MODE == "r2_csv":
    _s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    )

def list_packs() -> List[Dict]:
    """回傳可用的題包清單：[{slug, path, count}]"""
    packs = []
    if DATA_MODE == "local_csv":
        for root, _, files in os.walk(CSV_BASE_PATH):
            for f in files:
                if f.endswith(".csv"):
                    full = os.path.join(root, f)
                    rel = os.path.relpath(full, CSV_BASE_PATH)  # e.g. chinese/grade1/colors-demo.csv
                    slug = rel[:-4]  # 去掉 .csv
                    count = _quick_count_csv(full)
                    packs.append({"slug": slug.replace("\\", "/"), "path": full, "count": count})
    else:
        resp = _s3.list_objects_v2(Bucket=R2_BUCKET, Prefix=R2_PREFIX)
        for obj in resp.get("Contents", []):
            key = obj["Key"]
            if key.endswith(".csv"):
                slug = key[len(R2_PREFIX):-4]
                packs.append({"slug": slug, "path": key, "count": None})
    return sorted(packs, key=lambda x: x["slug"])

def _quick_count_csv(path: str) -> int:
    # 粗估行數（含表頭），只為列表顯示用
    c = 0
    with open(path, "r", encoding="utf-8") as fp:
        for i, _ in enumerate(fp):
            pass
        c = max(0, i)
    return c

def load_questions(slug: str) -> List[Dict]:
    """讀取指定 slug 的 CSV，並正規化成題目列表（不含 image）"""
    if DATA_MODE == "local_csv":
        path = os.path.join(CSV_BASE_PATH, f"{slug}.csv")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        with open(path, "r", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        return _normalize(rows)
    else:
        key = f"{R2_PREFIX}{slug}.csv"
        obj = _s3.get_object(Bucket=R2_BUCKET, Key=key)
        body = obj["Body"].read().decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(body)))
        return _normalize(rows)

def _normalize(rows: List[Dict]) -> List[Dict]:
    """把 CSV 行轉成 Question 結構（不讀 image）"""
    mapped = []
    for i, r in enumerate(rows, start=1):
        mapped.append({
            "id": r.get("id") or str(i),
            "subject": (r.get("subject") or "").strip(),
            "grade": (r.get("grade") or "").strip(),
            "topic": (r.get("topic") or "").strip(),
            "LO": (r.get("LO") or "").strip(),
            "diff": (r.get("diff") or "").strip(),
            "question": (r.get("question") or "").strip(),
            "choices": [
                (r.get("choiceA") or "").strip(),
                (r.get("choiceB") or "").strip(),
                (r.get("choiceC") or "").strip(),
                (r.get("choiceD") or "").strip(),
            ],
            "answer": (r.get("answer") or "").strip(),
            "explain": (r.get("explain") or "").strip(),
        })
    return mapped
