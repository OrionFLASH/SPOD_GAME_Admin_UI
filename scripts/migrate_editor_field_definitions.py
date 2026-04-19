#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Одноразовая миграция: четыре ключа field_enums, editor_field_ui, editor_field_numeric, editor_textareas
→ один ключ editor_field_definitions в config.json.

Запуск из корня репозитория:
  .venv/bin/python scripts/migrate_editor_field_definitions.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.editor_config import (  # noqa: E402
    _LEGACY_EDITOR_KEYS,
    build_editor_field_definitions_from_legacy,
)


def main() -> None:
    path = ROOT / "config.json"
    with open(path, encoding="utf-8") as f:
        cfg = json.load(f)
    defs = build_editor_field_definitions_from_legacy(cfg)
    new_cfg: dict = {}
    for k, v in cfg.items():
        if k == "editor_textareas":
            new_cfg["editor_field_definitions"] = defs
            continue
        if k in _LEGACY_EDITOR_KEYS:
            continue
        new_cfg[k] = v
    with open(path, "w", encoding="utf-8") as f:
        json.dump(new_cfg, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Записано editor_field_definitions ({len(defs)} блоков по листам), удалены {_LEGACY_EDITOR_KEYS}.")


if __name__ == "__main__":
    main()
