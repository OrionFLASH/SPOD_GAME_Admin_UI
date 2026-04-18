# -*- coding: utf-8 -*-
"""Проверка слияния field_enums с options_from_sheet."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class TestFieldEnumSheetOptions(unittest.TestCase):
    def test_merge_enum_options_order_and_dedupe(self) -> None:
        from src.field_enum_sheet_options import _merge_enum_options

        db = [{"value": "Z", "label": "Zed"}, {"value": "A", "label": "Ay"}]
        static = [{"value": "A", "label": "Static A"}, "B"]
        m = _merge_enum_options(db, static)
        vals = [x["value"] for x in m]
        self.assertEqual(vals, ["Z", "A", "B"])

    def test_sql_ident_rejects_injection(self) -> None:
        from src.field_enum_sheet_options import _sql_ident

        self.assertEqual(_sql_ident("REWARD_CODE"), "REWARD_CODE")
        with self.assertRaises(ValueError):
            _sql_ident("x; DROP")

    def test_label_template_placeholders_order(self) -> None:
        from src.field_enum_sheet_options import label_template_placeholders

        t = "{FULL_NAME}: [\"{REWARD_CODE}\"] и снова {FULL_NAME}"
        self.assertEqual(label_template_placeholders(t), ["FULL_NAME", "REWARD_CODE"])

    def test_format_label_from_template(self) -> None:
        from src.field_enum_sheet_options import format_label_from_template

        t = "{FULL_NAME}: [\"{REWARD_CODE}\"]"
        self.assertEqual(
            format_label_from_template(
                t, {"FULL_NAME": "Промо", "REWARD_CODE": "ITEM_01"}
            ),
            "Промо: [\"ITEM_01\"]",
        )


if __name__ == "__main__":
    unittest.main()
