# -*- coding: utf-8 -*-
"""
Дополнительные поля для таблицы списка строк: названия из связанных листов SQLite.
Индексы строятся один раз на запрос страницы списка.

Глобальные фильтры списков (параметры gf_*, пересечение по CONTEST_CODE) — в модуле global_sheet_filters и в app.sheet_list.

Лист CONTEST-DATA (список «Конкурсы»): код конкурса, наименование, тип конкурса (CONTEST_TYPE); колонка «Связи» не показывается
(текст турниров/наград остаётся в search_blob для поиска).

Лист INDICATOR: CONTEST_CODE, название конкурса из CONTEST-DATA, INDICATOR_ADD_CALC_TYPE, INDICATOR_CODE; в «Связи» — REWARD-LINK и турниры.

Лист REWARD: «Награда» — FULL_NAME награды; «Название / описание» — FULL_NAME конкурса(ов) по REWARD-LINK; GROUP_CODE в таблице.

Лист REWARD-LINK: код награды, GROUP_CODE, названия награды и конкурса; CONTEST_CODE в поиске.

Лист TOURNAMENT-SCHEDULE: период, конкурс, сезон из TARGET_TYPE, связанные награды из REWARD-LINK.

Лист GROUP (список): одна строка на CONTEST_CODE; «Связи» — уровни GROUP_CODE : GROUP_VALUE.
"""

from __future__ import annotations

import json
import sqlite3
from collections import defaultdict
from typing import Any, Dict, List

from src import sheet_storage, spod_json


def target_type_season_code(raw: str) -> str:
    """Извлекает seasonCode из ячейки JSON колонки TARGET_TYPE (лист TOURNAMENT-SCHEDULE)."""
    obj, _err = spod_json.try_parse_cell(raw)
    if not isinstance(obj, dict):
        return ""
    v = obj.get("seasonCode")
    if v is None:
        return ""
    return str(v).strip()


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
    - reward_links_by_reward: REWARD_CODE -> список связей REWARD-LINK (CONTEST_CODE, GROUP_CODE)
    - reward_type_by_reward: REWARD_CODE -> REWARD_TYPE (для фильтра списка REWARD-LINK)
    - schedule_season_codes: уникальные seasonCode из TARGET_TYPE (для фильтра списка расписания)
    """
    contest_full: Dict[str, str] = {}
    for c in _cells_rows(conn, "CONTEST-DATA"):
        cc = (c.get("CONTEST_CODE") or "").strip()
        if cc:
            contest_full[cc] = (c.get("FULL_NAME") or "").strip()

    reward_full: Dict[str, str] = {}
    reward_type_by_reward: Dict[str, str] = {}
    for c in _cells_rows(conn, "REWARD"):
        rc = (c.get("REWARD_CODE") or "").strip()
        if rc:
            reward_full[rc] = (c.get("FULL_NAME") or "").strip()
            reward_type_by_reward[rc] = (c.get("REWARD_TYPE") or "").strip()

    tournaments_for_contest: Dict[str, List[Dict[str, str]]] = {}
    schedule_season_codes: List[str] = []
    seen_season: set = set()
    for c in _cells_rows(conn, "TOURNAMENT-SCHEDULE"):
        tc = (c.get("TOURNAMENT_CODE") or "").strip()
        cc = (c.get("CONTEST_CODE") or "").strip()
        pt = (c.get("PERIOD_TYPE") or "").strip()
        if cc and tc:
            tournaments_for_contest.setdefault(cc, []).append({"TOURNAMENT_CODE": tc, "PERIOD_TYPE": pt})
        scode = target_type_season_code(c.get("TARGET_TYPE") or "")
        if scode and scode not in seen_season:
            seen_season.add(scode)
            schedule_season_codes.append(scode)
    schedule_season_codes.sort()

    # REWARD-LINK: по конкурсу (INDICATOR) и по награде (список REWARD).
    reward_links_by_contest: Dict[str, List[Dict[str, str]]] = {}
    reward_links_by_reward: Dict[str, List[Dict[str, str]]] = {}
    for c in _cells_rows(conn, "REWARD-LINK"):
        cc_l = (c.get("CONTEST_CODE") or "").strip()
        rc_l = (c.get("REWARD_CODE") or "").strip()
        gc_l = (c.get("GROUP_CODE") or "").strip()
        entry = {
            "CONTEST_CODE": cc_l,
            "GROUP_CODE": gc_l,
            "REWARD_CODE": rc_l,
        }
        if cc_l:
            reward_links_by_contest.setdefault(cc_l, []).append(entry)
        if rc_l:
            reward_links_by_reward.setdefault(rc_l, []).append(entry)

    return {
        "contest_full": contest_full,
        "reward_full": reward_full,
        "tournaments_for_contest": tournaments_for_contest,
        "reward_links_by_contest": reward_links_by_contest,
        "reward_links_by_reward": reward_links_by_reward,
        "reward_type_by_reward": reward_type_by_reward,
        "schedule_season_codes": schedule_season_codes,
    }


def _clip(s: str, n: int = 120) -> str:
    s = (s or "").strip()
    if len(s) <= n:
        return s
    return s[: n - 1] + "…"


def _indicator_relations_line(contest_code: str, lu: Dict[str, Any]) -> str:
    """
    Связи для строки INDICATOR: награды по GROUP_CODE из REWARD-LINK и турниры конкурса из TOURNAMENT-SCHEDULE.
    """
    cc = (contest_code or "").strip()
    if not cc:
        return ""
    links = lu.get("reward_links_by_contest", {}).get(cc, [])
    tours: List[Dict[str, str]] = lu.get("tournaments_for_contest", {}).get(cc, [])

    by_group: Dict[str, List[str]] = defaultdict(list)
    seen_pair: set = set()
    for item in links:
        g = (item.get("GROUP_CODE") or "").strip() or "(без группы)"
        rc = (item.get("REWARD_CODE") or "").strip()
        if not rc:
            continue
        key = (g, rc)
        if key in seen_pair:
            continue
        seen_pair.add(key)
        by_group[g].append(rc)

    parts: List[str] = []
    for g in sorted(by_group.keys()):
        codes = by_group[g][:20]
        tail = "…" if len(by_group[g]) > 20 else ""
        parts.append(f"{g}: {', '.join(codes)}{tail}")

    rel = " · ".join(parts) if parts else ""
    if tours:
        t_codes: List[str] = []
        for t in tours[:12]:
            tc = (t.get("TOURNAMENT_CODE") or "").strip()
            if tc and tc not in t_codes:
                t_codes.append(tc)
        if t_codes:
            suf = "Турниры: " + ", ".join(t_codes)
            rel = (rel + " | " if rel else "") + suf
    return _clip(rel, 500)


def _contest_data_relations_line(contest_code: str, lu: Dict[str, Any]) -> str:
    """
    Колонка «Связи» для списка конкурсов: только коды TOURNAMENT_CODE и REWARD_CODE (без PERIOD_TYPE и пр.).
    """
    cc = (contest_code or "").strip()
    if not cc:
        return ""
    t_codes: List[str] = []
    for t in lu.get("tournaments_for_contest", {}).get(cc, []):
        tc = (t.get("TOURNAMENT_CODE") or "").strip()
        if tc and tc not in t_codes:
            t_codes.append(tc)
    r_codes: List[str] = []
    seen_r: set = set()
    for item in lu.get("reward_links_by_contest", {}).get(cc, []):
        rc = (item.get("REWARD_CODE") or "").strip()
        if rc and rc not in seen_r:
            seen_r.add(rc)
            r_codes.append(rc)
    parts: List[str] = []
    if t_codes:
        parts.append("Турниры: " + ", ".join(t_codes))
    if r_codes:
        parts.append("Награды: " + ", ".join(r_codes))
    return _clip(" | ".join(parts), 600) if parts else ""


def _schedule_rewards_line(contest_code: str, lu: Dict[str, Any]) -> str:
    """Текст колонки «Связанные награду» в списке расписания: пары REWARD_CODE: GROUP_CODE из REWARD-LINK конкурса."""
    cc = (contest_code or "").strip()
    if not cc:
        return ""
    links = lu.get("reward_links_by_contest", {}).get(cc, [])
    parts: List[str] = []
    seen_pair: set = set()
    for item in links:
        rc = (item.get("REWARD_CODE") or "").strip()
        gc = (item.get("GROUP_CODE") or "").strip()
        if not rc:
            continue
        key = (rc, gc)
        if key in seen_pair:
            continue
        seen_pair.add(key)
        # В ячейке только «код: уровень», без слова «Награды» и без «+».
        parts.append(f"{rc}: {gc}" if gc else rc)
    if not parts:
        return ""
    return "\n".join(parts)


def _schedule_relations_line(contest_code: str, lu: Dict[str, Any]) -> str:
    """Связи строки расписания для таблицы: только награды конкурса (см. _schedule_rewards_line), без строки «Конкурс»."""
    cc = (contest_code or "").strip()
    if not cc:
        return ""
    return _schedule_rewards_line(cc, lu)


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
        # primary_key (preview в списке) — CONTEST_CODE; relations_line остаётся для search_blob (колонка «Связи» в таблице не показывается).
        cc = (cells.get("CONTEST_CODE") or "").strip()
        pk = cc
        title = (cells.get("FULL_NAME") or "").strip()
        contest_type = (cells.get("CONTEST_TYPE") or "").strip()
        relations = _contest_data_relations_line(cc, lu)
        return {
            "primary_key": pk,
            "title_line": title,
            "relations_line": relations,
            "contest_type_col": contest_type,
        }

    if sheet_code == "GROUP":
        cc = (cells.get("CONTEST_CODE") or "").strip()
        gc = (cells.get("GROUP_CODE") or "").strip()
        gv = (cells.get("GROUP_VALUE") or "").strip()
        # В списке «Ключ» — как в связях карточки: GROUP_CODE : GROUP_VALUE (уникальность строки вместе с CONTEST_CODE).
        pk = f"{gc} : {gv}" if (gc or gv) else (cc or "")
        cname = contest_full.get(cc, "")
        title = cname or ""
        relations = f"Конкурс: {cc}" + (f" · {cname}" if cname else "")
        return {"primary_key": pk, "title_line": title, "relations_line": relations}

    if sheet_code == "INDICATOR":
        ic = (cells.get("INDICATOR_CODE") or "").strip()
        cc = (cells.get("CONTEST_CODE") or "").strip()
        ind_full = (cells.get("FULL_NAME") or "").strip()
        add_calc = (cells.get("INDICATOR_ADD_CALC_TYPE") or "").strip()
        cname = contest_full.get(cc, "")
        # В колонке «Название» — FULL_NAME конкурса из CONTEST-DATA; подпись — FULL_NAME показателя, если отличается.
        title_line = cname or ind_full or ic
        subtitle_line = ""
        if ind_full and (not cname or ind_full.strip() != cname.strip()):
            subtitle_line = ind_full
        relations = _indicator_relations_line(cc, lu)
        return {
            "primary_key": ic,
            "contest_code": cc,
            "title_line": title_line,
            "subtitle_line": subtitle_line,
            "add_calc_type": add_calc,
            "indicator_code_col": ic,
            "relations_line": relations,
        }

    if sheet_code == "REWARD":
        rc = (cells.get("REWARD_CODE") or "").strip()
        pk = rc
        reward_name = (cells.get("FULL_NAME") or "").strip()
        links_r = lu.get("reward_links_by_reward", {}).get(rc, [])
        contests: List[str] = []
        groups: List[str] = []
        seen_cc: set = set()
        seen_gc: set = set()
        for L in links_r:
            ccl = (L.get("CONTEST_CODE") or "").strip()
            if ccl and ccl not in seen_cc:
                seen_cc.add(ccl)
                contests.append(ccl)
            gcl = (L.get("GROUP_CODE") or "").strip()
            if gcl and gcl not in seen_gc:
                seen_gc.add(gcl)
                groups.append(gcl)
        # «Название / описание» в списке наград — названия конкурсов из CONTEST-DATA по цепочке REWARD-LINK → CONTEST_CODE.
        contest_titles: List[str] = []
        seen_titles: set = set()
        contest_full = lu.get("contest_full") or {}
        for ccl in contests:
            t = (contest_full.get(ccl) or "").strip()
            if t and t not in seen_titles:
                seen_titles.add(t)
                contest_titles.append(t)
        title_line = " · ".join(contest_titles)
        relations_line = "Конкурс: " + ", ".join(contests) if contests else ""
        group_codes_col = ", ".join(groups)
        return {
            "primary_key": pk,
            "reward_name_col": reward_name,
            "title_line": title_line,
            "group_codes_col": group_codes_col,
            "relations_line": relations_line,
        }

    if sheet_code == "REWARD-LINK":
        cc = (cells.get("CONTEST_CODE") or "").strip()
        gc = (cells.get("GROUP_CODE") or "").strip()
        rc = (cells.get("REWARD_CODE") or "").strip()
        pk = " · ".join(x for x in (cc, gc, rc) if x)
        cname = contest_full.get(cc, "")
        rname = reward_full.get(rc, "")
        return {
            "primary_key": rc or pk,
            "title_line": _clip(" — ".join(x for x in (cname, rname) if x) or pk, 200),
            "relations_line": "",
            "reward_link_reward_code": rc,
            "reward_link_reward_name": rname,
            "reward_link_contest_code": cc,
            "reward_link_contest_name": cname,
            "reward_link_group_code": gc,
        }

    if sheet_code == "TOURNAMENT-SCHEDULE":
        tc = (cells.get("TOURNAMENT_CODE") or "").strip()
        cc = (cells.get("CONTEST_CODE") or "").strip()
        pk = tc
        period = (cells.get("PERIOD_TYPE") or "").strip() or tc
        cname = contest_full.get(cc, "")
        season = target_type_season_code(cells.get("TARGET_TYPE") or "")
        relations = _schedule_relations_line(cc, lu)
        return {
            "primary_key": pk,
            "title_line": period,
            "relations_line": relations,
            "schedule_period_col": period,
            "schedule_contest_name_col": cname,
            "schedule_season_col": season,
        }

    # Запасной вариант для неизвестных листов
    spec_pk = ""
    for k in ("CONTEST_CODE", "REWARD_CODE", "TOURNAMENT_CODE", "GROUP_CODE", "INDICATOR_CODE"):
        if cells.get(k):
            spec_pk = str(cells[k]).strip()
            break
    if not spec_pk and cells:
        spec_pk = str(next(iter(cells.values())))[:80]
    return {"primary_key": spec_pk, "title_line": "", "relations_line": ""}


def reward_type_filter_options(cfg: Dict[str, Any], *, for_multiselect_list: bool = False) -> List[Dict[str, str]]:
    """
    Варианты фильтра по REWARD_TYPE из field_enums (лист REWARD).
    Используется в списках REWARD и REWARD-LINK.
    При for_multiselect_list=False — первый пункт «ВСЕ» (одиночный селект, пустое значение = без фильтра).
    При for_multiselect_list=True — только реальные типы для чекбоксов фильтра (пустой набор отмеченных = без фильтра).
    """
    from src import editor_config

    def _opt_value(o: Any) -> str:
        if isinstance(o, dict):
            v = o.get("value")
            return str(v).strip() if v is not None else ""
        return str(o).strip() if o is not None else ""

    def _opt_label(o: Any, val: str) -> str:
        if isinstance(o, dict) and o.get("label") is not None:
            return str(o.get("label")).strip() or val
        return val

    out: List[Dict[str, str]] = []
    if not for_multiselect_list:
        out.append({"label": "ВСЕ", "value": ""})
    seen: set = set() if for_multiselect_list else {""}
    for rule in editor_config.flatten_field_enums(cfg):
        if rule.get("sheet_code") != "REWARD" or rule.get("column") != "REWARD_TYPE":
            continue
        if rule.get("json_path"):
            continue
        for o in rule.get("options") or []:
            v = _opt_value(o)
            if not v or v in seen:
                continue
            seen.add(v)
            out.append({"label": _opt_label(o, v), "value": v})
    return out


def contest_type_filter_options(cfg: Dict[str, Any], *, for_multiselect_list: bool = False) -> List[Dict[str, str]]:
    """
    Варианты фильтра по CONTEST_TYPE из field_enums (лист CONTEST-DATA).
    Семантика как у reward_type_filter_options: при for_multiselect_list=True — список {label, value}
    для чекбоксов-чипов в sheet_list.html (без пункта «ВСЕ»).
    """
    from src import editor_config

    def _opt_value(o: Any) -> str:
        if isinstance(o, dict):
            v = o.get("value")
            return str(v).strip() if v is not None else ""
        return str(o).strip() if o is not None else ""

    def _opt_label(o: Any, val: str) -> str:
        if isinstance(o, dict) and o.get("label") is not None:
            return str(o.get("label")).strip() or val
        return val

    out: List[Dict[str, str]] = []
    if not for_multiselect_list:
        out.append({"label": "ВСЕ", "value": ""})
    seen: set = set() if for_multiselect_list else {""}
    for rule in editor_config.flatten_field_enums(cfg):
        if rule.get("sheet_code") != "CONTEST-DATA" or rule.get("column") != "CONTEST_TYPE":
            continue
        if rule.get("json_path"):
            continue
        for o in rule.get("options") or []:
            v = _opt_value(o)
            if not v or v in seen:
                continue
            seen.add(v)
            out.append({"label": _opt_label(o, v), "value": v})
    return out


def season_filter_options(lu: Dict[str, Any]) -> List[Dict[str, str]]:
    """Опции множественного фильтра по seasonCode для списка TOURNAMENT-SCHEDULE."""
    codes: List[str] = list(lu.get("schedule_season_codes") or [])
    return [{"label": c, "value": c} for c in codes]


def group_list_levels_relation_line(member_cells: List[Dict[str, str]]) -> str:
    """
    Колонка «Связи» для списка GROUP, сгруппированного по конкурсу: перечень уровней
    (GROUP_CODE : GROUP_VALUE) по всем строкам GROUP с этим CONTEST_CODE.
    """
    parts: List[str] = []
    for c in member_cells:
        gc = (c.get("GROUP_CODE") or "").strip()
        gv = (c.get("GROUP_VALUE") or "").strip()
        if gc or gv:
            parts.append(f"{gc} : {gv}")
    if not parts:
        return ""
    return "Уровни: " + " · ".join(parts)


def group_list_aggregate_search_blob(
    contest_code: str, title: str, levels_line: str, members: List[Dict[str, str]]
) -> str:
    """Нижний регистр: поиск по агрегированной строке GROUP (код конкурса, название, уровни, все ячейки вхождений)."""
    chunks = [contest_code, title, levels_line]
    for c in members:
        chunks.append(json.dumps(c, ensure_ascii=False))
    return " ".join(chunks).lower()


def search_blob(cells: Dict[str, str], disp: Dict[str, str]) -> str:
    """Объединённая строка для поиска по списку."""
    parts = [json.dumps(cells, ensure_ascii=False)]
    parts.extend(
        disp.get(k, "")
        for k in (
            "primary_key",
            "title_line",
            "relations_line",
            "contest_code",
            "subtitle_line",
            "add_calc_type",
            "indicator_code_col",
            "reward_name_col",
            "group_codes_col",
            "reward_link_reward_code",
            "reward_link_reward_name",
            "reward_link_contest_code",
            "reward_link_contest_name",
            "reward_link_group_code",
            "schedule_period_col",
            "schedule_contest_name_col",
            "schedule_season_col",
            "contest_type_col",
        )
    )
    return " ".join(parts).lower()
