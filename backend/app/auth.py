"""User accounts: registration, login and request authentication.

Users live in MySQL when configured, with local SQLite as a fallback.
Sessions use an HMAC-signed token; every user also gets a permanent API key
for programmatic access to the watermark / upscale endpoints.
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

import pymysql
from fastapi import Header, HTTPException

DB_PATH = os.environ.get("AUTH_DB_PATH", os.path.join(os.path.dirname(__file__), "users.db"))
SECRET = os.environ.get("AUTH_SECRET", "")
TOKEN_TTL = 30 * 24 * 3600  # 30 days
DB_HOST = os.environ.get("DB_HOST", "")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USER = os.environ.get("DB_USER", "")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "")

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


class _Db:
    def __init__(self, raw: Any, mysql: bool):
        self.raw = raw
        self.mysql = mysql

    def execute(self, query: str, params: tuple = ()) -> Any:
        if not self.mysql:
            return self.raw.execute(query, params)
        cursor = self.raw.cursor()
        cursor.execute(query.replace("?", "%s"), params)
        return cursor

    def commit(self) -> None:
        self.raw.commit()

    def close(self) -> None:
        self.raw.close()


def _db() -> _Db:
    if DB_HOST:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset="utf8mb4",
            autocommit=False,
        )
        db = _Db(conn, mysql=True)
        db.execute(
            "CREATE TABLE IF NOT EXISTS users ("
            "id BIGINT PRIMARY KEY AUTO_INCREMENT,"
            "email VARCHAR(320) UNIQUE NOT NULL,"
            "pw_hash VARCHAR(128) NOT NULL,"
            "salt VARCHAR(64) NOT NULL,"
            "api_key VARCHAR(128) UNIQUE NOT NULL,"
            "created_at BIGINT NOT NULL)"
            " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        )
        db.execute(
            "CREATE TABLE IF NOT EXISTS `usage` ("
            "user_id BIGINT PRIMARY KEY,"
            "watermark INT NOT NULL DEFAULT 0,"
            "upscale INT NOT NULL DEFAULT 0,"
            "image_set INT NOT NULL DEFAULT 0)"
            " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        )
        _ensure_image_set_column(db, "image_set INT NOT NULL DEFAULT 0")
    else:
        conn = sqlite3.connect(DB_PATH)
        db = _Db(conn, mysql=False)
        db.execute(
            "CREATE TABLE IF NOT EXISTS users ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "email TEXT UNIQUE NOT NULL,"
            "pw_hash TEXT NOT NULL,"
            "salt TEXT NOT NULL,"
            "api_key TEXT UNIQUE NOT NULL,"
            "created_at INTEGER NOT NULL)"
        )
        db.execute(
            "CREATE TABLE IF NOT EXISTS `usage` ("
            "user_id INTEGER PRIMARY KEY,"
            "watermark INTEGER NOT NULL DEFAULT 0,"
            "upscale INTEGER NOT NULL DEFAULT 0,"
            "image_set INTEGER NOT NULL DEFAULT 0)"
        )
        _ensure_image_set_column(db, "image_set INTEGER NOT NULL DEFAULT 0")
    return db


def _ensure_image_set_column(db: "_Db", column_def: str) -> None:
    """Add the image_set column to a pre-existing usage table."""
    try:
        db.execute(f"ALTER TABLE `usage` ADD COLUMN {column_def}")
        db.commit()
    except (pymysql.err.OperationalError, pymysql.err.InternalError, sqlite3.OperationalError):
        pass  # column already exists


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
    except (sqlite3.IntegrityError, pymysql.err.IntegrityError):
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


def record_usage(uid: int, feature: str, count: int = 1) -> None:
    if feature not in {"watermark", "upscale", "image_set"}:
        raise ValueError(f"Unsupported usage feature: {feature}")
    conn = _db()
    try:
        increments = {"watermark": 0, "upscale": 0, "image_set": 0}
        increments[feature] = count
        values = (uid, increments["watermark"], increments["upscale"], increments["image_set"])
        if conn.mysql:
            conn.execute(
                "INSERT INTO `usage` (user_id, watermark, upscale, image_set) VALUES (?,?,?,?) "
                "ON DUPLICATE KEY UPDATE "
                "watermark = watermark + VALUES(watermark), "
                "upscale = upscale + VALUES(upscale), "
                "image_set = image_set + VALUES(image_set)",
                values,
            )
        else:
            conn.execute(
                "INSERT INTO `usage` (user_id, watermark, upscale, image_set) VALUES (?,?,?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET "
                "watermark = `usage`.watermark + excluded.watermark, "
                "upscale = `usage`.upscale + excluded.upscale, "
                "image_set = `usage`.image_set + excluded.image_set",
                values,
            )
        conn.commit()
    finally:
        conn.close()


def get_usage(uid: int) -> Dict[str, int]:
    conn = _db()
    try:
        row = conn.execute(
            "SELECT watermark, upscale, image_set FROM `usage` WHERE user_id=?", (uid,)
        ).fetchone()
    finally:
        conn.close()
    return {
        "watermark": int(row[0]) if row else 0,
        "upscale": int(row[1]) if row else 0,
        "image_set": int(row[2]) if row else 0,
    }


def list_usage() -> list[Dict[str, Any]]:
    conn = _db()
    try:
        rows = conn.execute(
            "SELECT u.email, u.api_key, "
            "COALESCE(x.watermark, 0), COALESCE(x.upscale, 0), COALESCE(x.image_set, 0) "
            "FROM users u LEFT JOIN `usage` x ON x.user_id = u.id "
            "ORDER BY (COALESCE(x.watermark, 0) + COALESCE(x.upscale, 0) "
            "+ COALESCE(x.image_set, 0)) DESC, u.email"
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "email": row[0],
            "api_key": row[1],
            "watermark": int(row[2]),
            "upscale": int(row[3]),
            "image_set": int(row[4]),
        }
        for row in rows
    ]
