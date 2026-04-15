# -*- coding: utf-8 -*-
"""Инициализация SQLite и путь к файлу БД."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict


def get_db_path(root: Path, cfg: Dict[str, Any]) -> Path:
    """Путь к файлу SQLite в OUT/DB."""
    d = root / cfg["paths"]["output_db_dir"]
    d.mkdir(parents=True, exist_ok=True)
    return d / cfg["database"]["filename"]


def init_schema(conn: sqlite3.Connection) -> None:
    """
    Создаёт таблицы при первом запуске.

    Данные листов хранятся в отдельных таблицах spod_sheet_* (см. sheet_storage.py),
    реестр листов — sheet; устаревшая общая таблица data_row не используется.
    """
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sheet (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            title TEXT,
            file_name TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            headers_json TEXT NOT NULL DEFAULT '[]'
        );
        """
    )
    conn.commit()


def ensure_wizard_draft_table(conn: sqlite3.Connection) -> None:
    """
    Черновики мастера «Создать конкурс»: статус EDIT, JSON состояния, без вставки в строки листов.
    """
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS wizard_draft (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            draft_uuid TEXT NOT NULL UNIQUE,
            step_index INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'EDIT',
            state_json TEXT NOT NULL,
            contest_code_preview TEXT,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_wizard_draft_status ON wizard_draft(status, updated_at);
        """
    )
    conn.commit()


def ensure_row_edit_draft_table(conn: sqlite3.Connection) -> None:
    """
    Черновики правок карточки строки: промежуточный статус EDIT до финального сохранения версии.
    """
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS row_edit_draft (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_code TEXT NOT NULL,
            row_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'EDIT',
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(sheet_code, row_id)
        );
        CREATE INDEX IF NOT EXISTS idx_row_edit_draft_status ON row_edit_draft(status, updated_at);
        """
    )
    conn.commit()


def migrate_legacy_data_row_removed(conn: sqlite3.Connection) -> None:
    """
    Совместимость: если осталась старая таблица data_row — удаляем и очищаем реестр.
    Полная логика в sheet_storage.migrate_legacy_data_row.
    """
    from src import sheet_storage  # noqa: PLC0415 — избежать циклического импорта на уровне модуля

    sheet_storage.migrate_legacy_data_row(conn)


def migrate_sheet_add_headers_json(conn: sqlite3.Connection) -> None:
    """Добавляет колонку headers_json в sheet для БД, созданных до её появления."""
    cur = conn.execute("PRAGMA table_info(sheet)")
    names = [r[1] for r in cur.fetchall()]
    if names and "headers_json" not in names:
        conn.execute("ALTER TABLE sheet ADD COLUMN headers_json TEXT NOT NULL DEFAULT '[]'")
        conn.commit()


def open_connection(db_path: Path) -> sqlite3.Connection:
    """Подключение с row_factory для удобства шаблонов; включает внешние ключи для SQLite."""
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
    except sqlite3.Error:
        pass
    return conn
