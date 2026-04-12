# -*- coding: utf-8 -*-
"""Построение блоков «связи» для страницы строки."""

from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional


def _rows(conn: sqlite3.Connection, code: str) -> List[Dict[str, Any]]:
    cur = conn.execute(
        """
        SELECT dr.id, dr.cells_json
        FROM data_row dr
        JOIN sheet s ON s.id = dr.sheet_id
        WHERE s.code = ? AND dr.is_current = 1
        """,
        (code,),
    )
    out = []
    for r in cur.fetchall():
        out.append({"id": int(r["id"]), "cells": json.loads(r["cells_json"])})
    return out


def build_context_for_row(
    conn: sqlite3.Connection,
    sheet_code: str,
    cells: Dict[str, str],
) -> Dict[str, Any]:
    """Возвращает словарь с фрагментами связанных сущностей для шаблона."""
    ctx: Dict[str, Any] = {"links": []}
    cc = (cells.get("CONTEST_CODE") or "").strip()
    gc = (cells.get("GROUP_CODE") or "").strip()
    rc = (cells.get("REWARD_CODE") or "").strip()
    tc = (cells.get("TOURNAMENT_CODE") or "").strip()

    if sheet_code == "REWARD-LINK" and cc:
        ctx["links"].append({"title": "Конкурс", "items": _find_contest(conn, cc)})
        ctx["links"].append({"title": "Группа (уровень)", "items": _find_group(conn, cc, gc)})
        if rc:
            ctx["links"].append({"title": "Награда", "items": _find_reward(conn, rc)})
    if sheet_code == "CONTEST-DATA" and cc:
        ctx["links"].append({"title": "Связи REWARD-LINK", "items": _find_reward_links_for_contest(conn, cc)})
        ctx["links"].append({"title": "GROUP", "items": _find_groups_for_contest(conn, cc)})
        ctx["links"].append({"title": "INDICATOR", "items": _find_indicators_for_contest(conn, cc)})
        ctx["links"].append({"title": "Расписание", "items": _find_schedule_for_contest(conn, cc)})
    if sheet_code == "REWARD" and rc:
        ctx["links"].append({"title": "REWARD-LINK", "items": _find_reward_links_for_reward(conn, rc)})
    if sheet_code == "GROUP" and cc:
        ctx["links"].append({"title": "Конкурс", "items": _find_contest(conn, cc)})
    if sheet_code == "INDICATOR" and cc:
        ctx["links"].append({"title": "Конкурс", "items": _find_contest(conn, cc)})
    if sheet_code == "TOURNAMENT-SCHEDULE" and cc:
        ctx["links"].append({"title": "Конкурс", "items": _find_contest(conn, cc)})
    if sheet_code == "TOURNAMENT-SCHEDULE" and tc:
        ctx["links"].append({"title": "Та же строка расписания (TOURNAMENT_CODE)", "items": _find_schedule_rows(conn, tc)})
    return ctx


def _find_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, str]]:
    for r in _rows(conn, "CONTEST-DATA"):
        if (r["cells"].get("CONTEST_CODE") or "").strip() == contest_code:
            return [r["cells"]]
    return []


def _find_group(conn: sqlite3.Connection, contest_code: str, group_code: str) -> List[Dict[str, str]]:
    res = []
    for r in _rows(conn, "GROUP"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code and (c.get("GROUP_CODE") or "").strip() == group_code:
            res.append(c)
    return res[:5]


def _find_reward(conn: sqlite3.Connection, reward_code: str) -> List[Dict[str, str]]:
    for r in _rows(conn, "REWARD"):
        if (r["cells"].get("REWARD_CODE") or "").strip() == reward_code:
            return [r["cells"]]
    return []


def _find_reward_links_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, str]]:
    res = []
    for r in _rows(conn, "REWARD-LINK"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(c)
    return res[:30]


def _find_reward_links_for_reward(conn: sqlite3.Connection, reward_code: str) -> List[Dict[str, str]]:
    res = []
    for r in _rows(conn, "REWARD-LINK"):
        c = r["cells"]
        if (c.get("REWARD_CODE") or "").strip() == reward_code:
            res.append(c)
    return res[:30]


def _find_groups_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, str]]:
    res = []
    for r in _rows(conn, "GROUP"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(c)
    return res[:20]


def _find_indicators_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, str]]:
    res = []
    for r in _rows(conn, "INDICATOR"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(c)
    return res[:20]


def _find_schedule_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, str]]:
    res = []
    for r in _rows(conn, "TOURNAMENT-SCHEDULE"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(c)
    return res[:15]


def _find_schedule_rows(conn: sqlite3.Connection, tournament_code: str) -> List[Dict[str, str]]:
    """Несколько строк расписания с тем же кодом турнира (если в данных есть дубли)."""
    res = []
    for r in _rows(conn, "TOURNAMENT-SCHEDULE"):
        c = r["cells"]
        if (c.get("TOURNAMENT_CODE") or "").strip() == tournament_code:
            res.append(c)
    return res[:10]
