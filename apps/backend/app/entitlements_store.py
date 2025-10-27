# apps/backend/app/entitlements_store.py
from __future__ import annotations
import os, sqlite3, time
from typing import Optional

_DB_PATH = os.getenv("ENTITLEMENTS_DB", "/tmp/entitlements.db")

def _conn():
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS entitlements (
            user_id TEXT PRIMARY KEY,
            plan    TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
    """)
    return conn

def set_user_plan(user_id: str, plan: str) -> None:
    ts = int(time.time())
    with _conn() as c:
        c.execute(
            "INSERT INTO entitlements(user_id, plan, updated_at) VALUES(?,?,?) "
            "ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan, updated_at=excluded.updated_at",
            (user_id, plan, ts),
        )

def get_user_plan(user_id: str) -> str:
    with _conn() as c:
        cur = c.execute("SELECT plan FROM entitlements WHERE user_id=?", (user_id,))
        row = cur.fetchone()
        return row[0] if row else "starter"

def delete_user(user_id: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM entitlements WHERE user_id=?", (user_id,))
