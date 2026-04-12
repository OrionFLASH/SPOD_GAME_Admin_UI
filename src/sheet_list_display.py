# -*- coding: utf-8 -*-
"""
Дополнительные поля для таблицы списка строк: названия из связанных листов SQLite.
Индексы строятся один раз на запрос страницы списка.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from src import sheet_storage


def _cells_rows(conn: sqlite3.Connection, sheet_code: str) -> List[Dict[str, str]]:
    """Все строки листа как словари ячеек."""
    t = sheet_storage.physical_table_name(sheet_code)
    headers = sheet_storage.headers_for_sheet(conn, sheet_code)
    if not headers:
        return []
    cur = conn.execute(
        f"""
        SELECT * FROM {sheet_storage.quote_ident(t)}
        WHERE is_current = 1
        ORDER BY sort_key, row_index, id
        """
    )
    out: List[Dict[str, str]] = []
    for r in cur.fetchall():
        out.append(sheet_storage.row_to_cells(r, headers))
    return out


def build_lookup_tables(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    Справочники для подписей в списках:
    - contest_full: CONTEST_CODE -> FULL_NAME
    - reward_full: REWARD_CODE -> FULL_NAME
    - tournaments_for_contest: CONTEST_CODE -> список {TOURNAMENT_CODE, PERIOD_TYPE}
    """
    contest_full: Dict[str, str] = {}
    for c in _cells_rows(conn, "CONTEST-DATA"):
        cc = (c.get("CONTEST_CODE") or "").strip()
        if cc:
            contest_full[cc] = (c.get("FULL_NAME") or "").strip()

    reward_full: Dict[str, str] = {}
    for c in _cells_rows(conn, "REWARD"):
        rc = (c.get("REWARD_CODE") or "").strip()
        if rc:
            reward_full[rc] = (c.get("FULL_NAME") or "").strip()

    tournaments_for_contest: Dict[str, List[Dict[str, str]]] = {}
    for c in _cells_rows(conn, "TOURNAMENT-SCHEDULE"):
        tc = (c.get("TOURNAMENT_CODE") or "").strip()
        cc = (c.get("CONTEST_CODE") or "").strip()
        pt = (c.get("PERIOD_TYPE") or "").strip()
        if cc and tc:
            tournaments_for_contest.setdefault(cc, []).append({"TOURNAMENT_CODE": tc, "PERIOD_TYPE": pt})

    return {
        "contest_full": contest_full,
        "reward_full": reward_full,
        "tournaments_for_contest": tournaments_for_contest,
    }


def _clip(s: str, n: int = 120) -> str:
    s = (s or "").strip()
    if len(s) <= n:
        return s
    return s[: n - 1] + "…"


def display_for_sheet_row(sheet_code: str, cells: Dict[str, str], lu: Dict[str, Any]) -> Dict[str, str]:
    """
    Возвращает ключи для шаблона: primary_key, title_line, relations_line.
    title_line — человекочитаемое имя из строки или из связей; relations_line — коды/подписи турниров и т.п.
    """
    contest_full: Dict[str, str] = lu["contest_full"]
    reward_full: Dict[str, str] = lu["reward_full"]
    tournaments_for_contest: Dict[str, List[Dict[str, str]]] = lu["tournaments_for_contest"]

    title = ""
    relations = ""

    if sheet_code == "CONTEST-DATA":
        cc = (cells.get("CONTEST_CODE") or "").strip()
        pk = cc
        title = (cells.get("FULL_NAME") or "").strip()
        parts: List[str] = []
        for t in tournaments_for_contest.get(cc, [])[:5]:
            tc = t.get("TOURNAMENT_CODE", "")
            pt = t.get("PERIOD_TYPE", "")
            if tc:
                parts.append(f"{tc} — {_clip(pt, 40)}" if pt else tc)
        if parts:
            relations = "Турниры: " + " · ".join(parts)
        return {"primary_key": pk, "title_line": title, "relations_line": relations}

    if sheet_code == "GROUP":
        cc = (cells.get("CONTEST_CODE") or "").strip()
        gc = (cells.get("GROUP_CODE") or "").strip()
        pk = f"{cc} / {gc}" if cc or gc else ""
        cname = contest_full.get(cc, "")
        title = cname or ""
        relations = f"Конкурс: {cc}" + (f" · {cname}" if cname else "")
        return {"primary_key": pk, "title_line": title, "relations_line": relations}

    if sheet_code == "INDICATOR":
        ic = (cells.get("INDICATOR_CODE") or "").strip()
        cc = (cells.get("CONTEST_CODE") or "").strip()
        pk = ic
        title = (cells.get("FULL_NAME") or "").strip()
        cname = contest_full.get(cc, "")
        relations = f"Конкурс: {cc}" + (f" — {_clip(cname, 80)}" if cname else "")
        return {"primary_key": pk, "title_line": title, "relations_line": relations}

    if sheet_code == "REWARD":
        rc = (cells.get("REWARD_CODE") or "").strip()
        pk = rc
        title = (cells.get("FULL_NAME") or "").strip()
        return {"primary_key": pk, "title_line": title, "relations_line": ""}

    if sheet_code == "REWARD-LINK":
        cc = (cells.get("CONTEST_CODE") or "").strip()
        gc = (cells.get("GROUP_CODE") or "").strip()
        rc = (cells.get("REWARD_CODE") or "").strip()
        pk = " · ".join(x for x in (cc, gc, rc) if x)
        cname = contest_full.get(cc, "")
        rname = reward_full.get(rc, "")
        title = " — ".join(x for x in (cname, rname) if x) or pk
        relations = f"Коды: {pk}"
        return {"primary_key": pk, "title_line": _clip(title, 200), "relations_line": relations}

    if sheet_code == "TOURNAMENT-SCHEDULE":
        tc = (cells.get("TOURNAMENT_CODE") or "").strip()
        cc = (cells.get("CONTEST_CODE") or "").strip()
        pk = tc
        title = (cells.get("PERIOD_TYPE") or "").strip() or tc
        cname = contest_full.get(cc, "")
        relations = ""
        if cc:
            relations = "Конкурс: " + cc
            if cname:
                relations += " — " + _clip(cname, 80)
        return {"primary_key": pk, "title_line": title, "relations_line": relations}

    # Запасной вариант для неизвестных листов
    spec_pk = ""
    for k in ("CONTEST_CODE", "REWARD_CODE", "TOURNAMENT_CODE", "GROUP_CODE", "INDICATOR_CODE"):
        if cells.get(k):
            spec_pk = str(cells[k]).strip()
            break
    if not spec_pk and cells:
        spec_pk = str(next(iter(cells.values())))[:80]
    return {"primary_key": spec_pk, "title_line": "", "relations_line": ""}


def search_blob(cells: Dict[str, str], disp: Dict[str, str]) -> str:
    """Объединённая строка для поиска по списку."""
    parts = [json.dumps(cells, ensure_ascii=False)]
    parts.extend(disp.get(k, "") for k in ("primary_key", "title_line", "relations_line"))
    return " ".join(parts).lower()
