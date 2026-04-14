# -*- coding: utf-8 -*-
"""
Разбор и сериализация JSON в нотации SPOD (тройные кавычки в CSV).

Отдельная копия логики по смыслу как в SPOD: замена тройных кавычек на обычные
перед вызовом json.loads.

Дополнительно: ячейки вроде FILTER_PERIOD_ARR в SCHEDULE после csv.reader дают
лишнюю закрывающую кавычку после ] и удвоенные кавычки у ключей — см. _repair_csv_spod_string_quoting
(зеркально в row_editor.js: repairCsvSpodStringQuoting).
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional, Tuple


def normalize_spod_json_string(s: str) -> str:
    """Заменяет тройные кавычки на обычные для последующего json.loads."""
    if not isinstance(s, str):
        return str(s)
    fixed = s.strip()
    fixed = fixed.replace('"""', '"')
    return fixed


def _repair_csv_spod_string_quoting(s: str) -> str:
    """
    Убирает типичные артефакты выгрузки SPOD после обёртки поля в кавычки CSV:
    лишняя закрывающая кавычка сразу после ] или }; удвоенные кавычки перед разделителями JSON.
    Без этого FILTER_PERIOD_ARR и похожие ячейки вида
    [{""period_code"": ...}]" не разбираются в «По полям».
    """
    out = s.strip()
    while len(out) >= 2 and out[-1] == '"' and out[-2] in ("]", "}"):
        try:
            json.loads(out[:-1])
            out = out[:-1]
        except Exception:
            break
    # Лишняя " перед }: только если закрывается непустая строка (код/дата), а не «: ""}».
    out = re.sub(r'([0-9A-Za-z_])""}', r'\1"}', out)
    prev: Optional[str] = None
    while prev != out:
        prev = out
        out = out.replace('""":', '":').replace('""",', '",')
    return out


def _parse_after_spod_normalization(raw: str) -> Any:
    """Нормализация SPOD + regex + починка кавычек, затем json.loads."""
    fixed = normalize_spod_json_string(raw)
    fixed = re.sub(r'"{2,}([^"\s]+)"{2,}', r'"\1"', fixed)
    fixed = re.sub(r'"{2,}([^"\s]+)"{2,}\s*:', r'"\1":', fixed)
    fixed = _repair_csv_spod_string_quoting(fixed)
    return json.loads(fixed)


def try_parse_cell(s: str) -> Tuple[Optional[Any], Optional[str]]:
    """
    Пытается распарсить ячейку как JSON после нормализации SPOD.
    Возвращает (объект_или_none, текст_ошибки).
    """
    if not isinstance(s, str):
        return None, None
    raw = s.strip()
    if not raw or raw in {"-", "None", "null"}:
        return None, None
    try:
        return json.loads(raw), None
    except Exception:
        pass
    try:
        return _parse_after_spod_normalization(raw), None
    except Exception as ex:
        return None, str(ex)[:500]


def format_json_for_edit(obj: Any) -> str:
    """Человекочитаемый JSON для textarea."""
    if obj is None:
        return ""
    return json.dumps(obj, ensure_ascii=False, indent=2)


def serialize_from_editor(text: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Принимает текст из редактора (ожидается валидный JSON).
    Возвращает (строка для ячейки CSV в компактном JSON, ошибка).
    """
    t = text.strip()
    if not t:
        return "", None
    try:
        obj = json.loads(t)
    except Exception as ex:
        return None, f"Невалидный JSON: {ex}"
    # Компактная сериализация; SPOD-тройные кавычки при экспорте в SPOD могут понадобиться отдельно
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")), None
