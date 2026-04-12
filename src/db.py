# -*- coding: utf-8 -*-
"""Инициализация SQLite и путь к файлу БД."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict


def get_db_path(root: Path, cfg: Dict[str, Any]) -> Path:
    """Путь к файлу SQLite в OUT/DB."""
    d = root / cfg["paths"]["output_db_dir"]
    d.mkdir(parents=True, exist_ok=True)
    return d / cfg["database"]["filename"]


def init_schema(conn: sqlite3.Connection) -> None:
    """Создаёт таблицы при первом запуске (актуальная схема с версионированием строк)."""
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sheet (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            title TEXT,
            file_name TEXT NOT NULL,
            imported_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS data_row (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL REFERENCES sheet(id) ON DELETE CASCADE,
            row_index INTEGER NOT NULL,
            sort_key REAL NOT NULL,
            cells_json TEXT NOT NULL,
            consistency_ok INTEGER NOT NULL DEFAULT 1,
            consistency_errors TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT,
            is_current INTEGER NOT NULL DEFAULT 1,
            replaces_row_id INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_data_row_sheet ON data_row(sheet_id);
        CREATE INDEX IF NOT EXISTS idx_data_row_current ON data_row(sheet_id, is_current);
        """
    )
    conn.commit()


def migrate_data_row_versioning(conn: sqlite3.Connection) -> None:
    """
    Перенос старой схемы (без is_current / sort_key) на новую.
    Сохраняет id строк для стабильности ссылок.
    """
    cur = conn.execute("PRAGMA table_info(data_row)")
    names = [r[1] for r in cur.fetchall()]
    if not names:
        return
    if "is_current" in names:
        return
    conn.executescript(
        """
        BEGIN;
        CREATE TABLE data_row_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL REFERENCES sheet(id) ON DELETE CASCADE,
            row_index INTEGER NOT NULL,
            sort_key REAL NOT NULL,
            cells_json TEXT NOT NULL,
            consistency_ok INTEGER NOT NULL DEFAULT 1,
            consistency_errors TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT,
            is_current INTEGER NOT NULL DEFAULT 1,
            replaces_row_id INTEGER
        );
        INSERT INTO data_row_new (id, sheet_id, row_index, sort_key, cells_json, consistency_ok, consistency_errors, updated_at, is_current, replaces_row_id)
        SELECT id, sheet_id, row_index, row_index, cells_json, consistency_ok, consistency_errors, updated_at, 1, NULL FROM data_row;
        DROP TABLE data_row;
        ALTER TABLE data_row_new RENAME TO data_row;
        CREATE INDEX IF NOT EXISTS idx_data_row_sheet ON data_row(sheet_id);
        CREATE INDEX IF NOT EXISTS idx_data_row_current ON data_row(sheet_id, is_current);
        COMMIT;
        """
    )
    conn.commit()


def open_connection(db_path: Path) -> sqlite3.Connection:
    """Подключение с row_factory для удобства шаблонов."""
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
