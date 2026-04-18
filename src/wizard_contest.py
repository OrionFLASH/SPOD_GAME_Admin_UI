# -*- coding: utf-8 -*-
"""
Мастер «Создать конкурс»: схема шагов для UI и атомарная вставка строк в SQLite.

Порядок вставки: CONTEST-DATA → GROUP → REWARD-LINK → REWARD → INDICATOR → TOURNAMENT-SCHEDULE,
затем пересчёт консистентности. Черновик шага хранится в таблице wizard_draft (статус EDIT) до финального commit; строки листов пишутся в spod_sheet_* через sheet_storage.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

from src import consistency, editor_config, field_enum_sheet_options, ingest, sheet_storage

# Порядок шагов мастера (коды листов из config.json).
WIZARD_SHEET_ORDER: Tuple[str, ...] = (
    "CONTEST-DATA",
    "GROUP",
    "REWARD-LINK",
    "REWARD",
    "INDICATOR",
    "TOURNAMENT-SCHEDULE",
)

# Незавершённое создание конкурса в wizard_draft (не путать с актуальными строками листов).
WIZARD_DRAFT_STATUS_EDIT = "EDIT"


def upsert_wizard_draft(conn: Any, payload: Dict[str, Any]) -> None:
    """Сохраняет или обновляет черновик мастера по draft_uuid."""
    uid = str(payload.get("draft_uuid") or "").strip()
    if not uid:
        raise ValueError("Не указан draft_uuid.")
    st = payload.get("state")
    if not isinstance(st, dict):
        raise ValueError("Некорректное поле state (ожидается объект).")
    step_raw = payload.get("step_index")
    if step_raw is None:
        step_raw = st.get("stepIndex")
    step = int(step_raw) if step_raw is not None else 0
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cells = (st.get("contest") or {}).get("cells") or {}
    preview = str(cells.get("CONTEST_CODE") or "").strip() or None
    blob = json.dumps(st, ensure_ascii=False)
    conn.execute(
        """
        INSERT INTO wizard_draft (draft_uuid, step_index, status, state_json, contest_code_preview, updated_at)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(draft_uuid) DO UPDATE SET
            step_index=excluded.step_index,
            status=excluded.status,
            state_json=excluded.state_json,
            contest_code_preview=excluded.contest_code_preview,
            updated_at=excluded.updated_at
        """,
        (uid, step, WIZARD_DRAFT_STATUS_EDIT, blob, preview, now),
    )


def list_wizard_drafts(conn: Any) -> List[Dict[str, Any]]:
    """Список незавершённых черновиков для возобновления редактирования."""
    cur = conn.execute(
        "SELECT draft_uuid, step_index, contest_code_preview, updated_at FROM wizard_draft WHERE status = ? ORDER BY updated_at DESC",
        (WIZARD_DRAFT_STATUS_EDIT,),
    )
    return [dict(r) for r in cur.fetchall()]


def get_wizard_draft(conn: Any, draft_uuid: str) -> Dict[str, Any]:
    """Возвращает step_index и state для клиента."""
    cur = conn.execute(
        "SELECT draft_uuid, step_index, state_json FROM wizard_draft WHERE draft_uuid = ? AND status = ?",
        (draft_uuid, WIZARD_DRAFT_STATUS_EDIT),
    )
    r = cur.fetchone()
    if not r:
        raise ValueError("Черновик не найден или уже не в статусе EDIT.")
    return {"draft_uuid": r["draft_uuid"], "step_index": int(r["step_index"]), "state": json.loads(r["state_json"])}


def delete_wizard_draft(conn: Any, draft_uuid: str) -> None:
    """Удаление черновика (отказ или успешное создание конкурса)."""
    conn.execute("DELETE FROM wizard_draft WHERE draft_uuid = ?", (draft_uuid,))


def _sheet_spec(cfg: Dict[str, Any], code: str) -> Dict[str, Any]:
    for s in cfg.get("sheets") or []:
        if str(s.get("code")) == code:
            return dict(s)
    return {}


def build_schema(root: Path, cfg: Dict[str, Any], conn: Any) -> Dict[str, Any]:
    """
    Собирает метаданные для клиентского мастера: колонки по CSV, json_columns, развёрнутые списки редактора.

    Параметр ``conn`` нужен для подстановки ``field_enums.options`` из актуальных строк листов
    (см. ``field_enum_sheet_options.merge_field_enums_with_sheet_options``).
    """
    in_dir = root / (cfg.get("paths") or {}).get("input_spod", "IN/SPOD")
    sheets_out: Dict[str, Any] = {}
    for code in WIZARD_SHEET_ORDER:
        spec = _sheet_spec(cfg, code)
        fn = spec.get("file")
        if not fn:
            continue
        path = in_dir / str(fn)
        headers: List[str] = []
        if path.is_file():
            headers, _ = ingest._read_csv_rows(path)
        json_cols = list(spec.get("json_columns") or [])
        flat_cols = [h for h in headers if h and h not in json_cols]
        sheets_out[code] = {
            "title": spec.get("title") or code,
            "flat_columns": flat_cols,
            "json_columns": json_cols,
            "headers": headers,
        }
    steps = [{"id": "contest", "sheet_code": "CONTEST-DATA", "title": "Конкурс (CONTEST-DATA)"}]
    steps.append({"id": "groups", "sheet_code": "GROUP", "title": "Группы (GROUP)"})
    steps.append({"id": "reward_links", "sheet_code": "REWARD-LINK", "title": "Связи наград (REWARD-LINK)"})
    steps.append({"id": "rewards", "sheet_code": "REWARD", "title": "Награды (REWARD)"})
    steps.append({"id": "indicators", "sheet_code": "INDICATOR", "title": "Показатели (INDICATOR)"})
    steps.append({"id": "schedules", "sheet_code": "TOURNAMENT-SCHEDULE", "title": "Расписание (TOURNAMENT-SCHEDULE)"})
    steps.append({"id": "preview", "sheet_code": None, "title": "Просмотр и создание"})
    return {
        "steps": steps,
        "sheetOrder": list(WIZARD_SHEET_ORDER),
        "sheets": sheets_out,
        "fieldUi": editor_config.flatten_editor_field_ui(cfg),
        "fieldEnums": field_enum_sheet_options.merge_field_enums_with_sheet_options(conn, cfg),
        "editorTextareas": editor_config.flatten_editor_textareas(cfg),
        "fieldNumeric": editor_config.flatten_editor_field_numeric(cfg),
        "longTextThreshold": int(cfg.get("editor_long_text_threshold", 120)),
    }


def _next_row_index(conn: Any, sheet_code: str, sheet_id: int) -> int:
    return sheet_storage.next_row_index(conn, sheet_id, sheet_code)


def _insert_row(root: Path, conn: Any, cfg: Dict[str, Any], sheet_code: str, cells: Dict[str, Any], now: str) -> int:
    cur = conn.execute("SELECT id FROM sheet WHERE code = ?", (sheet_code,))
    r = cur.fetchone()
    if not r:
        raise ValueError(f"Неизвестный лист: {sheet_code}")
    sid = int(r["id"])
    idx = _next_row_index(conn, sheet_code, sid)
    return sheet_storage.insert_data_row(
        conn,
        root,
        cfg,
        sheet_code,
        sid,
        idx,
        float(idx),
        cells,
        now,
        replaces_row_id=None,
    )


def _current_rows_cells(conn: Any, sheet_code: str) -> List[Dict[str, str]]:
    """Актуальные строки листа: список словарей ячеек (порядок как в БД)."""
    t = sheet_storage.physical_table_name(sheet_code)
    headers = sheet_storage.headers_for_sheet(conn, sheet_code)
    if not headers:
        return []
    cur = conn.execute(
        f"""
        SELECT * FROM {sheet_storage.quote_ident(t)}
        WHERE is_current = 1
        ORDER BY sort_key, row_index, id
        """
    )
    out: List[Dict[str, str]] = []
    for r in cur.fetchall():
        out.append(sheet_storage.row_to_cells(r, headers))
    return out


def list_seed_contests(conn: Any) -> List[Dict[str, Any]]:
    """
    Список конкурсов из БД для режима «копировать существующий»: код, название, коды наград из REWARD-LINK.
    """
    by_contest: Dict[str, Set[str]] = {}
    for cn in _current_rows_cells(conn, "REWARD-LINK"):
        cc = (cn.get("CONTEST_CODE") or "").strip()
        rc = (cn.get("REWARD_CODE") or "").strip()
        if cc and rc:
            by_contest.setdefault(cc, set()).add(rc)
    out: List[Dict[str, Any]] = []
    for cells in _current_rows_cells(conn, "CONTEST-DATA"):
        cc = (cells.get("CONTEST_CODE") or "").strip()
        if not cc:
            continue
        rcs = sorted(by_contest.get(cc, set()))
        out.append(
            {
                "contest_code": cc,
                "full_name": (cells.get("FULL_NAME") or "").strip(),
                "reward_codes": rcs,
            }
        )
    out.sort(key=lambda x: str(x.get("contest_code") or ""))
    return out


def build_seed_state_from_contest(conn: Any, contest_code: str) -> Dict[str, Any]:
    """
    Собирает объект state мастера из актуальных строк БД для указанного CONTEST_CODE.
    Клиент подставляет новые коды вручную; здесь — полная копия полей как в источнике.
    """
    cc_key = (contest_code or "").strip()
    if not cc_key:
        raise ValueError("Не указан код конкурса (contest_code).")
    contest_cells: Dict[str, str] | None = None
    for cells in _current_rows_cells(conn, "CONTEST-DATA"):
        if (cells.get("CONTEST_CODE") or "").strip() == cc_key:
            contest_cells = dict(cells)
            break
    if contest_cells is None:
        raise ValueError(f"Конкурс «{cc_key}» не найден среди актуальных строк CONTEST-DATA.")

    groups: List[Dict[str, Any]] = []
    for cells in _current_rows_cells(conn, "GROUP"):
        if (cells.get("CONTEST_CODE") or "").strip() == cc_key:
            groups.append({"cells": dict(cells)})

    reward_links: List[Dict[str, Any]] = []
    for cells in _current_rows_cells(conn, "REWARD-LINK"):
        if (cells.get("CONTEST_CODE") or "").strip() == cc_key:
            reward_links.append({"cells": dict(cells)})

    uniq_rc = sorted(
        {
            (ln["cells"].get("REWARD_CODE") or "").strip()
            for ln in reward_links
            if (ln["cells"].get("REWARD_CODE") or "").strip()
        }
    )
    rewards: List[Dict[str, Any]] = []
    for rc in uniq_rc:
        row_cells: Dict[str, str] | None = None
        for cells in _current_rows_cells(conn, "REWARD"):
            if (cells.get("REWARD_CODE") or "").strip() == rc:
                row_cells = dict(cells)
                break
        if row_cells is not None:
            rewards.append({"cells": row_cells})
        else:
            rewards.append({"cells": {"REWARD_CODE": rc}})

    indicators: List[Dict[str, Any]] = []
    for cells in _current_rows_cells(conn, "INDICATOR"):
        if (cells.get("CONTEST_CODE") or "").strip() == cc_key:
            indicators.append({"cells": dict(cells)})

    schedules: List[Dict[str, Any]] = []
    for cells in _current_rows_cells(conn, "TOURNAMENT-SCHEDULE"):
        if (cells.get("CONTEST_CODE") or "").strip() == cc_key:
            schedules.append({"cells": dict(cells)})

    return {
        "stepIndex": 0,
        "contest": {"cells": contest_cells},
        "groups": groups,
        "reward_links": reward_links,
        "rewards": rewards,
        "indicators": indicators,
        "schedules": schedules,
        "groupCount": max(1, len(groups)),
        "linkCount": max(1, len(reward_links)),
        "indicatorCount": max(1, len(indicators)),
        "scheduleCount": max(1, len(schedules)),
    }


def validate_payload(payload: Dict[str, Any]) -> List[str]:
    """Возвращает список ошибок; пустой — ок."""
    errs: List[str] = []
    contest = (payload.get("contest") or {}).get("cells") or {}
    cc = str(contest.get("CONTEST_CODE") or "").strip()
    if not cc:
        errs.append("Не задан CONTEST_CODE в конкурсе.")
    groups = payload.get("groups") or []
    if not isinstance(groups, list) or len(groups) < 1:
        errs.append("Нужна хотя бы одна строка GROUP.")
    # Различные строки GROUP в смысле пары (GROUP_CODE, GROUP_VALUE) при том же конкурсе — как в consistency по тройке с CONTEST.
    group_pairs_seen: Set[Tuple[str, str]] = set()
    for i, g in enumerate(groups):
        cells = (g or {}).get("cells") or {}
        if str(cells.get("CONTEST_CODE") or "").strip() != cc:
            errs.append(f"GROUP строка {i + 1}: CONTEST_CODE должен совпадать с конкурсом.")
        gco = str(cells.get("GROUP_CODE") or "").strip()
        if not gco:
            errs.append(f"GROUP строка {i + 1}: пустой GROUP_CODE.")
        gvo = str(cells.get("GROUP_VALUE") or "").strip()
        gpair = (gco, gvo)
        if gpair in group_pairs_seen:
            errs.append(
                f"GROUP строка {i + 1}: дубль пары (GROUP_CODE, GROUP_VALUE)=({gco!r},{gvo!r}) при том же конкурсе."
            )
        group_pairs_seen.add(gpair)
    uniq_group_pairs_n = len(group_pairs_seen)
    links = payload.get("reward_links") or []
    if not isinstance(links, list):
        errs.append("Некорректный формат reward_links.")
    elif len(links) < uniq_group_pairs_n:
        errs.append(
            f"REWARD-LINK: строк должно быть не меньше числа различных пар (GROUP_CODE, GROUP_VALUE) в GROUP ({uniq_group_pairs_n}), сейчас {len(links)}."
        )
    reward_codes: List[str] = []
    for i, ln in enumerate(links if isinstance(links, list) else []):
        c = (ln or {}).get("cells") or {}
        if str(c.get("CONTEST_CODE") or "").strip() != cc:
            errs.append(f"REWARD-LINK {i + 1}: CONTEST_CODE не совпадает.")
        if not str(c.get("GROUP_CODE") or "").strip():
            errs.append(f"REWARD-LINK {i + 1}: пустой GROUP_CODE.")
        rc = str(c.get("REWARD_CODE") or "").strip()
        if not rc:
            errs.append(f"REWARD-LINK {i + 1}: пустой REWARD_CODE.")
        reward_codes.append(rc)
    # Формат REWARD_CODE: r_<CONTEST_CODE> или r_<CONTEST_CODE>_<суффикс>; при нескольких связях суффикс обязателен и уникален.
    if cc and isinstance(links, list) and len(links) > 0:
        pr = "r_" + cc
        n_links = len(links)
        suffixes: List[str] = []
        for i, rc in enumerate(reward_codes):
            if not rc.startswith(pr):
                errs.append(f"REWARD-LINK {i + 1}: REWARD_CODE должен начинаться с «{pr}».")
                continue
            if rc != pr and not rc.startswith(pr + "_"):
                errs.append(f"REWARD-LINK {i + 1}: ожидается «{pr}» или «{pr}_<суффикс>».")
                continue
            if rc.startswith(pr + "_"):
                suf = rc[len(pr) + 1 :].strip()
                if not suf:
                    errs.append(f"REWARD-LINK {i + 1}: пустой суффикс после «{pr}_».")
                else:
                    suffixes.append(suf)
            elif n_links > 1 and rc == pr:
                errs.append(f"REWARD-LINK {i + 1}: при {n_links} связях нужен суффикс: «{pr}_<суффикс>».")
        if n_links > 1 and len(suffixes) == n_links and len(set(suffixes)) < len(suffixes):
            errs.append("REWARD-LINK: суффиксы REWARD_CODE должны быть уникальны для каждой строки.")
    uniq_rewards = sorted(set(reward_codes))
    rewards = payload.get("rewards") or []
    if not isinstance(rewards, list):
        errs.append("Некорректный формат rewards.")
    elif len(rewards) != len(uniq_rewards):
        errs.append(
            f"REWARD: ожидается {len(uniq_rewards)} строк (по числу различных REWARD_CODE из связей), получено {len(rewards)}."
        )
    else:
        for i, rw in enumerate(rewards):
            c = (rw or {}).get("cells") or {}
            code = str(c.get("REWARD_CODE") or "").strip()
            if i < len(uniq_rewards) and code != uniq_rewards[i]:
                errs.append(
                    f"REWARD строка {i + 1}: ожидается REWARD_CODE «{uniq_rewards[i]}» (порядок как в отсортированном списке кодов из связей), получено «{code}»."
                )
            if code not in uniq_rewards:
                errs.append(f"REWARD строка {i + 1}: неизвестный REWARD_CODE «{code}».")
    inds = payload.get("indicators") or []
    if not isinstance(inds, list) or len(inds) < 1:
        errs.append("Нужна хотя бы одна строка INDICATOR.")
    for i, ind in enumerate(inds if isinstance(inds, list) else []):
        c = (ind or {}).get("cells") or {}
        if str(c.get("CONTEST_CODE") or "").strip() != cc:
            errs.append(f"INDICATOR строка {i + 1}: CONTEST_CODE не совпадает с конкурсом.")
    sch = payload.get("schedules") or []
    if not isinstance(sch, list) or len(sch) < 1:
        errs.append("Нужна хотя бы одна строка TOURNAMENT-SCHEDULE.")
    # TOURNAMENT_CODE: t_<CONTEST_CODE>_#### (ровно четыре цифры).
    tourn_pat: re.Pattern[str] | None = None
    if cc:
        tourn_pat = re.compile(r"^t_" + re.escape(cc) + r"_\d{4}$")
    for i, sc in enumerate(sch if isinstance(sch, list) else []):
        c = (sc or {}).get("cells") or {}
        if str(c.get("CONTEST_CODE") or "").strip() != cc:
            errs.append(f"SCHEDULE строка {i + 1}: CONTEST_CODE не совпадает с конкурсом.")
        tc = str(c.get("TOURNAMENT_CODE") or "").strip()
        if tourn_pat is not None and (not tc or not tourn_pat.match(tc)):
            errs.append(
                f"SCHEDULE строка {i + 1}: TOURNAMENT_CODE должен быть в формате «t_{cc}_####» (четыре цифры)."
            )
    return errs


def commit_wizard(root: Path, conn: Any, cfg: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Вставляет все строки в одной транзакции, затем consistency.run_all_checks.
    Возвращает { "ok": True, "contest_row_id": n } или бросает при ошибке БД.
    """
    errs = validate_payload(payload)
    if errs:
        raise ValueError("; ".join(errs))
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    mode = str((cfg.get("consistency") or {}).get("mode", "warn"))
    contest_cells = dict((payload.get("contest") or {}).get("cells") or {})
    inserted: List[Tuple[str, int]] = []
    try:
        conn.execute("BEGIN")
        inserted.append(("CONTEST-DATA", _insert_row(root, conn, cfg, "CONTEST-DATA", contest_cells, now)))
        contest_id = inserted[0][1]
        for g in payload.get("groups") or []:
            inserted.append(("GROUP", _insert_row(root, conn, cfg, "GROUP", dict((g or {}).get("cells") or {}), now)))
        for ln in payload.get("reward_links") or []:
            inserted.append(
                ("REWARD-LINK", _insert_row(root, conn, cfg, "REWARD-LINK", dict((ln or {}).get("cells") or {}), now))
            )
        for rw in payload.get("rewards") or []:
            inserted.append(("REWARD", _insert_row(root, conn, cfg, "REWARD", dict((rw or {}).get("cells") or {}), now)))
        for ind in payload.get("indicators") or []:
            inserted.append(
                ("INDICATOR", _insert_row(root, conn, cfg, "INDICATOR", dict((ind or {}).get("cells") or {}), now))
            )
        for sc in payload.get("schedules") or []:
            inserted.append(
                (
                    "TOURNAMENT-SCHEDULE",
                    _insert_row(root, conn, cfg, "TOURNAMENT-SCHEDULE", dict((sc or {}).get("cells") or {}), now),
                )
            )
        consistency.run_all_checks(conn, do_commit=False)
        if mode == "strict":
            for sheet_code, nid in inserted:
                t = sheet_storage.physical_table_name(sheet_code)
                cur = conn.execute(
                    f"SELECT id, consistency_ok, consistency_errors FROM {sheet_storage.quote_ident(t)} WHERE id = ?",
                    (nid,),
                )
                row = cur.fetchone()
                if row and int(row["consistency_ok"]) == 0:
                    conn.rollback()
                    msg = json.loads(row["consistency_errors"] or "[]")
                    raise ValueError(
                        "Режим strict: ошибки консистентности после вставки (%s id=%s): "
                        % (sheet_code, row["id"])
                        + "; ".join(str(x) for x in msg)
                    )
        draft_uid = str(payload.get("draft_uuid") or "").strip()
        if draft_uid:
            conn.execute("DELETE FROM wizard_draft WHERE draft_uuid = ?", (draft_uid,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    logging.info("Мастер конкурса: создан CONTEST_CODE=%s, id строки конкурса=%s", contest_cells.get("CONTEST_CODE"), contest_id)
    return {"ok": True, "contest_row_id": contest_id, "contest_code": str(contest_cells.get("CONTEST_CODE") or "")}
