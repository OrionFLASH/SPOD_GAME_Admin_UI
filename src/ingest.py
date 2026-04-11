# -*- coding: utf-8 -*-
"""Импорт CSV из IN/SPOD в SQLite без добавления вычисляемых колонок."""

from __future__ import annotations

import csv
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _read_csv_rows(path: Path, delimiter: str = ";") -> tuple[list[str], list[dict[str, str]]]:
    """Читает UTF-8 CSV; все значения — строки."""
    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f, delimiter=delimiter)
        rows_iter = iter(reader)
        try:
            headers = [str(h).strip() for h in next(rows_iter)]
        except StopIteration:
            return [], []
        out: list[dict[str, str]] = []
        for parts in rows_iter:
            if not parts or all(not str(c).strip() for c in parts):
                continue
            d: dict[str, str] = {}
            for i, h in enumerate(headers):
                d[h] = str(parts[i]).strip() if i < len(parts) else ""
            out.append(d)
    return headers, out


def import_all(
    root: Path,
    cfg: Dict[str, Any],
    conn: sqlite3.Connection,
    *,
    clear: bool = True,
) -> Dict[str, int]:
    """
    Импортирует все листы из config.
    При clear=True очищает sheet/data_row перед загрузкой.
    Возвращает счётчики по коду листа.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    in_dir = root / cfg["paths"]["input_spod"]
    counts: Dict[str, int] = {}

    if clear:
        conn.execute("DELETE FROM data_row")
        conn.execute("DELETE FROM sheet")
        conn.commit()

    cur = conn.cursor()
    for spec in cfg["sheets"]:
        code = spec["code"]
        fn = spec["file"]
        path = in_dir / fn
        if not path.is_file():
            counts[code] = -1
            continue
        headers, data = _read_csv_rows(path)
        if not headers:
            counts[code] = 0
            continue
        cur.execute(
            "INSERT INTO sheet (code, title, file_name, imported_at) VALUES (?,?,?,?)",
            (code, spec.get("title") or code, fn, now),
        )
        sid = int(cur.execute("SELECT last_insert_rowid()").fetchone()[0])
        for idx, row_dict in enumerate(data):
            cells = json.dumps(row_dict, ensure_ascii=False)
            cur.execute(
                """
                INSERT INTO data_row (sheet_id, row_index, cells_json, consistency_ok, consistency_errors, updated_at)
                VALUES (?,?,?,?,?,?)
                """,
                (sid, idx, cells, 1, "[]", now),
            )
        counts[code] = len(data)
    conn.commit()
    return counts
