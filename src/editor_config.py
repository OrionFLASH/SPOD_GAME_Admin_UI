# -*- coding: utf-8 -*-
"""
Развёртка настроек редактора из config.json в плоский вид для row_editor.js.

В конфиге допускается группировка по листу: один объект с полем sheet_code и массивом
rules (перечисления), hints (размеры textarea), rules в editor_field_ui (подписи и описания полей)
или rules в editor_field_numeric (форматы числовых полей: плоские колонки и при необходимости json_path внутри JSON-колонки),
вместо повторения sheet_code в каждой записи.
У правил field_enums в rules[] опционально поле input_display (toggle / select) — передаётся в flatten_field_enums на клиент (row_editor.js).
Поддерживается и старый плоский формат (каждый элемент — полное правило с sheet_code).
"""

from __future__ import annotations

from typing import Any, Dict, List


def flatten_field_enums(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Возвращает список правил вида {sheet_code, column, options, ...} для клиента.

    Новый формат элемента field_enums:
      {"sheet_code": "REWARD", "rules": [{"column": "...", "allow_custom": true, "options": [...]}, ...]}
    Дополнительно для правил с options (field_enums): input_display — как показывать поле в UI:
      "toggle" — при ровно двух вариантах переключатель (см. row_editor.js useToggleForEnumRule);
      "select" или отсутствие ключа — выпадающий список; если опций больше двух, всегда список.
    Размеры переключателя на клиенте рассчитываются в row_editor.js (applySpodYnToggleLayout, батч flushSpodYnToggleLayouts) — см. README раздел 4.4.
    Элемент options может быть строкой или объектом {"label": "подпись в UI", "value": "значение в ячейке CSV"}.
    Для field_enums: ``whitelist_validated_input: true`` — не выпадающий список, а текстовое поле с подсветкой
    по совпадению со списком ``options`` (в т.ч. после ``options_from_sheet``).
    Опционально ``options_from_sheet``: динамический список из актуальных строк другого листа SQLite
    (см. ``field_enum_sheet_options``): ``source_sheet_code``, ``value_column``,
    подпись — либо ``label_column``, либо составная ``label_template`` с плейсхолдерами ``{КОЛОНКА}``,
    необязательно ``where`` (``equals`` / ``in``) и ``order_by``. Итоговые ``options`` = строки из БД
    плюс статические из конфига (без дубликатов по value).
    Для пути вида ["ключ", 0], ["ключ", 1], … в JSON-колонке правило с json_path ["ключ"] (без индекса)
    применяется к каждому элементу массива (select на каждую строку, в т.ч. внутри json_scalar_array).
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

    Массив **однотипных объектов** (например ``[{ "nonRewardCode": "…" }, …]``): ``json_object_array`` true,
    ``json_path`` — корень массива; обязательно ``object_array_item_keys`` — список ключей в каждом элементе;
    те же ``array_allows_empty`` / ``array_max_items``. В UI — кнопки «Добавить элемент» / «Удалить» на строку
    (см. ``row_editor.js``).

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


def flatten_editor_field_numeric(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Плоский список правил формата числовых плоских полей для row_editor.js / мастера.

    Формат в config.json — блоки {\"sheet_code\", \"rules\": [ {...}, ... ] }.
    Статическое правило: \"format\": \"integer\" | \"decimal\", \"min\", \"max\",
    для decimal — \"decimal_places\" (по умолчанию 5).
    Опционально \"json_path\": путь внутри JSON-колонки (тот же \"column\"), например itemMinShow в REWARD_ADD_DATA.
    Условное: \"conditional_formats\": [ { \"when\": { \"column\": \"...\", \"equals\": \"...\" }, \"format\": \"...\", ... }, ... ],
    \"default_format\": { \"format\": \"empty_only\" } — поле не заполняется (блокировка ввода).
    """
    raw = cfg.get("editor_field_numeric")
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


def flatten_editor_field_ui(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Плоский список подписей и описаний полей для UI: {sheet_code, column, label?, description?, show_description?, json_path?}.

    Формат в config.json — как у field_enums: блоки {\"sheet_code\", \"rules\": [ {...}, ... ] }.
    Поле json_path (массив строк и/или чисел) — для листьев внутри JSON-колонки; без json_path — плоская колонка листа.

    Сокращённая запись для одной JSON-колонки с множеством путей: одно правило
    {\"column\": \"CONTEST_FEATURE\", \"paths\": [ {\"json_path\": [...], \"label\": ...}, ... ] } —
    при развёртке каждый элемент paths становится отдельной записью с тем же sheet_code и column.

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
                if not isinstance(rule, dict):
                    continue
                # Вложенные правила по json_path под одним column (см. docstring).
                if rule.get("paths") is not None and rule.get("column"):
                    col = str(rule["column"])
                    base = {k: v for k, v in rule.items() if k not in ("paths", "column")}
                    for sub in rule.get("paths") or []:
                        if not isinstance(sub, dict):
                            continue
                        merged = dict(base)
                        merged.update(sub)
                        merged["sheet_code"] = sc
                        merged["column"] = col
                        out.append(merged)
                    continue
                merged = dict(rule)
                merged["sheet_code"] = sc
                out.append(merged)
            continue
        if "column" in block:
            out.append(dict(block))
    return out
