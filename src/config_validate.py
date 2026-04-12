# -*- coding: utf-8 -*-
"""Проверки согласованности config.json (лист ↔ файл в sheet_bindings и sheets)."""

from __future__ import annotations

from typing import Any, Dict, List


def validate_sheet_bindings(cfg: Dict[str, Any]) -> List[str]:
    """
    Сравнивает sheet_bindings с основным блоком sheets (код и имя CSV).
    Возвращает список предупреждений для лога; пустой sheet_bindings — без проверок.
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
        fn = b.get("csv_file") or b.get("file")
        if code not in by_code:
            out.append(f"sheet_bindings: код «{code}» отсутствует в sheets")
            continue
        if fn and by_code[code].get("file") != fn:
            out.append(
                f"sheet_bindings: для «{code}» csv_file={fn!r} не совпадает с sheets.file={by_code[code].get('file')!r}"
            )
    for code in by_code:
        if code not in seen_bind:
            out.append(f"sheet_bindings: в справочнике нет записи для листа «{code}» из sheets")
    return out
