# -*- coding: utf-8 -*-
"""Импорт CSV из IN/SPOD в SQLite без добавления вычисляемых колонок."""

from __future__ import annotations

import csv
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from src import sheet_storage


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
    Импортирует все листы из config в физические таблицы spod_sheet_*.
    При clear=True очищает sheet и все таблицы листов перед загрузкой.
    Возвращает счётчики по коду листа.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    in_dir = root / cfg["paths"]["input_spod"]
    counts: Dict[str, int] = {}

    if clear:
        sheet_storage.drop_all_physical_tables(conn)
        conn.execute("DELETE FROM sheet")
        conn.commit()

    cur = conn.cursor()
    for spec in cfg["sheets"]:
        code = str(spec["code"])
        fn = spec["file"]
        path = in_dir / fn
        if not path.is_file():
            counts[code] = -1
            continue
        headers, data = _read_csv_rows(path)
        if not headers:
            counts[code] = 0
            continue
        json_cols = list(spec.get("json_columns") or [])
        flat_keys = sheet_storage.collect_flat_keys_from_rows(data, json_cols)
        desired = sheet_storage.desired_physical_columns(headers, json_cols, flat_keys)
        sheet_storage.drop_physical_table(conn, code)
        sheet_storage.create_physical_table(conn, code, desired)

        cur.execute(
            "INSERT INTO sheet (code, title, file_name, imported_at, headers_json) VALUES (?,?,?,?,?)",
            (code, spec.get("title") or code, fn, now, json.dumps(headers, ensure_ascii=False)),
        )
        sid = int(cur.execute("SELECT last_insert_rowid()").fetchone()[0])
        for idx, row_dict in enumerate(data):
            sheet_storage.insert_data_row(
                conn,
                root,
                cfg,
                code,
                sid,
                idx,
                float(idx),
                row_dict,
                now,
                replaces_row_id=None,
            )
        counts[code] = len(data)
    conn.commit()
    return counts
