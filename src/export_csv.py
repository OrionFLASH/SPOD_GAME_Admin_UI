# -*- coding: utf-8 -*-
"""Экспорт листа из БД в CSV (разделитель ; UTF-8)."""

from __future__ import annotations

import csv
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List


def export_sheet_to_csv(conn: sqlite3.Connection, sheet_code: str, out_path: Path) -> int:
    """Пишет CSV; возвращает число строк данных."""
    cur = conn.execute(
        """
        SELECT dr.cells_json
        FROM data_row dr
        JOIN sheet s ON s.id = dr.sheet_id
        WHERE s.code = ? AND dr.is_current = 1
        ORDER BY dr.sort_key, dr.row_index, dr.id
        """,
        (sheet_code,),
    )
    rows: List[Dict[str, str]] = []
    headers: List[str] = []
    for r in cur.fetchall():
        cells: Dict[str, str] = json.loads(r["cells_json"])
        if not headers:
            headers = list(cells.keys())
        rows.append(cells)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", lineterminator="\n")
        w.writerow(headers)
        for cells in rows:
            w.writerow([cells.get(h, "") for h in headers])
    return len(rows)
