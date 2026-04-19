#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Служебное форматирование файла config.json с акцентом на массивы по ключу «options».

Назначение:
  Улучшить читаемость при диффах и ручном просмотре: короткие списки опций — в одну
  строку вместе с ключом; длинные — многострочно, при этом каждый элемент-объект
  записывается компактно (одна строка на элемент).

Правила (см. README.md, раздел 4.7):
  - Строится «кандидат-строка» вида: отступ + "options": [элементы без разрывов между ними].
  - Если длина этой строки после удаления всех пробельных символов не превышает
    MAX_NO_SPACE_LEN (120), весь блок options записывается на одной строке.
  - Иначе: "options": [ с переносом; каждый элемент на своей строке; объекты в JSON
    компактно (без пробелов после двоеточий внутри объекта).

Важно:
  - Скрипт перезаписывает весь config.json функцией write_json, не только ветки
    «options». Остальные массивы в объектах сериализуются многострочно с отступами.
  - Семантика JSON не меняется — только внешний вид файла.

Запуск из корня репозитория:
  .venv/bin/python scripts/format_config_options_lines.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, TextIO

# Корень репозитория: родитель каталога scripts/
ROOT = Path(__file__).resolve().parents[1]

# Максимальная длина строки «options» без учёта пробелов (см. README 4.7).
MAX_NO_SPACE_LEN = 120


def _compact(x: Any) -> str:
    """Строка JSON для одного элемента массива options: объекты без лишних пробелов."""
    if isinstance(x, dict):
        return json.dumps(x, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(x, ensure_ascii=False)


def _line_len_no_spaces(s: str) -> int:
    """Длина строки после удаления пробела, табуляции, переводов строки и т.д."""
    return len(re.sub(r"\s", "", s))


def write_json(obj: Any, fp: TextIO, indent_level: int = 0) -> None:
    """
    Рекурсивная запись JSON с особыми правилами для ключа «options».

    Для любого объекта-словаря, у которого ключ равен "options" и значение — список,
    применяется ветка компактной или многострочной записи (см. модульный docstring).
    Прочие ключи обрабатываются стандартно: вложенные dict/list с отступами.
    """
    spaces = "  " * indent_level
    if obj is None:
        fp.write("null")
    elif isinstance(obj, bool):
        fp.write("true" if obj else "false")
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        fp.write(str(obj))
    elif isinstance(obj, str):
        fp.write(json.dumps(obj, ensure_ascii=False))
    elif isinstance(obj, list):
        if len(obj) == 0:
            fp.write("[]")
            return
        fp.write("[\n")
        for i, item in enumerate(obj):
            fp.write(spaces + "  ")
            write_json(item, fp, indent_level + 1)
            if i < len(obj) - 1:
                fp.write(",")
            fp.write("\n")
        fp.write(spaces + "]")
    elif isinstance(obj, dict):
        keys = list(obj.keys())
        fp.write("{\n")
        for i, k in enumerate(keys):
            v = obj[k]
            fp.write(f'{spaces}  "{k}": ')
            # Единственная специальная ветка: массив options в перечислениях редактора.
            if k == "options" and isinstance(v, list):
                if len(v) == 0:
                    fp.write("[]")
                else:
                    parts = [_compact(x) for x in v]
                    inner = ",".join(parts)
                    candidate_line = f'{spaces}  "{k}": [{inner}]'
                    if _line_len_no_spaces(candidate_line) <= MAX_NO_SPACE_LEN:
                        fp.write(f"[{inner}]")
                    else:
                        fp.write("[\n")
                        for j, item in enumerate(v):
                            fp.write(f"{spaces}    {_compact(item)}")
                            if j < len(v) - 1:
                                fp.write(",")
                            fp.write("\n")
                        fp.write(f"{spaces}  ]")
            else:
                write_json(v, fp, indent_level + 1)
            if i < len(keys) - 1:
                fp.write(",")
            fp.write("\n")
        fp.write(spaces + "}")
    else:
        fp.write(json.dumps(obj, ensure_ascii=False))


def main() -> None:
    """Читает config.json, перезаписывает его результатом write_json, замена атомарная."""
    path = ROOT / "config.json"
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    out = path.with_suffix(".json.tmp")
    with open(out, "w", encoding="utf-8") as fp:
        write_json(data, fp, 0)
        fp.write("\n")
    out.replace(path)
    print(f"OK: {path} (options: ≤{MAX_NO_SPACE_LEN} символов в строке без пробелов — одна строка)")


if __name__ == "__main__":
    main()
