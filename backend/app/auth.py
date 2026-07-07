"""User accounts: registration, login and request authentication.

Users live in a local SQLite database. Sessions use an HMAC-signed token;
every user also gets a permanent API key for programmatic access to the
watermark / upscale endpoints.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException

DB_PATH = os.environ.get("AUTH_DB_PATH", os.path.join(os.path.dirname(__file__), "users.db"))
SECRET = os.environ.get("AUTH_SECRET", "")
TOKEN_TTL = 30 * 24 * 3600  # 30 days

_SECRET_FILE = DB_PATH + ".secret"


def _secret() -> bytes:
    global SECRET
    if SECRET:
        return SECRET.encode()
    if os.path.exists(_SECRET_FILE):
        SECRET = open(_SECRET_FILE).read().strip()
    else:
        SECRET = secrets.token_hex(32)
        with open(_SECRET_FILE, "w") as f:
            f.write(SECRET)
    return SECRET.encode()


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "email TEXT UNIQUE NOT NULL,"
        "pw_hash TEXT NOT NULL,"
        "salt TEXT NOT NULL,"
        "api_key TEXT UNIQUE NOT NULL,"
        "created_at INTEGER NOT NULL)"
    )
    return conn


def _hash_pw(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()


def register(email: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="请输入有效邮箱")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
    salt = secrets.token_hex(8)
    api_key = "sk-tj-" + secrets.token_hex(20)
    conn = _db()
    try:
        conn.execute(
            "INSERT INTO users (email, pw_hash, salt, api_key, created_at) VALUES (?,?,?,?,?)",
            (email, _hash_pw(password, salt), salt, api_key, int(time.time())),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="该邮箱已注册，请直接登录")
    finally:
        conn.close()
    return login(email, password)


def login(email: str, password: str) -> Dict[str, Any]:
    email = email.strip().lower()
    conn = _db()
    row = conn.execute(
        "SELECT id, pw_hash, salt, api_key FROM users WHERE email=?", (email,)
    ).fetchone()
    conn.close()
    if not row or not hmac.compare_digest(row[1], _hash_pw(password, row[2])):
        raise HTTPException(status_code=401, detail="邮箱或密码不正确")
    return {"token": _make_token(row[0]), "email": email, "api_key": row[3]}


def _make_token(user_id: int) -> str:
    payload = json.dumps({"uid": user_id, "exp": int(time.time()) + TOKEN_TTL})
    body = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def _verify_token(token: str) -> Optional[int]:
    try:
        body, sig = token.split(".", 1)
        expect = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expect):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if payload.get("exp", 0) < time.time():
            return None
        return int(payload["uid"])
    except Exception:  # noqa: BLE001 - any malformed token is invalid
        return None


def _verify_api_key(key: str) -> Optional[int]:
    conn = _db()
    row = conn.execute("SELECT id FROM users WHERE api_key=?", (key,)).fetchone()
    conn.close()
    return row[0] if row else None


async def require_user(authorization: str = Header(default="")) -> int:
    """FastAPI dependency: accepts a session token or an API key."""
    cred = authorization.removeprefix("Bearer ").strip()
    if not cred:
        raise HTTPException(status_code=401, detail="请先登录")
    uid = _verify_api_key(cred) if cred.startswith("sk-tj-") else _verify_token(cred)
    if uid is None:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    return uid
