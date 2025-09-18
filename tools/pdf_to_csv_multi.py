# tools/pdf_to_csv_multi.py
# 用法：
#  python tools/pdf_to_csv_multi.py --type mcq  input.pdf  content/questions/mcq.csv
#  python tools/pdf_to_csv_multi.py --type tf   input.pdf  content/questions/tf.csv
#  python tools/pdf_to_csv_multi.py --type fitb input.pdf  content/questions/fitb.csv
import argparse, re, sys, fitz, pandas as pd

ap = argparse.ArgumentParser()
ap.add_argument("--type", required=True, choices=["mcq","tf","fitb"], help="題型：mcq多選、tf是非、fitb填充")
ap.add_argument("pdf")
ap.add_argument("outcsv")
ap.add_argument("--subject", default="general")
ap.add_argument("--grade", type=int, default=3)
ap.add_argument("--topic", default="mixed")
ap.add_argument("--lo", default="LO-GEN")
ap.add_argument("--diff", type=int, default=1)
args = ap.parse_args()

qid_re = re.compile(r"^\s*(\d+)[\.\)．]\s*(.+)$")
opt_re = re.compile(r"^\s*([A-DＡ-Ｄ])[\.\)\：:．]\s*(.+)$")
ans_re = re.compile(r"(?:答案|Answer)\s*[:：]\s*([A-DＡ-ＤTF真對错错對是非TrueFalse]+)", re.I)

def norm_choice(c): return {"Ａ":"A","Ｂ":"B","Ｃ":"C","Ｄ":"D","真":"T","對":"T","错":"F","錯":"F","是":"T","非":"F"}.get(c, c.upper())

rows, qbuf, opts = [], None, {}

def flush():
    global qbuf, opts
    if not qbuf: 
        return
    row = {
        "id": f"Q{len(rows)+1:05d}",
        "type": args.type,
        "subject": args.subject,
        "grade": args.grade,
        "topic": args.topic,
        "lo": args.lo,
        "diff": args.diff,
        "question": qbuf.strip(),
        "choiceA": "", "choiceB": "", "choiceC": "", "choiceD": "",
        "answer": "", "explain": ""
    }
    if args.type == "mcq":
        # 至少 A/B
        if len([k for k in opts.keys() if k in ["A","B","C","D"]]) < 2:
            qbuf, opts = None, {}
            return
        row.update({
            "choiceA": opts.get("A",""), "choiceB": opts.get("B",""),
            "choiceC": opts.get("C",""), "choiceD": opts.get("D",""),
            "answer": opts.get("_ans","").upper()[:1]
        })
    elif args.type == "tf":
        # 用固定 True/False；答案轉 T/F
        row["choiceA"] = "True"
        row["choiceB"] = "False"
        a = opts.get("_ans","").strip().lower()
        if a in ["t","true","是","對","真"]: row["answer"] = "T"
        elif a in ["f","false","否","錯","假"]: row["answer"] = "F"
    elif args.type == "fitb":
        # 答案以原文保存（可用 | 分隔多個正確答案）
        row["answer"] = opts.get("_ans","").strip()
    rows.append(row)
    qbuf, opts = None, {}

doc = fitz.open(args.pdf)
for page in doc:
    text = page.get_text("text")
    for raw in text.splitlines():
        line = raw.strip()
        if not line: 
            continue
        # 新題
        m_q = qid_re.match(line)
        if m_q:
            flush()
            qbuf = m_q.group(2)
            continue
        # 選項（只對 mcq 生效）
        if args.type == "mcq":
            m_o = opt_re.match(line)
            if m_o:
                opts[norm_choice(m_o.group(1))] = m_o.group(2).strip()
                continue
        # 答案
        m_a = ans_re.search(line)
        if m_a:
            opts["_ans"] = norm_choice(m_a.group(1))
            continue
        # 補題幹
        if qbuf is not None:
            qbuf += " " + line

flush()
df = pd.DataFrame(rows, columns=[
    "id","type","subject","grade","topic","lo","diff",
    "question","choiceA","choiceB","choiceC","choiceD","answer","explain"
])
df.to_csv(args.outcsv, index=False, encoding="utf-8-sig")
print(f"✅ saved {len(df)} rows -> {args.outcsv}")
