# -*- coding: utf-8 -*-
"""
Проверки консистентности между листами (упрощённый набор для админ-панели).
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Set, Tuple

from src import sheet_storage


def _load_sheet_cells(conn: sqlite3.Connection, code: str) -> List[Dict[str, Any]]:
    """Все актуальные строки листа с разобранными ячейками (как раньше из cells_json)."""
    t = sheet_storage.physical_table_name(code)
    headers = sheet_storage.headers_for_sheet(conn, code)
    if not headers:
        return []
    cur = conn.execute(
        f"""
        SELECT * FROM {sheet_storage.quote_ident(t)}
        WHERE is_current = 1
        ORDER BY sort_key, row_index, id
        """
    )
    out: List[Dict[str, Any]] = []
    for r in cur.fetchall():
        cells = sheet_storage.row_to_cells(r, headers)
        out.append({"id": int(r["id"]), "row_index": int(r["row_index"]), "cells": cells})
    return out


def run_all_checks(conn: sqlite3.Connection, *, do_commit: bool = True) -> None:
    """
    Пересчитывает consistency_ok / consistency_errors для всех строк.

    :param do_commit: если False — не вызывать commit (для транзакции вокруг сохранения строки).
    """
    by_code: Dict[str, List[Dict[str, Any]]] = {}
    cur = conn.execute("SELECT code FROM sheet")
    codes = [r[0] for r in cur.fetchall()]
    for c in codes:
        by_code[c] = _load_sheet_cells(conn, c)

    contests: Set[str] = set()
    for row in by_code.get("CONTEST-DATA", []):
        cc = (row["cells"].get("CONTEST_CODE") or "").strip()
        if cc:
            contests.add(cc)

    rewards: Set[str] = set()
    for row in by_code.get("REWARD", []):
        rc = (row["cells"].get("REWARD_CODE") or "").strip()
        if rc:
            rewards.add(rc)

    group_keys: Set[Tuple[str, str]] = set()
    for row in by_code.get("GROUP", []):
        c = (row["cells"].get("CONTEST_CODE") or "").strip()
        g = (row["cells"].get("GROUP_CODE") or "").strip()
        if c and g:
            group_keys.add((c, g))

    def errs_for_row(sheet_code: str, cells: Dict[str, str]) -> List[str]:
        e: List[str] = []
        if sheet_code == "REWARD-LINK":
            cc = (cells.get("CONTEST_CODE") or "").strip()
            gc = (cells.get("GROUP_CODE") or "").strip()
            rc = (cells.get("REWARD_CODE") or "").strip()
            if cc and cc not in contests:
                e.append(f"CONTEST_CODE «{cc}» отсутствует в CONTEST-DATA")
            if rc and rc not in rewards:
                e.append(f"REWARD_CODE «{rc}» отсутствует в REWARD")
            if cc and gc and (cc, gc) not in group_keys:
                e.append(f"Пара (CONTEST_CODE, GROUP_CODE)=({cc},{gc}) не найдена в GROUP")
        if sheet_code == "GROUP":
            cc = (cells.get("CONTEST_CODE") or "").strip()
            if cc and cc not in contests:
                e.append(f"CONTEST_CODE «{cc}» отсутствует в CONTEST-DATA")
        if sheet_code == "INDICATOR":
            cc = (cells.get("CONTEST_CODE") or "").strip()
            if cc and cc not in contests:
                e.append(f"CONTEST_CODE «{cc}» отсутствует в CONTEST-DATA")
        if sheet_code == "TOURNAMENT-SCHEDULE":
            cc = (cells.get("CONTEST_CODE") or "").strip()
            if cc and cc not in contests:
                e.append(f"CONTEST_CODE «{cc}» отсутствует в CONTEST-DATA")
        return e

    cur2 = conn.cursor()
    for sheet_code, rows in by_code.items():
        for row in rows:
            errs = errs_for_row(sheet_code, row["cells"])
            ok = 1 if not errs else 0
            sheet_storage.update_consistency_for_row(conn, sheet_code, row["id"], ok, json.dumps(errs, ensure_ascii=False))
    if do_commit:
        conn.commit()
