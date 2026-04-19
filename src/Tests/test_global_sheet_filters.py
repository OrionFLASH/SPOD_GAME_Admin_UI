# -*- coding: utf-8 -*-
"""Проверка пересечения множеств конкурсов в глобальных фильтрах списков."""

from __future__ import annotations

import unittest

from src import global_sheet_filters as gsf
from src.global_sheet_filters import (
    DIMENSION_ORDER,
    GlobalFilterIndex,
    has_foreign_active_global_dimensions,
    matching_contests,
    reward_row_matches_contests,
    row_matches_native_global_filters,
)


def _empty_selection() -> dict:
    return {d: set() for d in DIMENSION_ORDER}


def _minimal_index() -> GlobalFilterIndex:
    """Два конкурса: C1 с типом T1, C2 с типом T2; награда R1 только у C1."""
    return GlobalFilterIndex(
        all_contests=frozenset({"C1", "C2"}),
        contest_flat={
            "C1": {
                "CONTEST_TYPE": "T1",
                "PRODUCT_GROUP": "PG1",
                "PRODUCT": "P1",
                "TARGET_TYPE": "PROM",
                "BUSINESS_BLOCK": "B1",
            },
            "C2": {
                "CONTEST_TYPE": "T2",
                "PRODUCT_GROUP": "PG2",
                "PRODUCT": "P2",
                "TARGET_TYPE": "PROM",
                "BUSINESS_BLOCK": "B2",
            },
        },
        contest_cf_vid={},
        contest_cf_business_block={},
        contest_group_codes={"C1": {"G1"}, "C2": {"G2"}},
        contest_indicator_codes={},
        contest_schedule_rows={},
        contest_reward_codes={"C1": {"R1"}, "C2": set()},
        reward_type_by_reward={"R1": "BADGE"},
        reward_add_data={"R1": {"hidden": "N", "newsType": "TEMPLATE"}},
    )


class TestGlobalSheetFilters(unittest.TestCase):
    def test_matching_contests_intersection(self) -> None:
        ix = _minimal_index()
        self.assertEqual(matching_contests(ix, _empty_selection()), frozenset({"C1", "C2"}))

        s1 = {**_empty_selection(), "contest_type": {"T1"}}
        self.assertEqual(matching_contests(ix, s1), frozenset({"C1"}))

        s2 = {**_empty_selection(), "contest_type": {"T1"}, "group_code": {"G1"}}
        self.assertEqual(matching_contests(ix, s2), frozenset({"C1"}))

        s3 = {**_empty_selection(), "contest_type": {"T1"}, "group_code": {"G2"}}
        self.assertEqual(matching_contests(ix, s3), frozenset())

    def test_reward_visible_only_linked_contests(self) -> None:
        ix = _minimal_index()
        self.assertFalse(reward_row_matches_contests(ix, "R1", frozenset({"C2"})))
        self.assertTrue(reward_row_matches_contests(ix, "R1", frozenset({"C1"})))

    def test_row_matches_native_indicator_code(self) -> None:
        """На листе INDICATOR фильтр по коду показателя сравнивается с полем строки, а не только с конкурсом."""
        sel = {**_empty_selection(), "indicator_code": {gsf._token_for_facet("I1")}}
        row_ok = {"CONTEST_CODE": "C1", "INDICATOR_CODE": "I1", "FULL_NAME": "x"}
        row_wrong = {"CONTEST_CODE": "C1", "INDICATOR_CODE": "I2", "FULL_NAME": "y"}
        self.assertTrue(row_matches_native_global_filters("INDICATOR", row_ok, sel))
        self.assertFalse(row_matches_native_global_filters("INDICATOR", row_wrong, sel))

    def test_has_foreign_on_indicator_sheet(self) -> None:
        sel = {**_empty_selection(), "indicator_code": {gsf._token_for_facet("I1")}}
        self.assertFalse(has_foreign_active_global_dimensions("INDICATOR", sel))
        sel2 = {**_empty_selection(), "contest_type": {gsf._token_for_facet("T1")}}
        self.assertTrue(has_foreign_active_global_dimensions("INDICATOR", sel2))

    def test_row_matches_native_schedule_calc(self) -> None:
        sel = {**_empty_selection(), "sch_calc": {gsf._token_for_facet("0")}}
        row_ok = {"CONTEST_CODE": "C1", "CALC_TYPE": "0", "PERIOD_TYPE": "M", "TOURNAMENT_STATUS": "1", "TARGET_TYPE": "{}"}
        row_wrong = {"CONTEST_CODE": "C1", "CALC_TYPE": "1", "PERIOD_TYPE": "M", "TOURNAMENT_STATUS": "1", "TARGET_TYPE": "{}"}
        self.assertTrue(row_matches_native_global_filters("TOURNAMENT-SCHEDULE", row_ok, sel))
        self.assertFalse(row_matches_native_global_filters("TOURNAMENT-SCHEDULE", row_wrong, sel))

    def test_filter_heading_label_sheet_and_column(self) -> None:
        """Подпись блока: [title листа] · пояснение (колонка/путь); если пояснение = колонка — только [лист]: (поле)."""
        cfg = {
            "sheets": [
                {"code": "CONTEST-DATA", "title": "Конкурсы"},
                {"code": "INDICATOR", "title": "Показатели"},
            ]
        }
        ct = gsf._filter_block_heading_label(cfg, "contest_type")
        self.assertIn("Конкурсы", ct)
        self.assertIn("CONTEST_TYPE", ct)
        self.assertIn("Тип конкурса", ct)
        ind = gsf._filter_block_heading_label(cfg, "indicator_code")
        self.assertIn("Показатели", ind)
        self.assertIn("INDICATOR_CODE", ind)
        self.assertNotIn("INDICATOR_CODE", ind.split("(")[0])  # дубль «человеческой» части не повторяем

    def test_filter_heading_group_code_last_segment_equals_column(self) -> None:
        """GROUP · GROUP_CODE не дублирует (GROUP_CODE) в заголовке."""
        cfg = {"sheets": [{"code": "GROUP", "title": "Группы / уровни"}]}
        lbl = gsf._filter_block_heading_label(cfg, "group_code")
        self.assertEqual(lbl, "[Группы / уровни]: (GROUP_CODE)")

    def test_filter_heading_reward_season_item_tail_matches_path(self) -> None:
        """В скобках — только путь в JSON; «REWARD_ADD_DATA · seasonItem» совпадает с хвостом — без дубля пояснения."""
        cfg = {"sheets": [{"code": "REWARD", "title": "Награды"}]}
        lbl = gsf._filter_block_heading_label(cfg, "r_season_item")
        self.assertEqual(lbl, "[Награды]: (seasonItem)")

    def test_filter_heading_json_field_shows_inner_keys_in_parens(self) -> None:
        """Для фильтра по ключу внутри JSON в скобках не дублируется имя колонки-обёртки."""
        cfg = {"sheets": [{"code": "REWARD", "title": "Награды"}]}
        self.assertEqual(gsf._column_ref_from_binding(gsf.DIM_ENUM_RULE_BINDINGS["r_hidden"]), "hidden")
        lbl = gsf._filter_block_heading_label(cfg, "r_hidden")
        self.assertIn("(hidden)", lbl)
        self.assertNotIn("REWARD_ADD_DATA.hidden", lbl)

    def test_dim_label_prefers_editor_field_ui_over_global_filter_labels(self) -> None:
        """Средняя часть заголовка блока: label из editor_field_ui важнее global_filter_labels."""
        cfg = {
            "sheets": [{"code": "TOURNAMENT-SCHEDULE", "title": "Расписание турниров"}],
            "editor_field_ui": [
                {
                    "sheet_code": "TOURNAMENT-SCHEDULE",
                    "rules": [{"column": "TOURNAMENT_STATUS", "label": "Статус турнира"}],
                }
            ],
            "global_filter_labels": {"sch_status": "Расписание · статус"},
        }
        self.assertEqual(gsf._dim_label_ru_from_cfg(cfg, "sch_status"), "Статус турнира")
        heading = gsf._filter_block_heading_label(cfg, "sch_status")
        self.assertIn("Статус турнира", heading)
        self.assertNotIn("Расписание · статус", heading)


if __name__ == "__main__":
    unittest.main()
