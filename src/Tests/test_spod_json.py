# -*- coding: utf-8 -*-
"""Проверки разбора JSON ячеек SPOD/CSV (FILTER_PERIOD_ARR и др.)."""

from __future__ import annotations

import csv
import unittest
from pathlib import Path

from src import spod_json


class SpodJsonParseTests(unittest.TestCase):
    """Ячейки с тройными кавычками и артефактом лишней кавычки после ] (лист SCHEDULE)."""

    def test_filter_period_arr_like_csv_reader(self) -> None:
        """Как после csv.reader: лишняя " в конце и удвоенные "" у ключей."""
        cell = (
            '[{"period_code""": 1, """start_dt""": """2026-01-01""" , '
            '"""end_dt""": """2026-01-31"""}]"'
        )
        obj, err = spod_json.try_parse_cell(cell)
        self.assertIsNone(err)
        self.assertIsInstance(obj, list)
        self.assertEqual(len(obj), 1)
        self.assertEqual(obj[0]["period_code"], 1)
        self.assertEqual(obj[0]["start_dt"], "2026-01-01")
        self.assertEqual(obj[0]["end_dt"], "2026-01-31")

    def test_filter_period_arr_with_criterion(self) -> None:
        cell = (
            '[{"period_code""": 1, """criterion_mark_type""": """>=""", '
            '"""criterion_mark_value""": 0, """start_dt""":"""2025-01-01""", '
            '"""end_dt""":"""2025-01-31"""}]"'
        )
        obj, err = spod_json.try_parse_cell(cell)
        self.assertIsNone(err)
        self.assertEqual(obj[0]["criterion_mark_type"], ">=")
        self.assertEqual(obj[0]["criterion_mark_value"], 0)

    def test_target_type_empty_season(self) -> None:
        obj, err = spod_json.try_parse_cell('{"""seasonCode""": """"""}')
        self.assertIsNone(err)
        self.assertEqual(obj, {"seasonCode": ""})

    def test_all_schedule_json_cells_in_sample_csv(self) -> None:
        """Регрессия: все непустые JSON-ячейки расписания из IN/SPOD должны разбираться."""
        root = Path(__file__).resolve().parents[2]
        path = root / "IN" / "SPOD" / "SCHEDULE (PROM) 09-04 v1.csv"
        if not path.is_file():
            self.skipTest("нет файла выгрузки")
        with path.open(encoding="utf-8", newline="") as f:
            reader = csv.reader(f, delimiter=";")
            headers = next(reader)
            idx_f = headers.index("FILTER_PERIOD_ARR")
            idx_t = headers.index("TARGET_TYPE")
            for row in reader:
                for j in (idx_f, idx_t):
                    raw = (row[j] if j < len(row) else "").strip()
                    if not raw or raw == "-":
                        continue
                    obj, err = spod_json.try_parse_cell(raw)
                    self.assertIsNone(
                        err,
                        msg=f"строка {row[0] if row else ''} колонка {headers[j]}: {err}",
                    )
                    self.assertIsNotNone(obj)


if __name__ == "__main__":
    unittest.main()
