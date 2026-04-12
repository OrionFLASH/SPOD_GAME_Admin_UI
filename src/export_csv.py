# -*- coding: utf-8 -*-
"""Экспорт листа из БД в CSV (разделитель ; UTF-8)."""

from __future__ import annotations

import csv
import sqlite3
from pathlib import Path
from typing import Any, Dict, List

from src import sheet_storage


def export_sheet_to_csv(conn: sqlite3.Connection, sheet_code: str, out_path: Path) -> int:
    """Пишет CSV; возвращает число строк данных."""
    t = sheet_storage.physical_table_name(sheet_code)
    headers = sheet_storage.headers_for_sheet(conn, sheet_code)
    if not headers:
        return 0
    cur = conn.execute(
        f"""
        SELECT {", ".join(sheet_storage.quote_ident(h) for h in headers)}
        FROM {sheet_storage.quote_ident(t)}
        WHERE is_current = 1
        ORDER BY sort_key, row_index, id
        """
    )
    rows: List[Dict[str, str]] = []
    for r in cur.fetchall():
        cells: Dict[str, str] = {}
        for h in headers:
            v = r[h] if h in r.keys() else None
            cells[h] = "" if v is None else str(v)
        rows.append(cells)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(headers)
        for cells in rows:
            w.writerow([cells.get(h, "") for h in headers])
    return len(rows)
