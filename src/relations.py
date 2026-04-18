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
    """
    Короткая подпись строки для бокового меню «Связи» и карточек (несколько ссылок).
    В UI выводится только значение с префиксом «: » (без имени поля и «=»).
    """
    for k in _PREVIEW_KEYS:
        v = (cells.get(k) or "").strip()
        if v:
            # Формат «: значение» по соглашению с макетом бокового меню.
            text = ": " + v
            return text[:96] if len(text) > 96 else text
    return "строка"


def _group_link_preview(cells: Dict[str, str]) -> str:
    """
    Подпись ссылки на строку GROUP: «GROUP_CODE : GROUP_VALUE».
    Уникальность строки GROUP в данных — тройка (CONTEST_CODE, GROUP_CODE, GROUP_VALUE).
    """
    gc = (cells.get("GROUP_CODE") or "").strip()
    gv = (cells.get("GROUP_VALUE") or "").strip()
    label = f"{gc} : {gv}" if (gc or gv) else ""
    if not label:
        label = "—"
    text = ": " + label
    return text[:120] if len(text) > 120 else text


def _reward_link_preview(cells: Dict[str, str]) -> str:
    """
    Подпись ссылки на строку REWARD-LINK в боковом меню «Связи»: «GROUP_CODE : REWARD_CODE».
    Общий _preview_for_item не подходит: там раньше по порядку попадает CONTEST_CODE и в подписи
    оказывается только код конкурса вместо пары группа — награда.
    """
    gc = (cells.get("GROUP_CODE") or "").strip()
    rc = (cells.get("REWARD_CODE") or "").strip()
    label = f"{gc} : {rc}" if (gc or rc) else ""
    if not label:
        label = "—"
    text = ": " + label
    return text[:120] if len(text) > 120 else text


def _link_item(sheet_code: str, row_id: int, cells: Dict[str, str]) -> Dict[str, Any]:
    """Одна связанная строка: куда вести ссылку на редактирование и что показать в JSON."""
    if sheet_code == "GROUP":
        prev = _group_link_preview(cells)
    elif sheet_code == "REWARD-LINK":
        prev = _reward_link_preview(cells)
    else:
        prev = _preview_for_item(cells)
    return {
        "sheet_code": sheet_code,
        "row_id": row_id,
        "cells": cells,
        "preview": prev,
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
    contest_codes = _resolve_contest_codes(conn, sheet_code, cells)
    rc = (cells.get("REWARD_CODE") or "").strip()
    tc = (cells.get("TOURNAMENT_CODE") or "").strip()

    contest_items = _merge_link_lists(*[_find_contest(conn, cc) for cc in contest_codes])
    if contest_items:
        ctx["links"].append({"title": "Конкурс", "items": contest_items})

    # Полный комплект связей по CONTEST_CODE(ам): REWARD-LINK, GROUP, INDICATOR, TOURNAMENT-SCHEDULE.
    rl_items = _merge_link_lists(*[_find_reward_links_for_contest(conn, cc) for cc in contest_codes])
    if rl_items:
        ctx["links"].append({"title": "Связи REWARD-LINK", "items": rl_items})

    # Награды конкурса определяем через REWARD-LINK:
    # CONTEST_CODE -> REWARD-LINK -> REWARD_CODE -> REWARD.
    reward_items_from_links = _merge_link_lists(*[_find_rewards_for_contest(conn, cc) for cc in contest_codes])
    if reward_items_from_links:
        ctx["links"].append({"title": "Награды", "items": reward_items_from_links})

    group_items = _merge_link_lists(*[_find_groups_for_contest(conn, cc) for cc in contest_codes])
    if group_items:
        ctx["links"].append({"title": "GROUP", "items": group_items})

    ind_items = _merge_link_lists(*[_find_indicators_for_contest(conn, cc) for cc in contest_codes])
    if ind_items:
        ctx["links"].append({"title": "INDICATOR", "items": ind_items})

    sch_items = _merge_link_lists(*[_find_schedule_for_contest(conn, cc) for cc in contest_codes])
    if sch_items:
        ctx["links"].append({"title": "Расписание", "items": sch_items})

    # Дополнительно: для REWARD и REWARD-LINK всегда показываем прямую связь на строку награды.
    if rc:
        reward_items = _find_reward(conn, rc)
        if reward_items:
            ctx["links"].append({"title": "Награда", "items": reward_items})

    if sheet_code == "TOURNAMENT-SCHEDULE" and tc:
        same_schedule_items = _find_schedule_rows(conn, tc)
        if same_schedule_items:
            ctx["links"].append(
                {"title": "Та же строка расписания (TOURNAMENT_CODE)", "items": same_schedule_items}
            )
    return ctx


def _resolve_contest_codes(
    conn: sqlite3.Connection, sheet_code: str, cells: Dict[str, str]
) -> List[str]:
    """
    Определяет CONTEST_CODE текущей сущности:
    - напрямую из строки (если поле есть),
    - для REWARD — транзитивно через REWARD-LINK по REWARD_CODE.
    """
    direct = (cells.get("CONTEST_CODE") or "").strip()
    codes: List[str] = [direct] if direct else []
    if sheet_code == "REWARD":
        rc = (cells.get("REWARD_CODE") or "").strip()
        if rc:
            for item in _find_reward_links_for_reward(conn, rc):
                cc = (item.get("cells", {}).get("CONTEST_CODE") or "").strip()
                if cc and cc not in codes:
                    codes.append(cc)
    return codes


def _merge_link_lists(*lists: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Склейка списков связей без дублей по (sheet_code, row_id), с сохранением порядка."""
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for arr in lists:
        for item in arr or []:
            key = (str(item.get("sheet_code") or ""), int(item.get("row_id") or 0))
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
    return out


def _find_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, Any]]:
    for r in _rows(conn, "CONTEST-DATA"):
        if (r["cells"].get("CONTEST_CODE") or "").strip() == contest_code:
            return [_link_item("CONTEST-DATA", r["id"], r["cells"])]
    return []


def _find_group(
    conn: sqlite3.Connection,
    contest_code: str,
    group_code: str,
    group_value: str | None = None,
) -> List[Dict[str, Any]]:
    """
    Строки GROUP по конкурсу и коду группы.
    Если задан group_value — только строка с тем же GROUP_VALUE (точная тройка с CONTEST_CODE).
    Иначе — все строки с данной парой (CONTEST_CODE, GROUP_CODE) (например, из REWARD-LINK без GROUP_VALUE).
    """
    res: List[Dict[str, Any]] = []
    gv_key = (group_value or "").strip()
    for r in _rows(conn, "GROUP"):
        c = r["cells"]
        if (c.get("CONTEST_CODE") or "").strip() != contest_code:
            continue
        if (c.get("GROUP_CODE") or "").strip() != group_code:
            continue
        if gv_key and (c.get("GROUP_VALUE") or "").strip() != gv_key:
            continue
        res.append(_link_item("GROUP", r["id"], c))
    return res[:40]


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


def _find_rewards_for_contest(conn: sqlite3.Connection, contest_code: str) -> List[Dict[str, Any]]:
    """
    Связанные награды конкурса через REWARD-LINK.
    Нужен отдельный блок «Награды» в меню «Связи», даже когда у текущей строки нет REWARD_CODE.
    """
    out: List[Dict[str, Any]] = []
    seen_codes: set[str] = set()
    for item in _find_reward_links_for_contest(conn, contest_code):
        rc = (item.get("cells", {}).get("REWARD_CODE") or "").strip()
        if not rc or rc in seen_codes:
            continue
        seen_codes.add(rc)
        out.extend(_find_reward(conn, rc))
    return out[:30]


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
