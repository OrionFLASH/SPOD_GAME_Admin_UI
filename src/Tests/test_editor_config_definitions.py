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
    @staticmethod
    def _sorted_rules(rows: list[dict]) -> list[dict]:
        def _key(r: dict) -> tuple:
            has_jp = "json_path" in r
            jp = tuple(r.get("json_path") or [])
            body = {k: v for k, v in r.items() if k not in ("sheet_code", "column", "json_path")}
            return (
                str(r.get("sheet_code") or ""),
                str(r.get("column") or ""),
                has_jp,
                jp,
                json.dumps(body, ensure_ascii=False, sort_keys=True),
            )

        return sorted(rows, key=_key)

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
        self.assertEqual(
            self._sorted_rules(ec.flatten_field_enums(cfg)),
            self._sorted_rules(ec.flatten_field_enums(cfg_rt)),
        )
        self.assertEqual(
            self._sorted_rules(ec.flatten_editor_field_ui(cfg)),
            self._sorted_rules(ec.flatten_editor_field_ui(cfg_rt)),
        )
        self.assertEqual(
            self._sorted_rules(ec.flatten_editor_field_numeric(cfg)),
            self._sorted_rules(ec.flatten_editor_field_numeric(cfg_rt)),
        )
        self.assertEqual(
            self._sorted_rules(ec.flatten_editor_textareas(cfg)),
            self._sorted_rules(ec.flatten_editor_textareas(cfg_rt)),
        )

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

    def test_empty_json_path_is_preserved_in_textareas(self) -> None:
        """json_path=[] (корень JSON) не должен теряться при развёртке definitions."""
        cfg = {
            "editor_field_definitions": [
                {
                    "sheet_code": "INDICATOR",
                    "rules": [
                        {
                            "column": "INDICATOR_FILTER",
                            "json_path": [],
                            "textarea": {
                                "json_object_array": True,
                                "object_array_item_keys": ["filtered_attribute_code"],
                            },
                        }
                    ],
                }
            ]
        }
        flat = ec.flatten_editor_textareas(cfg)
        self.assertEqual(len(flat), 1)
        self.assertIn("json_path", flat[0])
        self.assertEqual(flat[0]["json_path"], [])


if __name__ == "__main__":
    unittest.main()
