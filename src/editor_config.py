# -*- coding: utf-8 -*-
"""
Развёртка настроек редактора из config.json в плоский вид для row_editor.js.

Поддерживаются два формата:
- **Объединённый** ключ ``editor_field_definitions``: блоки по листу с правилами, в каждом правиле
  опциональные секции ``ui``, ``enum``, ``numeric``, ``textarea`` (вместо четырёх отдельных ключей).
- **Legacy**: отдельно ``field_enums``, ``editor_field_ui``, ``editor_field_numeric``, ``editor_textareas``.

При наличии непустого ``editor_field_definitions`` он имеет приоритет: в памяти собираются legacy-списки
и дальше работают те же ``flatten_*``, что и раньше.

У правил field_enums в rules[] опционально поле input_display (toggle / select) — передаётся в flatten_field_enums на клиент (row_editor.js).
Поддерживается и старый плоский формат (каждый элемент — полное правило с sheet_code).
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

# Ключи legacy-формата; при объединённом конфиге в файле не задаются (или игнорируются).
_LEGACY_EDITOR_KEYS: Tuple[str, ...] = (
    "field_enums",
    "editor_field_ui",
    "editor_field_numeric",
    "editor_textareas",
)


def _norm_json_path_tuple(jp: Any) -> Tuple[Any, ...]:
    if jp is None:
        return ()
    if isinstance(jp, list):
        return tuple(jp)
    return (jp,)


def _make_field_key(r: Dict[str, Any]) -> Tuple[str, str, Tuple[Any, ...]]:
    sc = str(r.get("sheet_code") or "").strip()
    col = str(r.get("column") or "").strip()
    return (sc, col, _norm_json_path_tuple(r.get("json_path")))


def _strip_to_part(rule: Dict[str, Any]) -> Dict[str, Any]:
    """Поля правила без sheet_code, column, json_path — содержимое секции ui/enum/…"""
    return {
        k: v
        for k, v in rule.items()
        if k not in ("sheet_code", "column", "json_path", "paths")
    }


def _effective_editor_cfg(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Если задан непустой ``editor_field_definitions``, подставляет четыре legacy-ключа из развёртки
    (остальные ключи конфига без изменений).
    """
    defs = cfg.get("editor_field_definitions")
    if not isinstance(defs, list) or len(defs) == 0:
        return cfg
    legacy = expand_editor_field_definitions_to_legacy_dict(defs)
    out = dict(cfg)
    for k in _LEGACY_EDITOR_KEYS:
        out.pop(k, None)
    out.update(legacy)
    return out


def expand_editor_field_definitions_to_legacy_dict(
    definitions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Преобразует ``editor_field_definitions`` в четыре списка блоков в формате legacy config.

    Каждое правило может содержать ``paths`` (как в editor_field_ui): разворачивается в атомарные правила
    по элементам ``paths``, с объединением полей родителя (кроме column/paths).
    """
    fe_blocks: List[Dict[str, Any]] = []
    ui_blocks: List[Dict[str, Any]] = []
    num_blocks: List[Dict[str, Any]] = []
    ta_blocks: List[Dict[str, Any]] = []

    for block in definitions:
        if not isinstance(block, dict):
            continue
        sc = block.get("sheet_code")
        if sc is None:
            continue
        fe_rules: List[Dict[str, Any]] = []
        ui_rules: List[Dict[str, Any]] = []
        num_rules: List[Dict[str, Any]] = []
        ta_hints: List[Dict[str, Any]] = []

        for rule in block.get("rules") or []:
            if not isinstance(rule, dict):
                continue
            col = rule.get("column")
            if not col:
                continue
            if rule.get("paths") is not None and str(col).strip():
                col_s = str(col)
                base_parent = {k: v for k, v in rule.items() if k not in ("paths", "column")}
                for sub in rule.get("paths") or []:
                    if not isinstance(sub, dict):
                        continue
                    atomic = dict(base_parent)
                    atomic["column"] = col_s
                    atomic.update(sub)
                    _append_atomic_rule_parts(
                        atomic, fe_rules, ui_rules, num_rules, ta_hints
                    )
                continue
            _append_atomic_rule_parts(rule, fe_rules, ui_rules, num_rules, ta_hints)

        if fe_rules:
            fe_blocks.append({"sheet_code": sc, "rules": fe_rules})
        if ui_rules:
            ui_blocks.append({"sheet_code": sc, "rules": ui_rules})
        if num_rules:
            num_blocks.append({"sheet_code": sc, "rules": num_rules})
        if ta_hints:
            ta_blocks.append({"sheet_code": sc, "hints": ta_hints})

    return {
        "field_enums": fe_blocks,
        "editor_field_ui": ui_blocks,
        "editor_field_numeric": num_blocks,
        "editor_textareas": ta_blocks,
    }


def _append_atomic_rule_parts(
    rule: Dict[str, Any],
    fe_rules: List[Dict[str, Any]],
    ui_rules: List[Dict[str, Any]],
    num_rules: List[Dict[str, Any]],
    ta_hints: List[Dict[str, Any]],
) -> None:
    """Из атомарного правила объединённого формата собирает записи для legacy-списков."""
    col = rule.get("column")
    if not col:
        return
    base: Dict[str, Any] = {"column": col}
    jp = rule.get("json_path")
    if isinstance(jp, list) and len(jp) > 0:
        base["json_path"] = jp

    ui = rule.get("ui")
    if isinstance(ui, dict) and ui:
        ui_rules.append({**base, **ui})

    enum = rule.get("enum")
    if isinstance(enum, dict) and enum:
        fe_rules.append({**base, **enum})

    num = rule.get("numeric")
    if isinstance(num, dict) and num:
        num_rules.append({**base, **num})

    ta = rule.get("textarea")
    if isinstance(ta, dict) and ta:
        ta_hints.append({**base, **ta})


def build_editor_field_definitions_from_legacy(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Собирает объединённый список ``editor_field_definitions`` из четырёх legacy-ключей
    (для миграции и проверок). Порядок полей: как первое появление в field_enums → ui → numeric → textarea.

    Если в конфиге уже только ``editor_field_definitions``, сначала разворачивает его во временные
    четыре ключа (как при работе приложения), затем собирает объединённый список заново.
    """
    eff = _effective_editor_cfg(cfg)
    eff.pop("editor_field_definitions", None)

    index: Dict[Tuple[str, str, Tuple[Any, ...]], Dict[str, Any]] = {}
    order: List[Tuple[str, str, Tuple[Any, ...]]] = []

    def ensure_key(k: Tuple[str, str, Tuple[Any, ...]]) -> None:
        if k not in index:
            index[k] = {}
            order.append(k)

    def ingest(flat_iter: List[Dict[str, Any]], part: str) -> None:
        for r in flat_iter:
            if not isinstance(r, dict):
                continue
            k = _make_field_key(r)
            if not k[0] or not k[1]:
                continue
            ensure_key(k)
            body = _strip_to_part(r)
            if body:
                index[k][part] = body

    ingest(flatten_field_enums(eff), "enum")
    ingest(flatten_editor_field_ui(eff), "ui")
    ingest(flatten_editor_field_numeric(eff), "numeric")
    ingest(flatten_editor_textareas(eff), "textarea")

    sheet_order: List[str] = []
    seen_sc: set = set()
    for k in order:
        sc = k[0]
        if sc not in seen_sc:
            seen_sc.add(sc)
            sheet_order.append(sc)

    by_sheet: Dict[str, List[Dict[str, Any]]] = {sc: [] for sc in sheet_order}

    for k in order:
        sc, col, jpt = k
        parts = index.get(k) or {}
        if not parts:
            continue
        row: Dict[str, Any] = {"column": col}
        if jpt:
            row["json_path"] = list(jpt)
        if parts.get("ui"):
            row["ui"] = parts["ui"]
        if parts.get("enum"):
            row["enum"] = parts["enum"]
        if parts.get("numeric"):
            row["numeric"] = parts["numeric"]
        if parts.get("textarea"):
            row["textarea"] = parts["textarea"]
        by_sheet[sc].append(row)

    return [{"sheet_code": sc, "rules": by_sheet[sc]} for sc in sheet_order if by_sheet[sc]]


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
    eff = _effective_editor_cfg(cfg)
    raw = eff.get("field_enums")
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
    eff = _effective_editor_cfg(cfg)
    raw = eff.get("editor_textareas")
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
    eff = _effective_editor_cfg(cfg)
    raw = eff.get("editor_field_numeric")
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
    eff = _effective_editor_cfg(cfg)
    raw = eff.get("editor_field_ui")
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
