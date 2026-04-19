# -*- coding: utf-8 -*-
"""Проверка объединённого ключа editor_field_definitions и развёртки в legacy-плоские списки."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from src import editor_config as ec

_ROOT = Path(__file__).resolve().parents[2]
_CFG_PATH = _ROOT / "config.json"


class TestEditorFieldDefinitions(unittest.TestCase):
    def test_config_has_unified_definitions(self) -> None:
        with open(_CFG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        self.assertIn("editor_field_definitions", cfg)
        self.assertNotIn("field_enums", cfg)
        defs = cfg.get("editor_field_definitions")
        self.assertIsInstance(defs, list)
        self.assertGreater(len(defs), 0)
        for block in defs:
            self.assertIn("sheet_code", block)
            self.assertIn("rules", block)

    def test_flatten_non_empty(self) -> None:
        with open(_CFG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        self.assertGreater(len(ec.flatten_field_enums(cfg)), 0)
        self.assertGreater(len(ec.flatten_editor_field_ui(cfg)), 0)

    def test_round_trip_definitions_rebuild(self) -> None:
        """Пересборка definitions из эффективных flatten совпадает по содержимому flatten."""
        with open(_CFG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        defs2 = ec.build_editor_field_definitions_from_legacy(cfg)
        legacy = ec.expand_editor_field_definitions_to_legacy_dict(defs2)
        cfg_rt = {k: v for k, v in cfg.items() if k != "editor_field_definitions"}
        cfg_rt.update(legacy)
        self.assertEqual(ec.flatten_field_enums(cfg), ec.flatten_field_enums(cfg_rt))
        self.assertEqual(ec.flatten_editor_field_ui(cfg), ec.flatten_editor_field_ui(cfg_rt))
        self.assertEqual(ec.flatten_editor_field_numeric(cfg), ec.flatten_editor_field_numeric(cfg_rt))
        self.assertEqual(ec.flatten_editor_textareas(cfg), ec.flatten_editor_textareas(cfg_rt))

    def test_legacy_only_config_still_flattens(self) -> None:
        """Обратная совместимость: четыре ключа без editor_field_definitions."""
        cfg = {
            "editor_field_definitions": [],
            "field_enums": [
                {
                    "sheet_code": "X",
                    "rules": [{"column": "C", "options": ["a"]}],
                }
            ],
            "editor_field_ui": [],
            "editor_field_numeric": [],
            "editor_textareas": [],
        }
        flat = ec.flatten_field_enums(cfg)
        self.assertEqual(len(flat), 1)
        self.assertEqual(flat[0].get("sheet_code"), "X")


if __name__ == "__main__":
    unittest.main()
