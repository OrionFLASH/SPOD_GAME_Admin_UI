# -*- coding: utf-8 -*-
"""
Развёртка настроек редактора из config.json в плоский вид для row_editor.js.

В конфиге допускается группировка по листу: один объект с полем sheet_code и массивом
rules (перечисления) или hints (размеры textarea), вместо повторения sheet_code в каждой записи.
Поддерживается и старый плоский формат (каждый элемент — полное правило с sheet_code).
"""

from __future__ import annotations

from typing import Any, Dict, List


def flatten_field_enums(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Возвращает список правил вида {sheet_code, column, options, ...} для клиента.

    Новый формат элемента field_enums:
      {"sheet_code": "REWARD", "rules": [{"column": "...", "allow_custom": true, "options": [...]}, ...]}
    Устаревший (плоский):
      {"sheet_code": "REWARD", "column": "...", ...}
    """
    raw = cfg.get("field_enums")
    if not raw or not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for block in raw:
        if not isinstance(block, dict):
            continue
        sc = block.get("sheet_code")
        if sc is None:
            continue
        if "rules" in block:
            for rule in block.get("rules") or []:
                if isinstance(rule, dict):
                    merged: Dict[str, Any] = dict(rule)
                    merged["sheet_code"] = sc
                    out.append(merged)
            continue
        if "column" in block:
            out.append(dict(block))
    return out


def flatten_editor_textareas(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Плоский список подсказок по textarea: {sheet_code, column, min_rows?, max_rows?, json_path?}.

    Новый формат:
      {"sheet_code": "REWARD", "hints": [{"column": "FULL_NAME", "min_rows": 2, "max_rows": 10}]}
    Устаревший:
      {"sheet_code": "REWARD", "column": "FULL_NAME", "min_rows": 2, ...}
    """
    raw = cfg.get("editor_textareas")
    if not raw or not isinstance(raw, list):
        return []
    out: List[Dict[str, Any]] = []
    for block in raw:
        if not isinstance(block, dict):
            continue
        sc = block.get("sheet_code")
        if sc is None:
            continue
        if "hints" in block:
            for hint in block.get("hints") or []:
                if isinstance(hint, dict):
                    merged = dict(hint)
                    merged["sheet_code"] = sc
                    out.append(merged)
            continue
        if "column" in block:
            out.append(dict(block))
    return out
