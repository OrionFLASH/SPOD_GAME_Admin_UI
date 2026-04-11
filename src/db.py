# -*- coding: utf-8 -*-
"""Инициализация SQLite и путь к файлу БД."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def get_db_path(root: Path, cfg: Dict[str, Any]) -> Path:
    """Путь к файлу SQLite в OUT/DB."""
    d = root / cfg["paths"]["output_db_dir"]
    d.mkdir(parents=True, exist_ok=True)
    return d / cfg["database"]["filename"]


def init_schema(conn: sqlite3.Connection) -> None:
    """Создаёт таблицы при первом запуске."""
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
            cells_json TEXT NOT NULL,
            consistency_ok INTEGER NOT NULL DEFAULT 1,
            consistency_errors TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT,
            UNIQUE(sheet_id, row_index)
        );
        CREATE INDEX IF NOT EXISTS idx_data_row_sheet ON data_row(sheet_id);
        """
    )
    conn.commit()


def open_connection(db_path: Path) -> sqlite3.Connection:
    """Подключение с row_factory для удобства шаблонов."""
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn
