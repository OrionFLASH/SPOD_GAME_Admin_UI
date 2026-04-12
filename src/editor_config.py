# -*- coding: utf-8 -*-
"""
Развёртка настроек редактора из config.json в плоский вид для row_editor.js.

В конфиге допускается группировка по листу: один объект с полем sheet_code и массивом
rules (перечисления), hints (размеры textarea) или rules в editor_field_ui (подписи и описания полей),
вместо повторения sheet_code в каждой записи.
Поддерживается и старый плоский формат (каждый элемент — полное правило с sheet_code).
"""

from __future__ import annotations

from typing import Any, Dict, List


def flatten_field_enums(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Возвращает список правил вида {sheet_code, column, options, ...} для клиента.

    Новый формат элемента field_enums:
      {"sheet_code": "REWARD", "rules": [{"column": "...", "allow_custom": true, "options": [...]}, ...]}
    Элемент options может быть строкой или объектом {"label": "подпись в UI", "value": "значение в ячейке CSV"}.
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
    Плоский список подсказок редактора: {sheet_code, column, min_rows?, max_rows?, json_path?, ...}.

    Дополнительно для дат (см. row_editor.js): input_type date или date_picker true — календарь HTML;
    storage_format (например YYYY-MM-DD) — подпись в UI, в ячейку пишется строка в формате ISO.

    Массив примитивов в JSON (строки/числа/boolean): json_scalar_array true, json_path — путь к **самому**
    массиву (не к элементу с индексом); min_rows/max_rows — высота textarea для каждой строки элемента;
    array_allows_empty — можно ли сохранить [] (по умолчанию да); array_max_items — максимум элементов
    (если не задано — без ограничения).

    Новый формат: sheet_code и массив hints с полями column, min_rows, input_type и т.д.
    Устаревший: один объект на строку с полем column без массива hints.
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


def flatten_editor_field_ui(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Плоский список подписей и описаний полей для UI: {sheet_code, column, label?, description?, show_description?, json_path?}.

    Формат в config.json — как у field_enums: блоки {\"sheet_code\", \"rules\": [ {...}, ... ] }.
    Поле json_path (массив строк и/или чисел) — для листьев внутри JSON-колонки; без json_path — плоская колонка листа.

    - label: подпись в форме; если пусто — на клиенте подставляется имя колонки или путь.
    - description: поясняющий текст под подписью поля в UI, если show_description истинно.
    - show_description: если истинно — description показывается сразу под названием (не во всплывающей подсказке).
    - required: в мастере и карточке строки — красная «*» слева от подписи (обязательное поле в данных листа), по выводам из CSV.
    - allows_empty: если false — у подписи оранжевая точка (пустое значение недопустимо); валидация на клиенте и в мастере.
    """
    raw = cfg.get("editor_field_ui")
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
