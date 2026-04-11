# -*- coding: utf-8 -*-
"""
Разбор и сериализация JSON в нотации SPOD (тройные кавычки в CSV).

Отдельная копия логики по смыслу как в SPOD: замена тройных кавычек на обычные
перед вызовом json.loads.
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
        fixed = normalize_spod_json_string(raw)
        fixed = re.sub(r'"{2,}([^"\s]+)"{2,}', r'"\1"', fixed)
        fixed = re.sub(r'"{2,}([^"\s]+)"{2,}\s*:', r'"\1":', fixed)
        return json.loads(fixed), None
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
