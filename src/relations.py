# -*- coding: utf-8 -*-
"""Построение блоков «связи» для страницы строки."""

from __future__ import annotations

import sqlite3
from typing import Any, Dict, List

from src import sheet_storage

# Порядок полей для короткой подписи кнопки «Редактировать» у множественных связей
_PREVIEW_KEYS = (
    "TOURNAMENT_CODE",
    "CONTEST_CODE",
    "REWARD_CODE",
    "INDICATOR_CODE",
    "GROUP_CODE",
    "FULL_NAME",
)


def _rows(conn: sqlite3.Connection, code: str) -> List[Dict[str, Any]]:
    """Все актуальные строки листа с разобранными ячейками."""
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
        out.append({"id": int(r["id"]), "cells": sheet_storage.row_to_cells(r, headers)})
    return out


def _preview_for_item(cells: Dict[str, str]) -> str:
    """Короткая подпись строки для списка связей (несколько кнопок)."""
    for k in _PREVIEW_KEYS:
        v = (cells.get(k) or "").strip()
        if v:
            return (k + "=" + v)[:96]
    return "строка"


def _link_item(sheet_code: str, row_id: int, cells: Dict[str, str]) -> Dict[str, Any]:
    """Одна связанная строка: куда вести ссылку на редактирование и что показать в JSON."""
    return {
        "sheet_code": sheet_code,
        "row_id": row_id,
        "cells": cells,
        "preview": _preview_for_item(cells),
    }


def build_context_for_row(
    conn: sqlite3.Connection,
    sheet_code: str,
    cells: Dict[str, str],
) -> Dict[str, Any]:
    """
    Возвращает словарь с фрагментами связанных сущностей для шаблона.

    Каждый элемент `items` — словарь с ключами `sheet_code`, `row_id`, `cells`, `preview`
    (последний — для подписи кнопки при нескольких связях одного типа).
    """
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


def _find_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, Any]]:
    for r in _rows(conn, "CONTEST-DATA"):
        if (r["cells"].get("CONTEST_CODE") or "").strip() == contest_code:
            return [_link_item("CONTEST-DATA", r["id"], r["cells"])]
    return []


def _find_group(conn: sqlite3.Connection, contest_code: str, group_code: str) -> List[Dict[str, Any]]:
    res: List[Dict[str, Any]] = []
    for r in _rows(conn, "GROUP"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code and (c.get("GROUP_CODE") or "").strip() == group_code:
            res.append(_link_item("GROUP", r["id"], c))
    return res[:5]


def _find_reward(conn: sqlite3.Connection, reward_code: str) -> List[Dict[str, Any]]:
    for r in _rows(conn, "REWARD"):
        if (r["cells"].get("REWARD_CODE") or "").strip() == reward_code:
            return [_link_item("REWARD", r["id"], r["cells"])]
    return []


def _find_reward_links_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, Any]]:
    res: List[Dict[str, Any]] = []
    for r in _rows(conn, "REWARD-LINK"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(_link_item("REWARD-LINK", r["id"], c))
    return res[:30]


def _find_reward_links_for_reward(conn: sqlite3.Connection, reward_code: str) -> List[Dict[str, Any]]:
    res: List[Dict[str, Any]] = []
    for r in _rows(conn, "REWARD-LINK"):
        c = r["cells"]
        if (c.get("REWARD_CODE") or "").strip() == reward_code:
            res.append(_link_item("REWARD-LINK", r["id"], c))
    return res[:30]


def _find_groups_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, Any]]:
    res: List[Dict[str, Any]] = []
    for r in _rows(conn, "GROUP"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(_link_item("GROUP", r["id"], c))
    return res[:20]


def _find_indicators_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, Any]]:
    res: List[Dict[str, Any]] = []
    for r in _rows(conn, "INDICATOR"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(_link_item("INDICATOR", r["id"], c))
    return res[:20]


def _find_schedule_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, Any]]:
    res: List[Dict[str, Any]] = []
    for r in _rows(conn, "TOURNAMENT-SCHEDULE"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() == contest_code:
            res.append(_link_item("TOURNAMENT-SCHEDULE", r["id"], c))
    return res[:15]


def _find_schedule_rows(conn: sqlite3.Connection, tournament_code: str) -> List[Dict[str, Any]]:
    """Несколько строк расписания с тем же кодом турнира (если в данных есть дубли)."""
    res: List[Dict[str, Any]] = []
    for r in _rows(conn, "TOURNAMENT-SCHEDULE"):
        c = r["cells"]
        if (c.get("TOURNAMENT_CODE") or "").strip() == tournament_code:
            res.append(_link_item("TOURNAMENT-SCHEDULE", r["id"], c))
    return res[:10]
