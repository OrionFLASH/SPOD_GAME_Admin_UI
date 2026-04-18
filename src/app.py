# -*- coding: utf-8 -*-
"""Веб-приложение FastAPI: просмотр и редактирование данных турниров."""

from __future__ import annotations

import json
import logging
import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from markupsafe import Markup, escape

from src import (
    config_validate,
    consistency,
    db,
    editor_config,
    export_csv,
    field_enum_sheet_options,
    global_sheet_filters,
    ingest,
    relations,
    server_stop,
    sheet_list_display,
    sheet_storage,
    spod_json,
    wizard_contest,
)

ROOT = Path(__file__).resolve().parent.parent
CFG: Dict[str, Any] = {}
CONN: sqlite3.Connection | None = None
DB_PATH: Path | None = None
STATIC_ASSET_VERSION = "20260418_24"


def _cells_canonical_json(cells: Dict[str, str]) -> str:
    """Стабильная строка для сравнения двух наборов ячеек."""
    return json.dumps(dict(sorted(cells.items())), ensure_ascii=False)


def _json_for_script_tag(obj: Any) -> Markup:
    """Сериализация JSON для вставки в <script type=\"application/json\"> без поломки разметки."""
    s = json.dumps(obj, ensure_ascii=False)
    s = s.replace("<", "\\u003c").replace(">", "\\u003e")
    return Markup(s)


def _fetch_row_edit_draft(conn: sqlite3.Connection, sheet_code: str, row_id: int) -> Dict[str, Any] | None:
    """Черновик правки строки (status=EDIT) для карточки редактирования."""
    cur = conn.execute(
        """
        SELECT status, state_json, updated_at
        FROM row_edit_draft
        WHERE sheet_code = ? AND row_id = ?
        """,
        (sheet_code, int(row_id)),
    )
    r = cur.fetchone()
    if not r:
        return None
    try:
        state = json.loads(r["state_json"] or "{}")
    except json.JSONDecodeError:
        state = {}
    if not isinstance(state, dict):
        state = {}
    return {
        "status": str(r["status"] or "EDIT"),
        "state": state,
        "updated_at": str(r["updated_at"] or ""),
    }


def _upsert_row_edit_draft(
    conn: sqlite3.Connection, sheet_code: str, row_id: int, state: Dict[str, Any], status: str = "EDIT"
) -> None:
    """Создаёт/обновляет черновик правки строки."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    state_json = json.dumps(state, ensure_ascii=False)
    conn.execute(
        """
        INSERT INTO row_edit_draft(sheet_code, row_id, status, state_json, updated_at)
        VALUES(?, ?, ?, ?, ?)
        ON CONFLICT(sheet_code, row_id) DO UPDATE SET
          status = excluded.status,
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
        """,
        (sheet_code, int(row_id), status, state_json, now),
    )


def _delete_row_edit_draft(conn: sqlite3.Connection, sheet_code: str, row_id: int) -> None:
    """Удаляет черновик правки строки."""
    conn.execute(
        "DELETE FROM row_edit_draft WHERE sheet_code = ? AND row_id = ?",
        (sheet_code, int(row_id)),
    )


def _editor_bootstrap_for_row_cells(
    conn: sqlite3.Connection,
    code: str,
    row_id: int,
    cells: Dict[str, str],
    json_cols: List[str],
) -> Dict[str, Any]:
    """
    Параметры клиентского редактора для одной строки листа (плоские поля + jsonCols + fullRow).
    Используется на карточке строки и для каждого блока GROUP при просмотре по конкурсу.
    """
    flat_columns = [k for k in cells.keys() if k not in json_cols]
    json_cols_boot: List[Dict[str, Any]] = []
    for col in json_cols:
        raw_cell = cells.get(col, "") or ""
        parsed_cell, err_cell = spod_json.try_parse_cell(raw_cell)
        json_cols_boot.append(
            {
                "column": col,
                "section_slug": re.sub(r"[^a-zA-Z0-9_-]", "_", col),
                "raw": raw_cell,
                "ok": err_cell is None,
                "parsed": parsed_cell,
            }
        )
    return {
        "sheetCode": code,
        "rowId": row_id,
        "flat": {k: cells.get(k, "") for k in flat_columns},
        "jsonCols": json_cols_boot,
        "fullRow": dict(cells),
        "fieldEnums": field_enum_sheet_options.merge_field_enums_with_sheet_options(conn, CFG),
        "editorTextareas": editor_config.flatten_editor_textareas(CFG),
        "fieldUi": editor_config.flatten_editor_field_ui(CFG),
        "fieldNumeric": editor_config.flatten_editor_field_numeric(CFG),
        "longTextThreshold": int(CFG.get("editor_long_text_threshold", 120)),
    }


def _tojson_readable(value: Any, indent: int = 2) -> Markup:
    """
    JSON для вывода в HTML (<pre> в блоке «Связи»): кириллица как текст, не escape \\uXXXX.
    Стандартный фильтр tojson в Jinja2 использует ASCII-экранирование не-ASCII символов.
    """
    text = json.dumps(value, ensure_ascii=False, indent=indent)
    return Markup(escape(text))


def _load_config() -> Dict[str, Any]:
    with open(ROOT / "config.json", "r", encoding="utf-8") as f:
        return json.load(f)


def _setup_logging() -> None:
    global CFG
    log_dir = ROOT / CFG["paths"]["logs"]
    log_dir.mkdir(parents=True, exist_ok=True)
    fn = CFG["logging"].get("base_name", "admin")
    path = log_dir / f"{fn}_{datetime.now().strftime('%Y%m%d_%H')}.log"
    logging.basicConfig(
        level=getattr(logging, CFG["logging"].get("level", "INFO"), logging.INFO),
        format="%(asctime)s | %(levelname)s | %(message)s",
        handlers=[logging.FileHandler(path, encoding="utf-8"), logging.StreamHandler()],
        force=True,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация БД и автозагрузка при пустой базе."""
    global CFG, CONN, DB_PATH
    CFG = _load_config()
    _setup_logging()
    for msg in config_validate.validate_sheet_bindings(CFG):
        logging.warning("%s", msg)
    for msg in config_validate.validate_field_enum_sheet_options(CFG):
        logging.warning("%s", msg)
    DB_PATH = db.get_db_path(ROOT, CFG)
    CONN = db.open_connection(DB_PATH)
    db.init_schema(CONN)
    db.migrate_sheet_add_headers_json(CONN)
    db.migrate_legacy_data_row_removed(CONN)
    db.ensure_wizard_draft_table(CONN)
    db.ensure_row_edit_draft_table(CONN)
    sheet_storage.rebuild_all_sheet_tables_from_config(CONN, ROOT, CFG)
    cur = CONN.execute("SELECT COUNT(*) FROM sheet")
    if cur.fetchone()[0] == 0:
        counts = ingest.import_all(ROOT, CFG, CONN, clear=True)
        logging.info("Автоимпорт при первом запуске: %s", counts)
        consistency.run_all_checks(CONN)
    yield
    if CONN:
        CONN.close()
    CONN = None


app = FastAPI(title="SPOD Tournament Admin", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(ROOT / "src" / "static")), name="static")
templates = Jinja2Templates(directory=str(ROOT / "src" / "templates"))
templates.env.filters["tojson_readable"] = _tojson_readable
templates.env.globals["STATIC_ASSET_VERSION"] = STATIC_ASSET_VERSION


def get_conn() -> sqlite3.Connection:
    if CONN is None:
        raise RuntimeError("Нет подключения к БД")
    return CONN


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    """Главная: карточки листов."""
    conn = get_conn()
    cur = conn.execute("SELECT id, code, title, file_name FROM sheet ORDER BY code")
    sheets = []
    for r in cur.fetchall():
        t = sheet_storage.physical_table_name(str(r["code"]))
        n = conn.execute(
            f"SELECT COUNT(*) AS c FROM {sheet_storage.quote_ident(t)} "
            "WHERE sheet_id = ? AND is_current = 1",
            (int(r["id"]),),
        ).fetchone()["c"]
        sheets.append(
            {"code": r["code"], "title": r["title"], "file_name": r["file_name"], "n": int(n)}
        )
    return templates.TemplateResponse(
        request,
        "index.html",
        {"sheets": sheets, "title": "Панель турниров SPOD"},
    )


@app.get("/wizard/new-contest", response_class=HTMLResponse)
def wizard_new_contest(request: Request):
    """Мастер пошагового создания конкурса без записи в БД до финального подтверждения."""
    sch = wizard_contest.build_schema(ROOT, CFG, get_conn())
    return templates.TemplateResponse(
        request,
        "wizard_new_contest.html",
        {
            "title": "Создать конкурс",
            "wizard_schema_json": _json_for_script_tag(sch),
        },
    )


@app.post("/wizard/new-contest/commit")
async def wizard_new_contest_commit(payload: Dict[str, Any] = Body(...)):
    """Атомарная вставка строк мастера и проверка консистентности."""
    conn = get_conn()
    try:
        res = wizard_contest.commit_wizard(ROOT, conn, CFG, payload)
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from e
    except Exception as e:
        # Исключения БД и пр.: отдаём JSON, чтобы fetch на клиенте не падал на разборе HTML.
        logging.exception("wizard_new_contest_commit")
        raise HTTPException(500, detail="Ошибка при создании: " + str(e)[:500]) from e
    rid = int(res.get("contest_row_id") or 0)
    return RedirectResponse(f"/sheet/CONTEST-DATA/row/{rid}", status_code=303)


@app.get("/wizard/new-contest/drafts")
def wizard_list_drafts():
    """JSON: незавершённые черновики мастера (статус EDIT в wizard_draft)."""
    conn = get_conn()
    rows = wizard_contest.list_wizard_drafts(conn)
    return JSONResponse(rows)


@app.get("/wizard/new-contest/draft/{draft_uuid}")
def wizard_get_draft(draft_uuid: str):
    """JSON: одно состояние черновика для возобновления."""
    conn = get_conn()
    try:
        return JSONResponse(wizard_contest.get_wizard_draft(conn, draft_uuid))
    except ValueError as e:
        raise HTTPException(404, detail=str(e)) from e


@app.put("/wizard/new-contest/draft")
async def wizard_put_draft(payload: Dict[str, Any] = Body(...)):
    """Промежуточное сохранение шагов мастера в wizard_draft."""
    conn = get_conn()
    try:
        wizard_contest.upsert_wizard_draft(conn, payload)
        conn.commit()
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from e
    return JSONResponse({"ok": True})


@app.delete("/wizard/new-contest/draft/{draft_uuid}")
def wizard_delete_draft(draft_uuid: str):
    """Удалить черновик (пользователь отказался от незавершённого создания)."""
    conn = get_conn()
    wizard_contest.delete_wizard_draft(conn, draft_uuid)
    conn.commit()
    return JSONResponse({"ok": True})


@app.get("/wizard/new-contest/seed-contests")
def wizard_seed_contests():
    """JSON: список актуальных конкурсов для режима «копировать существующий» (код, название, коды наград в связях)."""
    conn = get_conn()
    return JSONResponse(wizard_contest.list_seed_contests(conn))


@app.get("/wizard/new-contest/seed-state")
def wizard_seed_state(contest_code: str = ""):
    """
    JSON: состояние мастера (как в черновике) из актуальных строк БД для указанного CONTEST_CODE.
    Параметр запроса: contest_code.
    """
    conn = get_conn()
    try:
        st = wizard_contest.build_seed_state_from_contest(conn, contest_code)
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from e
    return JSONResponse(st)


@app.get("/sheet/{code}", response_class=HTMLResponse)
def sheet_list(request: Request, code: str, q: str = ""):
    conn = get_conn()
    cur = conn.execute("SELECT id FROM sheet WHERE code = ?", (code,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Неизвестный лист")
    sid = row[0]
    t = sheet_storage.physical_table_name(code)
    cur = conn.execute(
        f"""
        SELECT id, row_index, consistency_ok, consistency_errors
        FROM {sheet_storage.quote_ident(t)}
        WHERE sheet_id = ? AND is_current = 1
        ORDER BY sort_key, row_index, id
        """,
        (sid,),
    )
    headers = sheet_storage.headers_for_sheet(conn, code)
    rows_out: List[Dict[str, Any]] = []
    spec = next((s for s in CFG["sheets"] if s["code"] == code), None)
    ql = q.strip().lower() if q else ""
    lu = sheet_list_display.build_lookup_tables(conn)
    gf_ix = global_sheet_filters.build_filter_index(conn)
    gf_sel = global_sheet_filters.selection_from_request(request, gf_ix)
    apply_gf = any(bool(gf_sel[k]) for k in gf_sel)
    allowed_cc = global_sheet_filters.matching_contests(gf_ix, gf_sel) if apply_gf else None
    global_filter_blocks = global_sheet_filters.filter_blocks_for_template(gf_ix, gf_sel, CFG)
    if code == "GROUP":
        # Одна строка списка на конкурс: код + название из CONTEST-DATA; «Связи» — все уровни GROUP (GROUP_CODE : GROUP_VALUE).
        contest_full: Dict[str, str] = lu.get("contest_full") or {}
        buckets: Dict[str, Dict[str, Any]] = {}
        order_cc: List[str] = []
        for r in cur.fetchall():
            cur2 = conn.execute(
                f"SELECT * FROM {sheet_storage.quote_ident(t)} WHERE id = ?",
                (int(r["id"]),),
            )
            full = cur2.fetchone()
            cells = sheet_storage.row_to_cells(full, headers) if full else {}
            cc = (cells.get("CONTEST_CODE") or "").strip()
            if not cc:
                continue
            if cc not in buckets:
                buckets[cc] = {"ids": [], "members": [], "ok_flags": [], "any_bad": False}
                order_cc.append(cc)
            b = buckets[cc]
            b["ids"].append(int(r["id"]))
            b["members"].append(dict(cells))
            b["ok_flags"].append(int(r["consistency_ok"]))
            if not int(r["consistency_ok"]):
                b["any_bad"] = True
        if apply_gf:
            order_cc = [cc for cc in order_cc if cc in allowed_cc]
        agg_row_index = 0
        for cc in order_cc:
            b = buckets[cc]
            triples = list(zip(b["ids"], b["members"], b["ok_flags"]))
            if apply_gf:
                triples = [
                    (rid, m, ok_f)
                    for rid, m, ok_f in triples
                    if global_sheet_filters.row_matches_native_global_filters("GROUP", m, gf_sel)
                ]
            if not triples:
                continue
            members_f = [m for _, m, _ in triples]
            title = (contest_full.get(cc) or "").strip()
            levels_line = sheet_list_display.group_list_levels_relation_line(members_f)
            blob_agg = sheet_list_display.group_list_aggregate_search_blob(cc, title, levels_line, members_f)
            if ql and ql not in blob_agg:
                continue
            rep_id = min(rid for rid, _, _ in triples)
            any_bad_f = any(int(ok_f) == 0 for _, _, ok_f in triples)
            rows_out.append(
                {
                    "id": rep_id,
                    "row_index": agg_row_index,
                    "preview": cc,
                    "title_line": title,
                    "relations_line": levels_line,
                    "ok": 0 if any_bad_f else 1,
                    "errors": [],
                }
            )
            agg_row_index += 1
    else:
        for r in cur.fetchall():
            cur2 = conn.execute(
                f"SELECT * FROM {sheet_storage.quote_ident(t)} WHERE id = ?",
                (int(r["id"]),),
            )
            full = cur2.fetchone()
            cells = sheet_storage.row_to_cells(full, headers) if full else {}
            cc_row = (cells.get("CONTEST_CODE") or "").strip()
            if apply_gf and allowed_cc is not None:
                if not global_sheet_filters.row_matches_native_global_filters(code, cells, gf_sel):
                    continue
                if global_sheet_filters.has_foreign_active_global_dimensions(code, gf_sel):
                    if code == "REWARD":
                        rc_f = (cells.get("REWARD_CODE") or "").strip()
                        if not global_sheet_filters.reward_row_matches_contests(gf_ix, rc_f, allowed_cc):
                            continue
                    elif code in ("CONTEST-DATA", "INDICATOR", "REWARD-LINK", "TOURNAMENT-SCHEDULE"):
                        if cc_row not in allowed_cc:
                            continue
            disp = sheet_list_display.display_for_sheet_row(code, cells, lu)
            blob = sheet_list_display.search_blob(cells, disp)
            if ql and ql not in blob:
                continue
            row_out: Dict[str, Any] = {
                "id": r["id"],
                "row_index": r["row_index"],
                "preview": disp.get("primary_key", ""),
                "title_line": disp.get("title_line", ""),
                "relations_line": disp.get("relations_line", ""),
                "ok": r["consistency_ok"],
                "errors": json.loads(r["consistency_errors"] or "[]"),
            }
            if code == "INDICATOR":
                row_out["contest_code"] = disp.get("contest_code", "")
                row_out["subtitle_line"] = disp.get("subtitle_line", "")
                row_out["add_calc_type"] = disp.get("add_calc_type", "")
                row_out["indicator_code_col"] = disp.get("indicator_code_col", "")
            if code == "REWARD":
                row_out["reward_name_col"] = disp.get("reward_name_col", "")
                row_out["group_codes_col"] = disp.get("group_codes_col", "")
            if code == "REWARD-LINK":
                row_out["reward_link_reward_code"] = disp.get("reward_link_reward_code", "")
                row_out["reward_link_reward_name"] = disp.get("reward_link_reward_name", "")
                row_out["reward_link_contest_code"] = disp.get("reward_link_contest_code", "")
                row_out["reward_link_contest_name"] = disp.get("reward_link_contest_name", "")
                row_out["reward_link_group_code"] = disp.get("reward_link_group_code", "")
            if code == "TOURNAMENT-SCHEDULE":
                row_out["schedule_period_col"] = disp.get("schedule_period_col", "")
                row_out["schedule_contest_name_col"] = disp.get("schedule_contest_name_col", "")
                row_out["schedule_season_col"] = disp.get("schedule_season_col", "")
            if code == "CONTEST-DATA":
                row_out["contest_type_col"] = disp.get("contest_type_col", "")
            rows_out.append(row_out)
    return templates.TemplateResponse(
        request,
        "sheet_list.html",
        {
            "sheet_code": code,
            "sheet_title": spec.get("title") if spec else code,
            "rows": rows_out,
            "q": q,
            "global_filter_blocks": global_filter_blocks,
        },
    )


@app.get("/sheet/{code}/row/{row_id}", response_class=HTMLResponse)
def row_detail(request: Request, code: str, row_id: int):
    conn = get_conn()
    t = sheet_storage.physical_table_name(code)
    cur = conn.execute(
        f"""
        SELECT dr.id, dr.row_index, dr.consistency_ok, dr.consistency_errors
        FROM {sheet_storage.quote_ident(t)} dr
        JOIN sheet s ON s.id = dr.sheet_id
        WHERE s.code = ? AND dr.id = ? AND dr.is_current = 1
        """,
        (code, row_id),
    )
    r = cur.fetchone()
    if not r:
        raise HTTPException(404, "Строка не найдена")
    cells = sheet_storage.fetch_row_cells(conn, CFG, code, row_id)
    if cells is None:
        raise HTTPException(404, "Строка не найдена")
    spec = next((s for s in CFG["sheets"] if s["code"] == code), {})
    json_cols = spec.get("json_columns") or []
    json_blocks = []
    for col in json_cols:
        raw = cells.get(col, "") or ""
        parsed, err = spod_json.try_parse_cell(raw)
        json_blocks.append(
            {
                "column": col,
                "section_slug": re.sub(r"[^a-zA-Z0-9_-]", "_", col),
                "raw": raw,
                "pretty": spod_json.format_json_for_edit(parsed) if parsed is not None else "",
                "parse_error": err,
            }
        )
    rel = relations.build_context_for_row(conn, code, cells)
    flat_columns = [k for k in cells.keys() if k not in json_cols]
    group_row_blocks: List[Dict[str, Any]] = []
    group_editor_bootstraps: List[Dict[str, Any]] = []
    group_contest_code: str = ""
    group_contest_name: str = ""
    if code == "GROUP":
        group_contest_code = (cells.get("CONTEST_CODE") or "").strip()
        contest_full_map: Dict[str, str] = sheet_list_display.build_lookup_tables(conn).get("contest_full") or {}
        group_contest_name = (contest_full_map.get(group_contest_code) or "").strip()
        siblings = sheet_storage.fetch_group_rows_for_contest(conn, group_contest_code)
        if not siblings:
            err_list = json.loads(r["consistency_errors"] or "[]")
            if not isinstance(err_list, list):
                err_list = []
            siblings = [
                {
                    "id": row_id,
                    "row_index": int(r["row_index"]),
                    "consistency_ok": int(r["consistency_ok"] or 0),
                    "consistency_errors": [str(x) for x in err_list],
                    "cells": dict(cells),
                }
            ]
        for sibl in siblings:
            c = sibl["cells"]
            gc = (c.get("GROUP_CODE") or "").strip()
            gv = (c.get("GROUP_VALUE") or "").strip()
            label = f"{gc} : {gv}" if (gc or gv) else "—"
            group_row_blocks.append(
                {
                    "row_id": int(sibl["id"]),
                    "row_index": int(sibl["row_index"]),
                    "block_label": label,
                    "consistency_ok": int(sibl["consistency_ok"] or 0),
                    "consistency_errors": sibl.get("consistency_errors") or [],
                }
            )
            group_editor_bootstraps.append(
                _editor_bootstrap_for_row_cells(conn, code, int(sibl["id"]), dict(c), json_cols)
            )
    editor_bootstrap = _editor_bootstrap_for_row_cells(conn, code, row_id, cells, json_cols)
    row_edit_draft = _fetch_row_edit_draft(conn, code, row_id)
    sheet_title = str(spec.get("title") or code)
    return templates.TemplateResponse(
        request,
        "row_detail.html",
        {
            "sheet_code": code,
            "sheet_title": sheet_title,
            "row_id": row_id,
            "row_index": r["row_index"],
            "cells": cells,
            "json_columns": json_cols,
            "flat_columns": flat_columns,
            "json_blocks": json_blocks,
            "editor_bootstrap_json": _json_for_script_tag(editor_bootstrap),
            "row_edit_draft_json": _json_for_script_tag(row_edit_draft or {}),
            "row_edit_draft": (row_edit_draft or {}),
            "consistency_ok": r["consistency_ok"],
            "consistency_errors": json.loads(r["consistency_errors"] or "[]"),
            "rel": rel,
            "mode": CFG.get("consistency", {}).get("mode", "warn"),
            "group_row_blocks": group_row_blocks,
            "group_editor_bootstraps_json": _json_for_script_tag(group_editor_bootstraps),
            "group_contest_code": group_contest_code,
            "group_contest_name": group_contest_name,
        },
    )


@app.post("/sheet/{code}/row/{row_id}/save")
async def row_save(
    code: str,
    row_id: int,
    payload: Dict[str, Any] = Body(...),
):
    """
    Сохранение новой версии строки: старая помечается is_current=0, вставляется копия с новыми ячейками.
    При отсутствии изменений — 400. После успеха — редирект на id новой актуальной строки.
    """
    conn = get_conn()
    old = sheet_storage.fetch_row_for_update(conn, code, row_id)
    if not old:
        raise HTTPException(404, detail="Строка не найдена или не актуальна (уже заменена).")
    headers = sheet_storage.headers_for_sheet(conn, code)
    old_cells = sheet_storage.row_to_cells(old, headers)
    new_cells: Dict[str, str] = {str(k): str(v) if v is not None else "" for k, v in payload.items()}
    if _cells_canonical_json(old_cells) == _cells_canonical_json(new_cells):
        raise HTTPException(400, detail="Нет изменений — сохранение не требуется.")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    mode = CFG.get("consistency", {}).get("mode", "warn")

    try:
        conn.execute("BEGIN")
        sheet_storage.mark_row_not_current(conn, code, row_id, now)
        new_id = sheet_storage.insert_data_row(
            conn,
            ROOT,
            CFG,
            code,
            int(old["sheet_id"]),
            int(old["row_index"]),
            float(old["sort_key"] if old["sort_key"] is not None else old["row_index"]),
            new_cells,
            now,
            replaces_row_id=row_id,
        )
        consistency.run_all_checks(conn, do_commit=False)
        _delete_row_edit_draft(conn, code, row_id)
        t = sheet_storage.physical_table_name(code)
        cur_ok = conn.execute(
            f"SELECT consistency_ok, consistency_errors FROM {sheet_storage.quote_ident(t)} WHERE id = ?",
            (new_id,),
        )
        chk = cur_ok.fetchone()
        if mode == "strict" and chk and int(chk["consistency_ok"]) == 0:
            conn.rollback()
            errs = json.loads(chk["consistency_errors"] or "[]")
            raise HTTPException(
                400,
                detail="Режим strict: версия не сохранена из‑за ошибок консистентности: " + "; ".join(errs),
            )
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise

    return RedirectResponse(f"/sheet/{code}/row/{new_id}", status_code=303)


@app.get("/sheet/{code}/row/{row_id}/draft")
def row_draft_get(code: str, row_id: int):
    """Получить промежуточный черновик правки строки (status EDIT)."""
    conn = get_conn()
    d = _fetch_row_edit_draft(conn, code, row_id)
    return JSONResponse(d or {"status": "NONE", "state": {}, "updated_at": ""})


@app.put("/sheet/{code}/row/{row_id}/draft")
async def row_draft_put(code: str, row_id: int, payload: Dict[str, Any] = Body(...)):
    """
    Промежуточное подтверждение изменений конкретных полей.
    Состояние хранится как черновик (status EDIT) до финального /save.
    """
    conn = get_conn()
    state = payload.get("state")
    if not isinstance(state, dict):
        raise HTTPException(400, detail="Ожидается объект state.")
    status = str(payload.get("status") or "EDIT").strip().upper() or "EDIT"
    if status != "EDIT":
        raise HTTPException(400, detail="Для черновика строки поддерживается только статус EDIT.")
    _upsert_row_edit_draft(conn, code, row_id, state, status=status)
    conn.commit()
    return JSONResponse({"ok": True, "status": "EDIT"})


@app.delete("/sheet/{code}/row/{row_id}/draft")
def row_draft_delete(code: str, row_id: int):
    """Удалить черновик правки строки (например, при явной отмене)."""
    conn = get_conn()
    _delete_row_edit_draft(conn, code, row_id)
    conn.commit()
    return JSONResponse({"ok": True})


@app.post("/admin/reimport")
def admin_reimport():
    conn = get_conn()
    counts = ingest.import_all(ROOT, CFG, conn, clear=True)
    consistency.run_all_checks(conn)
    logging.info("Переимпорт: %s", counts)
    return RedirectResponse("/", status_code=303)


@app.post("/admin/stop", response_class=HTMLResponse)
def admin_stop() -> HTMLResponse:
    """
    Остановка процесса Uvicorn/панели: завершение дочерних PID (если есть), затем SIGTERM себе.
    Вызывается кнопкой «Остановить» в шапке; ответ отдаётся до фактического kill.
    """
    logging.warning("Запрошена остановка сервера: POST /admin/stop")
    server_stop.schedule_local_shutdown()
    body = (
        "<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"utf-8\"/>"
        "<title>Остановка</title><link rel=\"stylesheet\" href=\"/static/app.css\"/></head>"
        "<body class=stop-ack-body><div class=wrap><section class=panel>"
        "<h1>Сервер останавливается</h1>"
        "<p>Процесс панели завершается; дочерние процессы (если были) получают SIGTERM.</p>"
        "<p class=muted>Окно браузера можно закрыть.</p>"
        "</section></div></body></html>"
    )
    return HTMLResponse(body, status_code=200)


@app.get("/sheet/{code}/export.csv")
def sheet_export_csv(code: str):
    conn = get_conn()
    cur = conn.execute("SELECT file_name FROM sheet WHERE code = ?", (code,))
    r = cur.fetchone()
    if not r:
        raise HTTPException(404)
    out = ROOT / "OUT" / "export" / f"{code.replace('/', '-')}.csv"
    export_csv.export_sheet_to_csv(conn, code, out)
    return FileResponse(out, filename=r["file_name"], media_type="text/csv")
