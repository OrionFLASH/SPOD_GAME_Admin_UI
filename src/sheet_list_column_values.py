# -*- coding: utf-8 -*-
"""
Значения ячеек таблицы списка по правилам из config.json (sheet_list_columns.rules[].value).

Типы (kind):
- cell — значение из ячейки текущей строки CSV;
- lookup — значение из именованного справочника lu[lookup_id] по ключу из колонки строки;
- json_leaf — лист JSON в колонке (например TARGET_TYPE.seasonCode);
- display_field — поле из результата display_for_sheet_row (сложная логика между листами);
- builtin — зарегистрированные сценарии (агрегат GROUP и пр.).

Справочники для lookup задаются в config.json → sheet_list_lookups и строятся в build_lookup_tables.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from src import sheet_list_display, spod_json


def _builtin_group_contest_code(
    cells: Optional[Dict[str, str]], lu: Dict[str, Any], disp: Optional[Dict[str, str]], agg: Optional[Dict[str, Any]]
) -> str:
    return str((agg or {}).get("contest_code") or "").strip()


def _builtin_group_contest_name(
    cells: Optional[Dict[str, str]], lu: Dict[str, Any], disp: Optional[Dict[str, str]], agg: Optional[Dict[str, Any]]
) -> str:
    cc = str((agg or {}).get("contest_code") or "").strip()
    if not cc:
        return ""
    return str((lu.get("contest_full") or {}).get(cc) or "").strip()


def _builtin_group_relations(
    cells: Optional[Dict[str, str]], lu: Dict[str, Any], disp: Optional[Dict[str, str]], agg: Optional[Dict[str, Any]]
) -> str:
    members = (agg or {}).get("members") or []
    if not isinstance(members, list):
        return ""
    return sheet_list_display.group_list_levels_relation_line(members)


_BUILTIN: Dict[str, Callable[..., str]] = {
    "group_list_contest_code": _builtin_group_contest_code,
    "group_list_contest_name": _builtin_group_contest_name,
    "group_list_relations": _builtin_group_relations,
}


def _json_leaf_value(raw: str, path: List[Any]) -> str:
    """Извлекает лист по пути (строковые ключи и целочисленные индексы)."""
    obj, _err = spod_json.try_parse_cell(raw)
    cur: Any = obj
    for p in path:
        if cur is None:
            return ""
        if isinstance(p, int):
            if not isinstance(cur, list) or p < 0 or p >= len(cur):
                return ""
            cur = cur[p]
        else:
            pk = str(p)
            if not isinstance(cur, dict) or pk not in cur:
                return ""
            cur = cur.get(pk)
    if cur is None:
        return ""
    return str(cur).strip()


def resolve_list_cell_value(
    spec: Dict[str, Any],
    *,
    cells: Optional[Dict[str, str]],
    lu: Dict[str, Any],
    disp: Optional[Dict[str, str]],
    agg: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Возвращает текст ячейки по объекту value из config (см. sheet_list_columns.rules).
    """
    kind = str(spec.get("kind") or "").strip()
    if kind == "cell":
        col = str(spec.get("column") or "").strip()
        return str((cells or {}).get(col, "") or "").strip()
    if kind == "lookup":
        lookup_id = str(spec.get("lookup_id") or "").strip()
        kfc = str(spec.get("key_from_column") or "").strip()
        key = str((cells or {}).get(kfc, "") or "").strip()
        mp = lu.get(lookup_id)
        if not isinstance(mp, dict):
            return ""
        return str(mp.get(key, "") or "").strip()
    if kind == "json_leaf":
        col = str(spec.get("column") or "").strip()
        path = spec.get("path")
        if not isinstance(path, list):
            path = []
        raw = str((cells or {}).get(col, "") or "")
        # Сокращение для сезона расписания (тот же смысл, что target_type_season_code).
        if col == "TARGET_TYPE" and path == ["seasonCode"]:
            return sheet_list_display.target_type_season_code(raw)
        return _json_leaf_value(raw, path)
    if kind == "display_field":
        field = str(spec.get("field") or "").strip()
        return str((disp or {}).get(field, "") or "").strip()
    if kind == "builtin":
        name = str(spec.get("name") or "").strip()
        fn = _BUILTIN.get(name)
        if fn is None:
            return ""
        return str(fn(cells, lu, disp, agg) or "").strip()
    return ""


def apply_configured_list_column_values(
    rules: List[Dict[str, Any]],
    row: Dict[str, Any],
    *,
    cells: Optional[Dict[str, str]],
    lu: Dict[str, Any],
    disp: Optional[Dict[str, str]],
    agg: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Перезаписывает в row поля, перечисленные в rules с непустым value, по спецификации из config.
    """
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        spec = rule.get("value")
        if not isinstance(spec, dict) or not str(spec.get("kind") or "").strip():
            continue
        key = str(rule.get("key") or "").strip()
        if not key:
            continue
        row[key] = resolve_list_cell_value(spec, cells=cells, lu=lu, disp=disp, agg=agg)
