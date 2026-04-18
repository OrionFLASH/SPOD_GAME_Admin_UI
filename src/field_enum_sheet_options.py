# -*- coding: utf-8 -*-
"""
Дополнение правил field_enums опциями из актуальных строк листа в SQLite.

В config.json у элемента field_enums (внутри rules) можно задать блок ``options_from_sheet``:
  - ``source_sheet_code`` — логический код листа из ``sheets`` (например REWARD);
  - ``value_column`` — колонка CSV/таблицы, значение попадает в ячейку как ``value``;
  - ``label_column`` — одна колонка для подписи в списке (если не задан ``label_template``);
  - ``label_template`` — необязательная строка подписи с плейсхолдерами ``{ИМЯ_КОЛОНКИ}`` (как в ``str.format``),
    подставляются значения из той же строки листа; литеральные фигурные скобки — ``{{`` и ``}}``;
    при наличии шаблона ``label_column`` для подписи не используется;
  - ``where`` — необязательный список условий: ``{"column": "...", "equals": "..."}``
    или ``{"column": "...", "in": ["a","b"]}`` (только актуальные строки ``is_current=1``);
  - ``order_by`` — необязательная колонка сортировки (по умолчанию ``value_column``).

Сервер подставляет строки из ``spod_sheet_*`` и объединяет с уже заданными статическими
``options`` (дубликаты по value отбрасываются, сначала идут строки из БД).
Ключ ``options_from_sheet`` в ответ клиенту не передаётся — только итоговый ``options``.
"""

from __future__ import annotations

import logging
import re
import sqlite3
from typing import Any, Dict, List, Sequence, Set, Tuple

from src import editor_config, sheet_storage

# Допустимые имена колонок/алиасов в генерируемом SQL (защита от подстановки произвольного текста).
_SQL_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
# Плейсхолдеры в label_template: {COLUMN_NAME} — только безопасные идентификаторы.
_LABEL_TEMPLATE_PLACEHOLDER_RE = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")


def _sql_ident(name: str) -> str:
    n = str(name or "").strip()
    if not _SQL_IDENT_RE.match(n):
        raise ValueError(f"Недопустимое имя колонки или листа для SQL: {name!r}")
    return n


def label_template_placeholders(template: str) -> List[str]:
    """
    Имена колонок из ``label_template`` в порядке первого вхождения, без дубликатов.
    """
    seen: Set[str] = set()
    out: List[str] = []
    for m in _LABEL_TEMPLATE_PLACEHOLDER_RE.finditer(str(template or "")):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


def format_label_from_template(template: str, row_values: Dict[str, str]) -> str:
    """
    Подставляет в шаблон значения колонок (ключи — имена из ``{COLUMN}``).
    Отсутствующие ключи дают пустую строку.
    """
    keys = label_template_placeholders(template)
    ctx = {k: str(row_values.get(k, "") or "") for k in keys}
    try:
        return str(template or "").format(**ctx)
    except (KeyError, ValueError, IndexError):
        # Некорректные ``{{``/``}}`` или лишние ``{`` — не ломаем выборку из БД.
        return " | ".join(ctx[k] for k in keys) if keys else ""


def _known_sheet_codes(cfg: Dict[str, Any]) -> Set[str]:
    return {str(s.get("code") or "") for s in (cfg.get("sheets") or []) if s.get("code")}


def _fetch_options_from_sheet(conn: sqlite3.Connection, cfg: Dict[str, Any], spec: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Возвращает список ``{"value": "...", "label": "..."}`` по актуальным строкам листа.
    """
    src = str(spec.get("source_sheet_code") or "").strip()
    if not src or src not in _known_sheet_codes(cfg):
        logging.warning("options_from_sheet: неизвестный лист %s", src)
        return []
    vc = _sql_ident(str(spec.get("value_column") or "").strip())
    order = str(spec.get("order_by") or "").strip() or vc
    order_c = _sql_ident(order)
    t = sheet_storage.physical_table_name(src)
    qt = sheet_storage.quote_ident(t)
    qvc = sheet_storage.quote_ident(vc)
    qoc = sheet_storage.quote_ident(order_c)
    label_template = str(spec.get("label_template") or "").strip()
    placeholders: List[str] = []
    if label_template:
        placeholders = label_template_placeholders(label_template)
        if not placeholders:
            logging.warning("options_from_sheet: label_template без плейсхолдеров {COLUMN}")
            return []
        for ph in placeholders:
            _sql_ident(ph)
        parts_sel: List[str] = [f"trim({qvc}) AS v"]
        for ph in placeholders:
            phi = _sql_ident(ph)
            qp = sheet_storage.quote_ident(phi)
            qa = sheet_storage.quote_ident(ph)
            parts_sel.append(f"trim({qp}) AS {qa}")
        select_clause = ", ".join(parts_sel)
    else:
        lc = _sql_ident(str(spec.get("label_column") or "").strip())
        qlc = sheet_storage.quote_ident(lc)
        select_clause = f"trim({qvc}) AS v, trim({qlc}) AS lbl"
    where_clauses: List[str] = ["is_current = 1"]
    params: List[Any] = []
    for cond in spec.get("where") or []:
        if not isinstance(cond, dict):
            continue
        col = str(cond.get("column") or "").strip()
        if not col:
            continue
        qcol = sheet_storage.quote_ident(_sql_ident(col))
        if "equals" in cond:
            where_clauses.append(f"trim({qcol}) = ?")
            params.append(str(cond.get("equals", "")).strip())
        elif "in" in cond:
            raw_in = cond.get("in")
            if not isinstance(raw_in, list) or not raw_in:
                continue
            vals = [str(x).strip() for x in raw_in if str(x).strip() != ""]
            if not vals:
                continue
            ph = ", ".join(["?"] * len(vals))
            where_clauses.append(f"trim({qcol}) IN ({ph})")
            params.extend(vals)
    sql = (
        f"SELECT DISTINCT {select_clause} FROM {qt} "
        f"WHERE {' AND '.join(where_clauses)} AND trim({qvc}) != '' "
        f"ORDER BY {qoc} COLLATE NOCASE, v COLLATE NOCASE"
    )
    cur = conn.execute(sql, params)
    out: List[Dict[str, str]] = []
    for row in cur.fetchall():
        v = str(row["v"] if "v" in row.keys() else row[0]).strip()
        if not v:
            continue
        if label_template:
            rv: Dict[str, str] = {}
            for ph in placeholders:
                try:
                    raw = row[ph]
                except (KeyError, IndexError, TypeError):
                    raw = ""
                rv[ph] = str(raw).strip() if raw is not None else ""
            lbl = format_label_from_template(label_template, rv).strip()
        else:
            lbl = str(row["lbl"] if "lbl" in row.keys() else row[1]).strip()
        if not lbl:
            lbl = v
        out.append({"value": v, "label": lbl})
    return out


def _normalize_static_option(op: Any) -> Tuple[str, Dict[str, str]]:
    """Пара (value, option_dict) для сравнения и слияния."""
    if isinstance(op, dict):
        v = str(op.get("value", "")).strip()
        lbl = str(op.get("label", v) if op.get("label") is not None else v)
        return v, {"value": v, "label": lbl}
    v = str(op).strip()
    return v, {"value": v, "label": v}


def _merge_enum_options(db_opts: List[Dict[str, str]], static: Sequence[Any]) -> List[Dict[str, str]]:
    """Сначала строки из БД, затем статические options с новыми value."""
    seen: Set[str] = set()
    merged: List[Dict[str, str]] = []
    for o in db_opts:
        v = str(o.get("value", "")).strip()
        if not v or v in seen:
            continue
        seen.add(v)
        merged.append({"value": v, "label": str(o.get("label") or v)})
    for op in static:
        v, d = _normalize_static_option(op)
        if v in seen:
            continue
        seen.add(v)
        merged.append(d)
    return merged


def merge_field_enums_with_sheet_options(conn: sqlite3.Connection, cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Разворачивает field_enums и подмешивает опции из БД для правил с ``options_from_sheet``.
    """
    out: List[Dict[str, Any]] = []
    for rule in editor_config.flatten_field_enums(cfg):
        r = dict(rule)
        ofs = r.pop("options_from_sheet", None)
        if isinstance(ofs, dict) and ofs:
            try:
                db_part = _fetch_options_from_sheet(conn, cfg, ofs)
            except (sqlite3.Error, ValueError) as e:
                logging.warning("options_from_sheet: ошибка выборки (%s): %s", ofs.get("source_sheet_code"), e)
                db_part = []
            static = r.get("options") or []
            r["options"] = _merge_enum_options(db_part, list(static) if isinstance(static, list) else [])
        out.append(r)
    return out
