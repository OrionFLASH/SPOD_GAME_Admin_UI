# -*- coding: utf-8 -*-
"""
Мастер «Создать конкурс»: схема шагов для UI и атомарная вставка строк в SQLite.

Порядок вставки: CONTEST-DATA → GROUP → REWARD-LINK → REWARD → INDICATOR → TOURNAMENT-SCHEDULE,
затем пересчёт консистентности. Черновик шага хранится в таблице wizard_draft (статус EDIT) до финального commit.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from src import consistency, editor_config, ingest

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


def build_schema(root: Path, cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Собирает метаданные для клиентского мастера: колонки по CSV, json_columns, развёрнутые списки редактора.
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
        "fieldEnums": editor_config.flatten_field_enums(cfg),
        "editorTextareas": editor_config.flatten_editor_textareas(cfg),
        "longTextThreshold": int(cfg.get("editor_long_text_threshold", 120)),
    }


def _next_row_index(conn: Any, sheet_id: int) -> int:
    cur = conn.execute(
        "SELECT COALESCE(MAX(row_index), -1) AS m FROM data_row WHERE sheet_id = ?",
        (sheet_id,),
    )
    m = cur.fetchone()
    return int(m["m"]) + 1 if m else 0


def _insert_row(conn: Any, sheet_code: str, cells: Dict[str, Any], now: str) -> int:
    cur = conn.execute("SELECT id FROM sheet WHERE code = ?", (sheet_code,))
    r = cur.fetchone()
    if not r:
        raise ValueError(f"Неизвестный лист: {sheet_code}")
    sid = int(r["id"])
    idx = _next_row_index(conn, sid)
    cells_json = json.dumps(
        {str(k): "" if v is None else str(v) for k, v in cells.items()},
        ensure_ascii=False,
    )
    conn.execute(
        """
        INSERT INTO data_row (sheet_id, row_index, sort_key, cells_json, consistency_ok, consistency_errors, updated_at, is_current, replaces_row_id)
        VALUES (?,?,?,?,?,?,?,?,?)
        """,
        (sid, idx, float(idx), cells_json, 1, "[]", now, 1, None),
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


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
    g_codes: List[str] = []
    for i, g in enumerate(groups):
        cells = (g or {}).get("cells") or {}
        if str(cells.get("CONTEST_CODE") or "").strip() != cc:
            errs.append(f"GROUP строка {i + 1}: CONTEST_CODE должен совпадать с конкурсом.")
        gco = str(cells.get("GROUP_CODE") or "").strip()
        if not gco:
            errs.append(f"GROUP строка {i + 1}: пустой GROUP_CODE.")
        g_codes.append(gco)
    uniq_groups = sorted(set(g_codes))
    links = payload.get("reward_links") or []
    if not isinstance(links, list):
        errs.append("Некорректный формат reward_links.")
    elif len(links) < len(uniq_groups):
        errs.append(
            f"REWARD-LINK: строк должно быть не меньше числа различных GROUP_CODE ({len(uniq_groups)}), сейчас {len(links)}."
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
    for i, sc in enumerate(sch if isinstance(sch, list) else []):
        c = (sc or {}).get("cells") or {}
        if str(c.get("CONTEST_CODE") or "").strip() != cc:
            errs.append(f"SCHEDULE строка {i + 1}: CONTEST_CODE не совпадает с конкурсом.")
    return errs


def commit_wizard(conn: Any, cfg: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
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
    inserted_ids: List[int] = []
    try:
        conn.execute("BEGIN")
        inserted_ids.append(_insert_row(conn, "CONTEST-DATA", contest_cells, now))
        contest_id = inserted_ids[0]
        for g in payload.get("groups") or []:
            inserted_ids.append(_insert_row(conn, "GROUP", dict((g or {}).get("cells") or {}), now))
        for ln in payload.get("reward_links") or []:
            inserted_ids.append(_insert_row(conn, "REWARD-LINK", dict((ln or {}).get("cells") or {}), now))
        for rw in payload.get("rewards") or []:
            inserted_ids.append(_insert_row(conn, "REWARD", dict((rw or {}).get("cells") or {}), now))
        for ind in payload.get("indicators") or []:
            inserted_ids.append(_insert_row(conn, "INDICATOR", dict((ind or {}).get("cells") or {}), now))
        for sc in payload.get("schedules") or []:
            inserted_ids.append(_insert_row(conn, "TOURNAMENT-SCHEDULE", dict((sc or {}).get("cells") or {}), now))
        consistency.run_all_checks(conn, do_commit=False)
        if mode == "strict":
            ph = ",".join("?" * len(inserted_ids))
            cur = conn.execute(
                f"SELECT id, consistency_ok, consistency_errors FROM data_row WHERE id IN ({ph})",
                inserted_ids,
            )
            for row in cur.fetchall():
                if int(row["consistency_ok"]) == 0:
                    conn.rollback()
                    msg = json.loads(row["consistency_errors"] or "[]")
                    raise ValueError(
                        "Режим strict: ошибки консистентности после вставки (id=%s): " % row["id"]
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
