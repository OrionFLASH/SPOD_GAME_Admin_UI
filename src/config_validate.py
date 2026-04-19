# -*- coding: utf-8 -*-
"""Проверки согласованности config.json: блок sheet_bindings ↔ sheets."""

from __future__ import annotations

from typing import Any, Dict, List

from src import editor_config
from src.field_enum_sheet_options import _sql_ident, label_template_placeholders


def validate_editor_field_definitions(cfg: Dict[str, Any]) -> List[str]:
    """
    Проверяет структуру ``editor_field_definitions``: блоки с sheet_code и rules;
    у каждого правила — column и хотя бы одна секция ui / enum / numeric / textarea (или paths).
    """
    raw = cfg.get("editor_field_definitions")
    if raw is None:
        return []
    if not isinstance(raw, list):
        return ["editor_field_definitions: ожидается массив"]
    out: List[str] = []
    for bi, block in enumerate(raw):
        if not isinstance(block, dict):
            out.append(f"editor_field_definitions[{bi}]: ожидается объект")
            continue
        sc = str(block.get("sheet_code") or "").strip()
        if not sc:
            out.append(f"editor_field_definitions[{bi}]: нет sheet_code")
        rules = block.get("rules")
        if not isinstance(rules, list):
            out.append(f"editor_field_definitions[{bi}] ({sc}): rules должен быть массивом")
            continue
        for ri, rule in enumerate(rules):
            if not isinstance(rule, dict):
                out.append(f"editor_field_definitions[{bi}].rules[{ri}]: ожидается объект")
                continue
            col = str(rule.get("column") or "").strip()
            if not col:
                out.append(f"editor_field_definitions[{bi}].rules[{ri}]: нет column")
            has_paths = rule.get("paths") is not None
            parts = (
                bool(rule.get("ui")),
                bool(rule.get("enum")),
                bool(rule.get("numeric")),
                bool(rule.get("textarea")),
                has_paths,
            )
            if not any(parts):
                out.append(
                    f"editor_field_definitions[{bi}] ({sc}): rules[{ri}] — задайте ui, enum, numeric, textarea или paths"
                )
    return out


def validate_field_enum_sheet_options(cfg: Dict[str, Any]) -> List[str]:
    """
    Проверяет блок ``options_from_sheet`` у правил field_enums: лист из sheets, имена колонок.
    """
    sheets = cfg.get("sheets") or []
    codes = {str(s.get("code") or "") for s in sheets if s.get("code")}
    out: List[str] = []
    for rule in editor_config.flatten_field_enums(cfg):
        ofs = rule.get("options_from_sheet")
        if not isinstance(ofs, dict) or not ofs:
            continue
        src = str(ofs.get("source_sheet_code") or "").strip()
        if not src:
            out.append("field_enums: options_from_sheet без source_sheet_code")
            continue
        if src not in codes:
            out.append(f"field_enums: options_from_sheet — неизвестный лист «{src}»")
        vc = str(ofs.get("value_column") or "").strip()
        if not vc:
            out.append(f"field_enums: options_from_sheet для «{src}» без value_column")
        lt = str(ofs.get("label_template") or "").strip()
        lc = str(ofs.get("label_column") or "").strip()
        if lt:
            phs = label_template_placeholders(lt)
            if not phs:
                out.append(
                    f"field_enums: options_from_sheet для «{src}» — label_template без плейсхолдеров {{COLUMN}}"
                )
            for ph in phs:
                try:
                    _sql_ident(ph)
                except ValueError:
                    out.append(f"field_enums: options_from_sheet — недопустимое имя в label_template: {ph!r}")
        elif not lc:
            out.append(
                f"field_enums: options_from_sheet для «{src}» без label_column "
                f"(или задайте label_template с {{COLUMN}})"
            )
        for cond in ofs.get("where") or []:
            if isinstance(cond, dict) and str(cond.get("column") or "").strip() == "":
                out.append("field_enums: options_from_sheet.where — пустой column")
    return out


def validate_sheet_list_lookups(cfg: Dict[str, Any]) -> List[str]:
    """
    Проверяет sheet_list_lookups: лист из sheets, уникальные id, непустые колонки.
    """
    sheets = cfg.get("sheets") or []
    codes = {str(s.get("code") or "") for s in sheets if s.get("code")}
    raw = cfg.get("sheet_list_lookups")
    if not raw:
        return []
    if not isinstance(raw, list):
        return ["sheet_list_lookups: ожидается массив"]
    out: List[str] = []
    seen: set[str] = set()
    for block in raw:
        if not isinstance(block, dict):
            out.append("sheet_list_lookups: пропущен не-объект")
            continue
        lid = str(block.get("id") or "").strip()
        if not lid:
            out.append("sheet_list_lookups: элемент без id")
            continue
        if lid in seen:
            out.append(f"sheet_list_lookups: повтор id «{lid}»")
        seen.add(lid)
        src = str(block.get("source_sheet") or "").strip()
        if not src:
            out.append(f"sheet_list_lookups: «{lid}» без source_sheet")
            continue
        if src not in codes:
            out.append(f"sheet_list_lookups: неизвестный лист «{src}» (id={lid})")
        kc = str(block.get("key_column") or "").strip()
        vc = str(block.get("value_column") or "").strip()
        if not kc or not vc:
            out.append(f"sheet_list_lookups: «{lid}» — задайте key_column и value_column")
    return out


def validate_sheet_list_column_values(cfg: Dict[str, Any]) -> List[str]:
    """
    Проверяет sheet_list_columns.rules: поле show (если есть) — boolean;
    rules[].value: допустимый kind, ссылки lookup_id на sheet_list_lookups.
    """
    lookup_ids: set[str] = set()
    for block in cfg.get("sheet_list_lookups") or []:
        if isinstance(block, dict) and str(block.get("id") or "").strip():
            lookup_ids.add(str(block.get("id")).strip())

    kinds_ok = {"cell", "lookup", "json_leaf", "display_field", "builtin"}
    builtins_ok = {"group_list_contest_code", "group_list_contest_name", "group_list_relations"}
    out: List[str] = []
    for block in cfg.get("sheet_list_columns") or []:
        if not isinstance(block, dict):
            continue
        scode = str(block.get("sheet_code") or "")
        for rule in block.get("rules") or []:
            if not isinstance(rule, dict):
                continue
            if "show" in rule and not isinstance(rule.get("show"), bool):
                out.append(
                    f"sheet_list_columns: лист «{scode}», key={rule.get('key')!r} — поле show должно быть boolean (true/false)"
                )
            spec = rule.get("value")
            if not isinstance(spec, dict):
                continue
            kind = str(spec.get("kind") or "").strip()
            if not kind:
                continue
            if kind not in kinds_ok:
                out.append(f"sheet_list_columns: лист «{scode}», key={rule.get('key')!r} — неизвестный value.kind={kind!r}")
                continue
            if kind == "lookup":
                lid = str(spec.get("lookup_id") or "").strip()
                if lid and lid not in lookup_ids:
                    out.append(
                        f"sheet_list_columns: лист «{scode}» — value.lookup_id={lid!r} отсутствует в sheet_list_lookups"
                    )
                if not str(spec.get("key_from_column") or "").strip():
                    out.append(f"sheet_list_columns: лист «{scode}» — lookup без key_from_column")
            if kind == "builtin":
                name = str(spec.get("name") or "").strip()
                if name and name not in builtins_ok:
                    out.append(f"sheet_list_columns: лист «{scode}» — неизвестный builtin «{name}»")
    return out


def validate_global_filter_labels(cfg: Dict[str, Any]) -> List[str]:
    """
    Проверяет global_filter_labels: ключи — внутренние имена измерений gf_*;
    значение — строка подписи или объект с label_ru / label (опционально comment_ru).
    """
    from src.global_sheet_filters import DIMENSION_ORDER

    raw = cfg.get("global_filter_labels")
    if raw is None:
        return []
    if not isinstance(raw, dict):
        return ["global_filter_labels: ожидается объект"]
    known = set(DIMENSION_ORDER)
    out: List[str] = []
    for k, v in raw.items():
        dim = str(k).strip()
        if not dim:
            continue
        if dim not in known:
            out.append(f"global_filter_labels: неизвестное измерение «{dim}»")
        if isinstance(v, str):
            continue
        if isinstance(v, dict):
            continue
        out.append(f"global_filter_labels: «{dim}» — ожидается строка или объект (label_ru, опционально comment_ru)")
    return out


def validate_sheet_bindings(cfg: Dict[str, Any]) -> List[str]:
    """
    Сверяет sheet_bindings с sheets[]: один код листа — одна запись, заголовок по желанию.
    Имя CSV задаётся только в sheets[].file; устаревшие ключи csv_file/file в привязке
    не используются кодом импорта — при несовпадении с sheets.file пишется предупреждение.
    """
    bindings = cfg.get("sheet_bindings")
    if not bindings:
        return []
    sheets = cfg.get("sheets") or []
    by_code: Dict[str, Dict[str, Any]] = {str(s.get("code")): s for s in sheets if s.get("code")}
    out: List[str] = []
    seen_bind: set[str] = set()
    for b in bindings:
        if not isinstance(b, dict):
            continue
        code = str(b.get("code") or "")
        if not code:
            out.append("sheet_bindings: пропущен элемент без code")
            continue
        seen_bind.add(code)
        if code not in by_code:
            out.append(f"sheet_bindings: код «{code}» отсутствует в sheets")
            continue
        sheet = by_code[code]
        legacy_fn = b.get("csv_file") or b.get("file")
        sheet_fn = sheet.get("file")
        if legacy_fn and sheet_fn and str(legacy_fn) != str(sheet_fn):
            out.append(
                f"sheet_bindings: для «{code}» устаревший csv_file/file={legacy_fn!r} "
                f"не совпадает с sheets.file={sheet_fn!r} — ориентир sheets[].file"
            )
        bind_title = str(b.get("title") or "").strip()
        sheet_title = str(sheet.get("title") or "").strip()
        if bind_title and sheet_title and bind_title != sheet_title:
            out.append(
                f"sheet_bindings: для «{code}» title={bind_title!r} отличается от sheets.title={sheet_title!r}"
            )
    for code in by_code:
        if code not in seen_bind:
            out.append(f"sheet_bindings: в справочнике нет записи для листа «{code}» из sheets")
    return out
