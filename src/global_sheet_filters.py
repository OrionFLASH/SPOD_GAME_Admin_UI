# -*- coding: utf-8 -*-
"""
Глобальные фильтры списков листов по связям через CONTEST_CODE.

Собирается индекс по актуальным строкам (is_current=1) всех листов; выбранные
значения в query-параметрах `gf_*` дают пересечение множеств конкурсов; строка
текущего листа показывается, если её CONTEST_CODE (или связанные через REWARD-LINK
коды конкурсов для REWARD) попадает в это пересечение — **для измерений, поле
которых отсутствует на текущем листе** (фильтр только через связанные данные).

Если измерение привязано к тому же листу, что и список (`DIM_ENUM_RULE_BINDINGS`),
строка должна совпадать **по значению этого поля** (или по JSON-пути): пересечение
множества токенов строки с выбранными значениями; несколько отмеченных значений —
логическое ИЛИ внутри измерения. Это устраняет ложные попадания (например все
показатели конкурса при фильтре только по одному `INDICATOR_CODE`).

Варианты значений для каждого фильтра (facets) считаются по конкурсам, удовлетворяющим
**остальным** активным фильтрам (без текущего измерения), чтобы списки вариантов
сужались взаимно и не предлагали заведомо пустые комбинации.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, FrozenSet, List, Sequence, Set, Tuple

from starlette.requests import Request

from src import spod_json
from src.sheet_list_display import (
    _cells_rows,
    contest_type_filter_options,
    reward_type_filter_options,
    target_type_season_code,
)


# Внутренний ключ измерения → имя query-параметра (множественные значения getlist).
DIM_QUERY_PARAM: Dict[str, str] = {
    "contest_type": "gf_contest_type",
    "product_group": "gf_product_group",
    "product": "gf_product",
    "contest_target_type": "gf_contest_target_type",
    "business_block": "gf_business_block",
    "cf_vid": "gf_cf_vid",
    "cf_business_block": "gf_cf_business_block",
    "group_code": "gf_group_code",
    "reward_type": "gf_reward_type",
    "r_hidden": "gf_r_hidden",
    "r_hidden_reward_list": "gf_r_hidden_reward_list",
    "r_business_block": "gf_r_business_block",
    "r_outstanding": "gf_r_outstanding",
    "r_news_type": "gf_r_news_type",
    "r_er_season": "gf_r_er_season",
    "r_season_item": "gf_r_season_item",
    "indicator_code": "gf_indicator_code",
    "sch_period": "gf_sch_period",
    "sch_status": "gf_sch_status",
    "sch_calc": "gf_sch_calc",
    "sch_season": "gf_sch_season",
}

DIMENSION_ORDER: List[str] = list(DIM_QUERY_PARAM.keys())

# Ключ измерения награды → путь сегментов в REWARD_ADD_DATA.
_REWARD_PATHS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("r_hidden", ("hidden",)),
    ("r_hidden_reward_list", ("hiddenRewardList",)),
    ("r_business_block", ("businessBlock",)),
    ("r_outstanding", ("outstanding",)),
    ("r_news_type", ("newsType",)),
    ("r_er_season", ("getCondition", "employeeRating", "seasonCode")),
    ("r_season_item", ("seasonItem",)),
)
_REWARD_PATHS_MAP: Dict[str, Tuple[str, ...]] = dict(_REWARD_PATHS)

# Подписи блоков глобальных фильтров по умолчанию, если в config.json не задан global_filter_labels[dim].
# Актуальные строки для продакшена задаются в config.json → global_filter_labels (строка или { "label_ru": "..." }).
DIM_LABEL_RU: Dict[str, str] = {
    "contest_type": "Тип конкурса",
    "product_group": "Продукт. группа",
    "product": "Продукт",
    "contest_target_type": "Цель расчёта (конкурс)",
    "business_block": "Бизнес-блок",
    "cf_vid": "CONTEST_FEATURE · vid",
    "cf_business_block": "CONTEST_FEATURE · businessBlock",
    "group_code": "GROUP · GROUP_CODE",
    "reward_type": "Тип награды",
    "r_hidden": "REWARD_ADD_DATA · hidden",
    "r_hidden_reward_list": "REWARD_ADD_DATA · hiddenRewardList",
    "r_business_block": "REWARD_ADD_DATA · businessBlock",
    "r_outstanding": "REWARD_ADD_DATA · outstanding",
    "r_news_type": "REWARD_ADD_DATA · newsType",
    "r_er_season": "REWARD_ADD_DATA · getCondition…seasonCode",
    "r_season_item": "REWARD_ADD_DATA · seasonItem",
    "indicator_code": "INDICATOR_CODE",
    "sch_period": "Расписание · PERIOD_TYPE",
    "sch_status": "Расписание · статус",
    "sch_calc": "Расписание · CALC_TYPE",
    "sch_season": "Расписание · seasonCode (JSON)",
}

# Привязка измерения глобального фильтра к enum-правилу из config.field_enums.
# json_path задан там, где фильтр строится по JSON-колонке.
DIM_ENUM_RULE_BINDINGS: Dict[str, Dict[str, Any]] = {
    "contest_type": {"sheet_code": "CONTEST-DATA", "column": "CONTEST_TYPE"},
    "business_block": {"sheet_code": "CONTEST-DATA", "column": "BUSINESS_BLOCK"},
    "group_code": {"sheet_code": "GROUP", "column": "GROUP_CODE"},
    "reward_type": {"sheet_code": "REWARD", "column": "REWARD_TYPE"},
    "indicator_code": {"sheet_code": "INDICATOR", "column": "INDICATOR_CODE"},
    "sch_calc": {"sheet_code": "TOURNAMENT-SCHEDULE", "column": "CALC_TYPE"},
    "sch_status": {"sheet_code": "TOURNAMENT-SCHEDULE", "column": "TOURNAMENT_STATUS"},
    "sch_period": {"sheet_code": "TOURNAMENT-SCHEDULE", "column": "PERIOD_TYPE"},
    "sch_season": {"sheet_code": "TOURNAMENT-SCHEDULE", "column": "TARGET_TYPE", "json_path": ["seasonCode"]},
    "contest_target_type": {"sheet_code": "CONTEST-DATA", "column": "TARGET_TYPE"},
    "product_group": {"sheet_code": "CONTEST-DATA", "column": "PRODUCT_GROUP"},
    "product": {"sheet_code": "CONTEST-DATA", "column": "PRODUCT"},
    "cf_vid": {"sheet_code": "CONTEST-DATA", "column": "CONTEST_FEATURE", "json_path": ["vid"]},
    "cf_business_block": {"sheet_code": "CONTEST-DATA", "column": "CONTEST_FEATURE", "json_path": ["businessBlock"]},
    "r_hidden": {"sheet_code": "REWARD", "column": "REWARD_ADD_DATA", "json_path": ["hidden"]},
    "r_hidden_reward_list": {"sheet_code": "REWARD", "column": "REWARD_ADD_DATA", "json_path": ["hiddenRewardList"]},
    "r_business_block": {"sheet_code": "REWARD", "column": "REWARD_ADD_DATA", "json_path": ["businessBlock", 0]},
    "r_outstanding": {"sheet_code": "REWARD", "column": "REWARD_ADD_DATA", "json_path": ["outstanding"]},
    "r_news_type": {"sheet_code": "REWARD", "column": "REWARD_ADD_DATA", "json_path": ["newsType"]},
    "r_er_season": {
        "sheet_code": "REWARD",
        "column": "REWARD_ADD_DATA",
        "json_path": ["getCondition", "employeeRating", "seasonCode"],
    },
    "r_season_item": {"sheet_code": "REWARD", "column": "REWARD_ADD_DATA", "json_path": ["seasonItem"]},
}


def _enum_rule_for_dim(cfg: Dict[str, Any], dim: str) -> Dict[str, Any] | None:
    """Найти правило field_enums, связанное с измерением глобального фильтра."""
    bind = DIM_ENUM_RULE_BINDINGS.get(dim)
    if not bind:
        return None
    from src import editor_config

    want_sheet = str(bind.get("sheet_code") or "")
    want_col = str(bind.get("column") or "")
    want_path = bind.get("json_path")
    for rule in editor_config.flatten_field_enums(cfg):
        if str(rule.get("sheet_code") or "") != want_sheet:
            continue
        if str(rule.get("column") or "") != want_col:
            continue
        if want_path is not None and list(rule.get("json_path") or []) != list(want_path):
            continue
        if want_path is None and rule.get("json_path") is not None:
            continue
        return rule
    return None


def _norm(s: Any) -> str:
    return str(s if s is not None else "").strip()


def _token_for_facet(s: str) -> str:
    """Токен для сравнения в фильтре и в URL (пустая строка — отдельный маркер)."""
    t = str(s).strip()
    return "__SPOD_EMPTY__" if t == "" else t


def _label_from_token(tok: str) -> str:
    if tok == "__SPOD_EMPTY__":
        return "(пусто)"
    return tok if len(tok) <= 64 else tok[:61] + "…"


def _parse_obj(raw: str) -> Any:
    obj, err = spod_json.try_parse_cell(raw or "")
    if err is not None:
        return None
    return obj


def _scalar_values_from_json_leaf(obj: Any) -> Set[str]:
    """Скаляр или список примитивов → множество нормализованных строк (пустые отбрасываем)."""
    out: Set[str] = set()
    if obj is None:
        return out
    if isinstance(obj, list):
        for it in obj:
            if isinstance(it, (dict, list)):
                out.add(json.dumps(it, ensure_ascii=False))
            else:
                v = _norm(it)
                if v != "":
                    out.add(v)
        return out
    if isinstance(obj, dict):
        out.add(json.dumps(obj, ensure_ascii=False))
        return out
    v = _norm(obj)
    if v != "":
        out.add(v)
    return out


def _reward_add_data_values(add: Any, path: Sequence[str]) -> Set[str]:
    """Значения по пути в REWARD_ADD_DATA (массив на конце разворачивается через _scalar_values_from_json_leaf)."""
    if not isinstance(add, dict) or len(path) == 0:
        return set()
    cur: Any = add
    for p in path[:-1]:
        if not isinstance(cur, dict):
            return set()
        cur = cur.get(p)
    if not isinstance(cur, dict):
        return set()
    leaf = cur.get(path[-1])
    return _scalar_values_from_json_leaf(leaf)


def _navigate_json_path(cur: Any, path: Sequence[Any]) -> Any:
    """
    Обход вложенного JSON по сегментам пути (ключи dict или индекс list).
    Возвращает узел у последнего сегмента или None при обрыве.
    """
    for seg in path:
        if cur is None:
            return None
        if isinstance(cur, dict) and seg in cur:
            cur = cur[seg]
        elif isinstance(cur, list) and isinstance(seg, int):
            if 0 <= seg < len(cur):
                cur = cur[seg]
            else:
                return None
        else:
            return None
    return cur


def _tokens_from_row_binding(cells: Dict[str, str], bind: Dict[str, Any]) -> Set[str]:
    """
    Множество токенов измерения (как в ``selection_from_request``) из ячеек строки
    по привязке ``DIM_ENUM_RULE_BINDINGS``: плоская колонка или JSON + ``json_path``.
    """
    col = str(bind.get("column") or "")
    jp = bind.get("json_path")
    sh = str(bind.get("sheet_code") or "")
    if not col:
        return set()
    if jp is None:
        return {_token_for_facet(_norm(cells.get(col, "")))}
    path_list = list(jp)
    if sh == "TOURNAMENT-SCHEDULE" and col == "TARGET_TYPE" and path_list == ["seasonCode"]:
        s = target_type_season_code(cells.get("TARGET_TYPE") or "")
        return {_token_for_facet(s)}
    raw = cells.get(col) or ""
    obj = _parse_obj(raw)
    if obj is None:
        return set()
    leaf = _navigate_json_path(obj, path_list)
    vals = _scalar_values_from_json_leaf(leaf)
    return {_token_for_facet(v) for v in vals}


def row_matches_native_global_filters(
    sheet_code: str, cells: Dict[str, str], gf_sel: Dict[str, Set[str]]
) -> bool:
    """
    True, если для каждого непустого измерения, привязанного к ``sheet_code``,
    значения строки пересекаются с выбранными токенами (ИЛИ внутри измерения).
    """
    for dim in DIMENSION_ORDER:
        sel_tokens = gf_sel.get(dim) or set()
        if not sel_tokens:
            continue
        bind = DIM_ENUM_RULE_BINDINGS.get(dim)
        if not bind or str(bind.get("sheet_code")) != sheet_code:
            continue
        row_tokens = _tokens_from_row_binding(cells, bind)
        if not (row_tokens & sel_tokens):
            return False
    return True


def has_foreign_active_global_dimensions(sheet_code: str, gf_sel: Dict[str, Set[str]]) -> bool:
    """
    True, если среди непустых измерений есть хотя бы одно, не привязанное к текущему листу
    (его ограничение передаётся только через ``matching_contests`` / связь REWARD).
    """
    for dim in DIMENSION_ORDER:
        if not (gf_sel.get(dim) or set()):
            continue
        bind = DIM_ENUM_RULE_BINDINGS.get(dim)
        if not bind or str(bind.get("sheet_code")) != sheet_code:
            return True
    return False


@dataclass
class GlobalFilterIndex:
    """Снимок данных для фильтрации по конкурсам."""

    all_contests: FrozenSet[str]
    contest_flat: Dict[str, Dict[str, str]] = field(default_factory=dict)
    contest_cf_vid: Dict[str, Set[str]] = field(default_factory=dict)
    contest_cf_business_block: Dict[str, Set[str]] = field(default_factory=dict)
    contest_group_codes: Dict[str, Set[str]] = field(default_factory=dict)
    contest_indicator_codes: Dict[str, Set[str]] = field(default_factory=dict)
    contest_schedule_rows: Dict[str, List[Dict[str, str]]] = field(default_factory=dict)
    contest_reward_codes: Dict[str, Set[str]] = field(default_factory=dict)
    reward_type_by_reward: Dict[str, str] = field(default_factory=dict)
    reward_add_data: Dict[str, Any] = field(default_factory=dict)


def build_filter_index(conn: Any) -> GlobalFilterIndex:
    """Читает все листы и строит индекс (один проход на запрос списка)."""
    contest_flat: Dict[str, Dict[str, str]] = {}
    cf_vid: Dict[str, Set[str]] = {}
    cf_bb: Dict[str, Set[str]] = {}
    group_codes: Dict[str, Set[str]] = defaultdict(set)
    ind_codes: Dict[str, Set[str]] = defaultdict(set)
    sch_rows: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    cr: Dict[str, Set[str]] = defaultdict(set)
    reward_add: Dict[str, Any] = {}
    reward_type_by_reward: Dict[str, str] = {}

    for c in _cells_rows(conn, "CONTEST-DATA"):
        cc = _norm(c.get("CONTEST_CODE"))
        if not cc:
            continue
        contest_flat[cc] = {
            "CONTEST_TYPE": _norm(c.get("CONTEST_TYPE")),
            "PRODUCT_GROUP": _norm(c.get("PRODUCT_GROUP")),
            "PRODUCT": _norm(c.get("PRODUCT")),
            "TARGET_TYPE": _norm(c.get("TARGET_TYPE")),
            "BUSINESS_BLOCK": _norm(c.get("BUSINESS_BLOCK")),
        }
        feat = _parse_obj(c.get("CONTEST_FEATURE") or "")
        if isinstance(feat, dict):
            vset = _scalar_values_from_json_leaf(feat.get("vid"))
            if vset:
                cf_vid[cc] = vset
            bbset = _scalar_values_from_json_leaf(feat.get("businessBlock"))
            if bbset:
                cf_bb[cc] = bbset

    for c in _cells_rows(conn, "GROUP"):
        cc = _norm(c.get("CONTEST_CODE"))
        gc = _norm(c.get("GROUP_CODE"))
        if cc and gc:
            group_codes[cc].add(gc)

    for c in _cells_rows(conn, "INDICATOR"):
        cc = _norm(c.get("CONTEST_CODE"))
        ic = _norm(c.get("INDICATOR_CODE"))
        if cc and ic:
            ind_codes[cc].add(ic)

    for c in _cells_rows(conn, "TOURNAMENT-SCHEDULE"):
        cc = _norm(c.get("CONTEST_CODE"))
        if not cc:
            continue
        sch_rows[cc].append(
            {
                "period": _norm(c.get("PERIOD_TYPE")),
                "status": _norm(c.get("TOURNAMENT_STATUS")),
                "calc": _norm(c.get("CALC_TYPE")),
                "season": target_type_season_code(c.get("TARGET_TYPE") or ""),
            }
        )

    for c in _cells_rows(conn, "REWARD-LINK"):
        cc = _norm(c.get("CONTEST_CODE"))
        rc = _norm(c.get("REWARD_CODE"))
        if cc and rc:
            cr[cc].add(rc)

    for c in _cells_rows(conn, "REWARD"):
        rc = _norm(c.get("REWARD_CODE"))
        if not rc:
            continue
        reward_type_by_reward[rc] = _norm(c.get("REWARD_TYPE"))
        raw = c.get("REWARD_ADD_DATA") or ""
        reward_add[rc] = _parse_obj(raw)
        if not isinstance(reward_add[rc], dict):
            reward_add[rc] = None

    all_cc = frozenset(contest_flat.keys())
    return GlobalFilterIndex(
        all_contests=all_cc,
        contest_flat=contest_flat,
        contest_cf_vid=cf_vid,
        contest_cf_business_block=cf_bb,
        contest_group_codes=dict(group_codes),
        contest_indicator_codes=dict(ind_codes),
        contest_schedule_rows=dict(sch_rows),
        contest_reward_codes=dict(cr),
        reward_type_by_reward=reward_type_by_reward,
        reward_add_data=reward_add,
    )


def _contest_matches_flat(ix: GlobalFilterIndex, cc: str, flat_key: str, selected: Set[str]) -> bool:
    """Плоское поле в contest_flat (ключ словаря совпадает с именем колонки CONTEST-DATA)."""
    if not selected:
        return True
    row = ix.contest_flat.get(cc) or {}
    return _token_for_facet(row.get(flat_key, "")) in selected


def _contest_matches_cf_set(
    per_contest: Dict[str, Set[str]], cc: str, selected: Set[str]
) -> bool:
    if not selected:
        return True
    vals = per_contest.get(cc) or set()
    tok_vals = {_token_for_facet(x) for x in vals}
    return bool(tok_vals & set(selected))


def _contest_matches_reward_dim(
    ix: GlobalFilterIndex,
    cc: str,
    path: Sequence[str],
    selected: Set[str],
) -> bool:
    """Есть связанная награда с любым из выбранных значений по пути в REWARD_ADD_DATA."""
    if not selected:
        return True
    rcs = ix.contest_reward_codes.get(cc) or set()
    for rc in rcs:
        add = ix.reward_add_data.get(rc)
        vals = _reward_add_data_values(add, path)
        if vals and ( {_token_for_facet(x) for x in vals} & set(selected) ):
            return True
    return False


def _contest_matches_reward_type(ix: GlobalFilterIndex, cc: str, selected: Set[str]) -> bool:
    if not selected:
        return True
    rcs = ix.contest_reward_codes.get(cc) or set()
    for rc in rcs:
        rt = _token_for_facet(ix.reward_type_by_reward.get(rc, ""))
        if rt in selected:
            return True
    return False


def _contest_matches_schedule(ix: GlobalFilterIndex, cc: str, sel: Dict[str, Set[str]]) -> bool:
    periods = sel.get("sch_period") or set()
    statuses = sel.get("sch_status") or set()
    calcs = sel.get("sch_calc") or set()
    seasons = sel.get("sch_season") or set()
    if not periods and not statuses and not calcs and not seasons:
        return True
    rows = ix.contest_schedule_rows.get(cc) or []
    for row in rows:
        if periods and _token_for_facet(row.get("period", "")) not in periods:
            continue
        if statuses and _token_for_facet(row.get("status", "")) not in statuses:
            continue
        if calcs and _token_for_facet(row.get("calc", "")) not in calcs:
            continue
        if seasons and _token_for_facet(row.get("season", "")) not in seasons:
            continue
        return True
    return False


def selection_from_request(request: Request, ix: GlobalFilterIndex) -> Dict[str, Set[str]]:
    """
    Читает getlist для каждого gf_* и оставляет только значения из полного universe
    этого измерения (защита от подделки query).
    """
    universe = _full_universe_per_dim(ix)
    out: Dict[str, Set[str]] = {}
    for dim, param in DIM_QUERY_PARAM.items():
        allowed = universe.get(dim) or set()
        raw = [x.strip() for x in request.query_params.getlist(param) if x.strip() != ""]
        picked = {x for x in raw if x in allowed}
        out[dim] = picked
    return out


def _full_universe_per_dim(ix: GlobalFilterIndex) -> Dict[str, Set[str]]:
    u: Dict[str, Set[str]] = {d: set() for d in DIMENSION_ORDER}
    for cc in ix.all_contests:
        row = ix.contest_flat.get(cc) or {}
        u["contest_type"].add(_token_for_facet(row.get("CONTEST_TYPE", "")))
        u["product_group"].add(_token_for_facet(row.get("PRODUCT_GROUP", "")))
        u["product"].add(_token_for_facet(row.get("PRODUCT", "")))
        u["contest_target_type"].add(_token_for_facet(row.get("TARGET_TYPE", "")))
        u["business_block"].add(_token_for_facet(row.get("BUSINESS_BLOCK", "")))
        for x in ix.contest_cf_vid.get(cc, ()):
            u["cf_vid"].add(_token_for_facet(x))
        for x in ix.contest_cf_business_block.get(cc, ()):
            u["cf_business_block"].add(_token_for_facet(x))
        for x in ix.contest_group_codes.get(cc, ()):
            u["group_code"].add(_token_for_facet(x))
        for x in ix.contest_indicator_codes.get(cc, ()):
            u["indicator_code"].add(_token_for_facet(x))
        for rc in ix.contest_reward_codes.get(cc, ()):
            u["reward_type"].add(_token_for_facet(ix.reward_type_by_reward.get(rc, "")))
            add = ix.reward_add_data.get(rc)
            for dim, path in _REWARD_PATHS:
                for v in _reward_add_data_values(add, path):
                    u[dim].add(_token_for_facet(v))
        for row in ix.contest_schedule_rows.get(cc, ()):
            u["sch_period"].add(_token_for_facet(row.get("period", "")))
            u["sch_status"].add(_token_for_facet(row.get("status", "")))
            u["sch_calc"].add(_token_for_facet(row.get("calc", "")))
            u["sch_season"].add(_token_for_facet(row.get("season", "")))
    return u


def matching_contests(ix: GlobalFilterIndex, sel: Dict[str, Set[str]]) -> FrozenSet[str]:
    """Пересечение множеств конкурсов по всем непустым измерениям в sel."""
    s = set(ix.all_contests)
    if not s:
        return frozenset()
    s = {cc for cc in s if _contest_matches_flat(ix, cc, "CONTEST_TYPE", sel.get("contest_type") or set())}
    s = {cc for cc in s if _contest_matches_flat(ix, cc, "PRODUCT_GROUP", sel.get("product_group") or set())}
    s = {cc for cc in s if _contest_matches_flat(ix, cc, "PRODUCT", sel.get("product") or set())}
    s = {cc for cc in s if _contest_matches_flat(ix, cc, "TARGET_TYPE", sel.get("contest_target_type") or set())}
    s = {cc for cc in s if _contest_matches_flat(ix, cc, "BUSINESS_BLOCK", sel.get("business_block") or set())}
    s = {cc for cc in s if _contest_matches_cf_set(ix.contest_cf_vid, cc, sel.get("cf_vid") or set())}
    s = {cc for cc in s if _contest_matches_cf_set(ix.contest_cf_business_block, cc, sel.get("cf_business_block") or set())}
    s = {cc for cc in s if _contest_matches_cf_set(ix.contest_group_codes, cc, sel.get("group_code") or set())}
    s = {cc for cc in s if _contest_matches_reward_type(ix, cc, sel.get("reward_type") or set())}
    for dim, path in _REWARD_PATHS:
        s = {cc for cc in s if _contest_matches_reward_dim(ix, cc, path, sel.get(dim) or set())}
    s = {cc for cc in s if _contest_matches_cf_set(ix.contest_indicator_codes, cc, sel.get("indicator_code") or set())}
    s = {cc for cc in s if _contest_matches_schedule(ix, cc, sel)}
    return frozenset(s)


def _selection_without(sel: Dict[str, Set[str]], skip_dim: str) -> Dict[str, Set[str]]:
    out = {k: set(v) for k, v in sel.items()}
    out[skip_dim] = set()
    return out


def facet_values_for_dim(
    ix: GlobalFilterIndex,
    sel: Dict[str, Set[str]],
    dim: str,
    cfg: Dict[str, Any],
) -> List[Dict[str, str]]:
    """Варианты для измерения dim при активных прочих фильтрах (взаимное сужение)."""
    s_rest = matching_contests(ix, _selection_without(sel, dim))
    vals: Set[str] = set()
    for cc in s_rest:
        if dim == "contest_type":
            row = ix.contest_flat.get(cc) or {}
            vals.add(_token_for_facet(row.get("CONTEST_TYPE", "")))
        elif dim == "product_group":
            row = ix.contest_flat.get(cc) or {}
            vals.add(_token_for_facet(row.get("PRODUCT_GROUP", "")))
        elif dim == "product":
            row = ix.contest_flat.get(cc) or {}
            vals.add(_token_for_facet(row.get("PRODUCT", "")))
        elif dim == "contest_target_type":
            row = ix.contest_flat.get(cc) or {}
            vals.add(_token_for_facet(row.get("TARGET_TYPE", "")))
        elif dim == "business_block":
            row = ix.contest_flat.get(cc) or {}
            vals.add(_token_for_facet(row.get("BUSINESS_BLOCK", "")))
        elif dim == "cf_vid":
            for x in ix.contest_cf_vid.get(cc, ()):
                vals.add(_token_for_facet(x))
        elif dim == "cf_business_block":
            for x in ix.contest_cf_business_block.get(cc, ()):
                vals.add(_token_for_facet(x))
        elif dim == "group_code":
            for x in ix.contest_group_codes.get(cc, ()):
                vals.add(_token_for_facet(x))
        elif dim == "indicator_code":
            for x in ix.contest_indicator_codes.get(cc, ()):
                vals.add(_token_for_facet(x))
        elif dim == "reward_type":
            for rc in ix.contest_reward_codes.get(cc, ()):
                vals.add(_token_for_facet(ix.reward_type_by_reward.get(rc, "")))
        elif dim in _REWARD_PATHS_MAP:
            path = _REWARD_PATHS_MAP[dim]
            for rc in ix.contest_reward_codes.get(cc, ()):
                add = ix.reward_add_data.get(rc)
                for v in _reward_add_data_values(add, path):
                    vals.add(_token_for_facet(v))
        elif dim == "sch_period":
            for row in ix.contest_schedule_rows.get(cc, ()):
                vals.add(_token_for_facet(row.get("period", "")))
        elif dim == "sch_status":
            for row in ix.contest_schedule_rows.get(cc, ()):
                vals.add(_token_for_facet(row.get("status", "")))
        elif dim == "sch_calc":
            for row in ix.contest_schedule_rows.get(cc, ()):
                vals.add(_token_for_facet(row.get("calc", "")))
        elif dim == "sch_season":
            for row in ix.contest_schedule_rows.get(cc, ()):
                vals.add(_token_for_facet(row.get("season", "")))

    # Оставить выбранные «осиротевшие» значения видимыми.
    vals |= set(sel.get(dim) or set())

    # Упорядочить: для типов конкурса/награды — порядок из field_enums, остальное sorted.
    tokens = sorted(vals, key=lambda t: (t == "__SPOD_EMPTY__", t.lower()))
    if dim == "contest_type":
        order = [_token_for_facet(str(o.get("value", ""))) for o in contest_type_filter_options(cfg, for_multiselect_list=True)]
        tokens = _sort_by_order_then_alpha(tokens, order)
    elif dim == "reward_type":
        order = [_token_for_facet(str(o.get("value", ""))) for o in reward_type_filter_options(cfg, for_multiselect_list=True)]
        tokens = _sort_by_order_then_alpha(tokens, order)
    # Выбранные значения поднимаем в начало списка, сохраняя их текущий порядок.
    picked = set(sel.get(dim) or set())
    if picked:
        tokens = _selected_first(tokens, picked)

    out_opts: List[Dict[str, str]] = []
    for tok in tokens:
        out_opts.append({"value": tok, "label": _human_label_for_token(cfg, dim, tok)})
    return out_opts


def _selected_first(tokens: List[str], selected: Set[str]) -> List[str]:
    """Стабильное разбиение: выбранные значения первыми, затем остальные."""
    if not tokens or not selected:
        return tokens
    selected_tokens = [t for t in tokens if t in selected]
    other_tokens = [t for t in tokens if t not in selected]
    return selected_tokens + other_tokens


def _sort_by_order_then_alpha(tokens: List[str], preferred: List[str]) -> List[str]:
    rank = {t: i for i, t in enumerate(preferred) if t}
    return sorted(tokens, key=lambda t: (rank.get(t, 10_000), t.lower()))


def _enum_label_for_dim_token(cfg: Dict[str, Any], dim: str, tok: str) -> str | None:
    """
    Возвращает label из field_enums для данного измерения и токена, если есть
    объект-опция {value,label}. Иначе None.
    """
    rule = _enum_rule_for_dim(cfg, dim)
    if not rule:
        return None
    for o in (rule.get("options") or []):
        if not isinstance(o, dict):
            continue
        v = _token_for_facet(str(o.get("value", "")))
        if v != tok:
            continue
        lbl = str(o.get("label") or "").strip()
        if lbl:
            return lbl
    return None


def _human_label_for_token(cfg: Dict[str, Any], dim: str, tok: str) -> str:
    """Подпись чипа: label из field_enums (если есть), иначе токен."""
    if tok == "__SPOD_EMPTY__":
        return "(пусто)"
    lbl = _enum_label_for_dim_token(cfg, dim, tok)
    if lbl:
        return lbl
    return _label_from_token(tok)


def _sheet_title_for_code(cfg: Dict[str, Any], sheet_code: str) -> str:
    """Заголовок листа из config.json (sheets[].title), иначе код листа."""
    sc = (sheet_code or "").strip()
    if not sc:
        return ""
    for s in cfg.get("sheets") or []:
        if not isinstance(s, dict):
            continue
        if str(s.get("code") or "").strip() != sc:
            continue
        t = str(s.get("title") or "").strip()
        return t if t else sc
    return sc


def _column_ref_from_binding(bind: Dict[str, Any]) -> str:
    """
    Короткое имя поля для скобок в заголовке блока фильтра.
    Плоская колонка — её имя; поле внутри JSON — только путь по ключам (без имени колонки-обёртки),
    например ``hidden`` вместо ``REWARD_ADD_DATA.hidden``.
    """
    col = str(bind.get("column") or "").strip()
    jp = bind.get("json_path")
    if not isinstance(jp, list) or not jp:
        return col
    tail = ".".join(str(p) for p in jp)
    return tail if tail else col


def _human_label_redundant_with_column(human: str, col_only: str, col_ref: str) -> bool:
    """
    True, если строка DIM_LABEL_RU не должна выводиться отдельно от (поле):
    совпадает с колонкой/путём, либо последний сегмент после « · » повторяет имя колонки
    или конечный фрагмент пути (как в GROUP · GROUP_CODE или … · seasonItem при col_ref *.seasonItem).
    """
    h = (human or "").strip()
    co = (col_only or "").strip()
    cr = (col_ref or "").strip()
    if not h:
        return True
    if not co and not cr:
        return False
    hu, cou, cru = h.upper(), co.upper(), cr.upper()
    if hu == cou or hu == cru:
        return True
    ref_tail = cr.split(".")[-1] if "." in cr else cr
    normalized = h.replace("·", " · ").replace("  ", " ")
    parts = [p.strip() for p in normalized.split(" · ") if p.strip()]
    if len(parts) >= 2:
        last_core = parts[-1].split("(")[0].strip()
        if last_core.upper() == cou:
            return True
        if ref_tail and last_core.upper() == ref_tail.upper():
            return True
    return False


def _editor_field_ui_label_for_binding(cfg: Dict[str, Any], bind: Dict[str, Any]) -> str:
    """
    Подпись поля из editor_field_ui для той же связки лист/колонка/json_path, что и у измерения фильтра.
    Совпадение с flatten_editor_field_ui (в т.ч. развёртка paths → отдельные json_path).
    """
    from src import editor_config

    want_sheet = str(bind.get("sheet_code") or "").strip()
    want_col = str(bind.get("column") or "").strip()
    want_path = bind.get("json_path")
    want_list = list(want_path) if isinstance(want_path, list) else None

    for rule in editor_config.flatten_editor_field_ui(cfg):
        if str(rule.get("sheet_code") or "").strip() != want_sheet:
            continue
        if str(rule.get("column") or "").strip() != want_col:
            continue
        rp = rule.get("json_path")
        rule_list = list(rp) if isinstance(rp, list) else None
        if want_list is None:
            if rule_list:
                continue
        else:
            if rule_list != want_list:
                continue
        lab = str(rule.get("label") or "").strip()
        if lab:
            return lab
    return ""


def _dim_label_ru_from_cfg(cfg: Dict[str, Any], dim: str) -> str:
    """
    Короткая подпись для заголовка блока фильтра. Порядок:
    1) **editor_field_ui** — label того же поля, что и в DIM_ENUM_RULE_BINDINGS (карточка строки);
    2) **global_filter_labels** — строка или { label_ru, comment_ru };
    3) **DIM_LABEL_RU** в коде (запас).
    """
    bind = DIM_ENUM_RULE_BINDINGS.get(dim)
    if bind:
        ui = _editor_field_ui_label_for_binding(cfg, bind)
        if ui:
            return ui
    raw = cfg.get("global_filter_labels")
    if isinstance(raw, dict) and dim in raw:
        val = raw.get(dim)
        if isinstance(val, str):
            s = val.strip()
            if s:
                return s
        if isinstance(val, dict):
            s = str(val.get("label_ru") or val.get("label") or "").strip()
            if s:
                return s
    return (DIM_LABEL_RU.get(dim) or dim).strip()


def _filter_block_heading_label(cfg: Dict[str, Any], dim: str) -> str:
    """
    Подпись блока глобального фильтра в UI: [лист] · пояснение (поле).
    В скобках **(поле)**: плоская колонка — её имя; для **json_path** — только ключи пути внутри JSON
    (см. **`_column_ref_from_binding`**). Пояснение (global_filter_labels или DIM_LABEL_RU) не выводится,
    если пусто, полностью совпадает с полем или дублирует имя колонки/хвост пути в скобках — тогда только [лист]: (поле).
    """
    bind = DIM_ENUM_RULE_BINDINGS.get(dim)
    if not bind:
        return _dim_label_ru_from_cfg(cfg, dim) or dim
    sheet_title = _sheet_title_for_code(cfg, str(bind.get("sheet_code") or ""))
    col_ref = _column_ref_from_binding(bind)
    col_only = str(bind.get("column") or "").strip()
    human = _dim_label_ru_from_cfg(cfg, dim)
    if not human or _human_label_redundant_with_column(human, col_only, col_ref):
        return f"[{sheet_title}]: ({col_ref})"
    return f"[{sheet_title}]: {human} ({col_ref})"


def _dim_prefers_toggle(cfg: Dict[str, Any], dim: str) -> bool:
    """
    True, если правило enum для измерения помечено input_display=toggle
    и для него в config задано не более двух непустых значений.
    """
    rule = _enum_rule_for_dim(cfg, dim)
    if not rule:
        return False
    if str(rule.get("input_display") or "").strip().lower() != "toggle":
        return False
    opts = rule.get("options") or []
    values: List[str] = []
    for o in opts:
        if isinstance(o, dict):
            v = str(o.get("value") or "").strip()
        else:
            v = str(o or "").strip()
        if v != "":
            values.append(v)
    return len(values) <= 2


def filter_blocks_for_template(
    ix: GlobalFilterIndex,
    sel: Dict[str, Set[str]],
    cfg: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Список блоков для Jinja: label, param, filter_key, options, selected_list, hint."""
    blocks: List[Dict[str, Any]] = []
    for dim in DIMENSION_ORDER:
        opts = facet_values_for_dim(ix, sel, dim, cfg)
        if len(opts) > 60:
            opts = opts[:60]
        blocks.append(
            {
                "dim": dim,
                "label": _filter_block_heading_label(cfg, dim),
                "param": DIM_QUERY_PARAM[dim],
                "filter_key": dim,
                "options": opts,
                "selected_list": sorted(sel.get(dim) or set(), key=lambda x: (x == "__SPOD_EMPTY__", x.lower())),
                "is_toggle": _dim_prefers_toggle(cfg, dim),
                "hint": "Без отметок — не ограничивает. Несколько отметок — ИЛИ внутри параметра.",
            }
        )
    return blocks


def reward_row_matches_contests(
    ix: GlobalFilterIndex,
    reward_code: str,
    allowed: FrozenSet[str],
) -> bool:
    """Строка REWARD видна, если есть REWARD-LINK с конкурсом из allowed."""
    rc = _norm(reward_code)
    for cc in allowed:
        if rc in (ix.contest_reward_codes.get(cc) or set()):
            return True
    return False
