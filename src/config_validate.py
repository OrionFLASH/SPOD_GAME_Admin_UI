# -*- coding: utf-8 -*-
"""Проверки согласованности config.json: блок sheet_bindings ↔ sheets."""

from __future__ import annotations

from typing import Any, Dict, List

from src import editor_config
from src.field_enum_sheet_options import _sql_ident, label_template_placeholders


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
