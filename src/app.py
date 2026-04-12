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

from src import config_validate, consistency, db, editor_config, export_csv, ingest, relations, server_stop, sheet_list_display, spod_json, wizard_contest

ROOT = Path(__file__).resolve().parent.parent
CFG: Dict[str, Any] = {}
CONN: sqlite3.Connection | None = None
DB_PATH: Path | None = None


def _cells_canonical_json(cells: Dict[str, str]) -> str:
    """Стабильная строка для сравнения двух наборов ячеек."""
    return json.dumps(dict(sorted(cells.items())), ensure_ascii=False)


def _json_for_script_tag(obj: Any) -> Markup:
    """Сериализация JSON для вставки в <script type=\"application/json\"> без поломки разметки."""
    s = json.dumps(obj, ensure_ascii=False)
    s = s.replace("<", "\\u003c").replace(">", "\\u003e")
    return Markup(s)


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
    DB_PATH = db.get_db_path(ROOT, CFG)
    CONN = db.open_connection(DB_PATH)
    db.init_schema(CONN)
    db.migrate_data_row_versioning(CONN)
    db.ensure_wizard_draft_table(CONN)
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


def get_conn() -> sqlite3.Connection:
    if CONN is None:
        raise RuntimeError("Нет подключения к БД")
    return CONN


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    """Главная: карточки листов."""
    conn = get_conn()
    cur = conn.execute(
        "SELECT s.code, s.title, s.file_name, COUNT(dr.id) AS n FROM sheet s "
        "LEFT JOIN data_row dr ON dr.sheet_id = s.id AND dr.is_current = 1 "
        "GROUP BY s.id ORDER BY s.code"
    )
    sheets = [dict(r) for r in cur.fetchall()]
    return templates.TemplateResponse(
        request,
        "index.html",
        {"sheets": sheets, "title": "Панель турниров SPOD"},
    )


@app.get("/wizard/new-contest", response_class=HTMLResponse)
def wizard_new_contest(request: Request):
    """Мастер пошагового создания конкурса без записи в БД до финального подтверждения."""
    sch = wizard_contest.build_schema(ROOT, CFG)
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
        res = wizard_contest.commit_wizard(conn, CFG, payload)
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from e
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


@app.get("/sheet/{code}", response_class=HTMLResponse)
def sheet_list(request: Request, code: str, q: str = ""):
    conn = get_conn()
    cur = conn.execute("SELECT id FROM sheet WHERE code = ?", (code,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Неизвестный лист")
    sid = row[0]
    cur = conn.execute(
        "SELECT id, row_index, cells_json, consistency_ok, consistency_errors FROM data_row "
        "WHERE sheet_id = ? AND is_current = 1 ORDER BY sort_key, row_index, id",
        (sid,),
    )
    rows_out: List[Dict[str, Any]] = []
    spec = next((s for s in CFG["sheets"] if s["code"] == code), None)
    ql = q.strip().lower() if q else ""
    lu = sheet_list_display.build_lookup_tables(conn)
    for r in cur.fetchall():
        cells = json.loads(r["cells_json"])
        disp = sheet_list_display.display_for_sheet_row(code, cells, lu)
        blob = sheet_list_display.search_blob(cells, disp)
        if ql and ql not in blob:
            continue
        rows_out.append(
            {
                "id": r["id"],
                "row_index": r["row_index"],
                "preview": disp["primary_key"],
                "title_line": disp["title_line"],
                "relations_line": disp["relations_line"],
                "ok": r["consistency_ok"],
                "errors": json.loads(r["consistency_errors"] or "[]"),
            }
        )
    return templates.TemplateResponse(
        request,
        "sheet_list.html",
        {
            "sheet_code": code,
            "sheet_title": spec.get("title") if spec else code,
            "rows": rows_out,
            "q": q,
        },
    )


@app.get("/sheet/{code}/row/{row_id}", response_class=HTMLResponse)
def row_detail(request: Request, code: str, row_id: int):
    conn = get_conn()
    cur = conn.execute(
        """
        SELECT dr.id, dr.row_index, dr.cells_json, dr.consistency_ok, dr.consistency_errors
        FROM data_row dr
        JOIN sheet s ON s.id = dr.sheet_id
        WHERE s.code = ? AND dr.id = ? AND dr.is_current = 1
        """,
        (code, row_id),
    )
    r = cur.fetchone()
    if not r:
        raise HTTPException(404, "Строка не найдена")
    cells: Dict[str, str] = json.loads(r["cells_json"])
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
    # Данные для клиентского редактора: плоские поля + разобранный JSON по колонкам.
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
    # Параметры UI редактора: списки значений и подсказки по высоте textarea (см. config.json).
    editor_bootstrap = {
        "sheetCode": code,
        "rowId": row_id,
        "flat": {k: cells.get(k, "") for k in flat_columns},
        "jsonCols": json_cols_boot,
        "fullRow": dict(cells),
        "fieldEnums": editor_config.flatten_field_enums(CFG),
        "editorTextareas": editor_config.flatten_editor_textareas(CFG),
        "fieldUi": editor_config.flatten_editor_field_ui(CFG),
        "longTextThreshold": int(CFG.get("editor_long_text_threshold", 120)),
    }
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
            "consistency_ok": r["consistency_ok"],
            "consistency_errors": json.loads(r["consistency_errors"] or "[]"),
            "rel": rel,
            "mode": CFG.get("consistency", {}).get("mode", "warn"),
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
    cur = conn.execute(
        """
        SELECT dr.id, dr.sheet_id, dr.row_index, dr.sort_key, dr.cells_json
        FROM data_row dr
        JOIN sheet s ON s.id = dr.sheet_id
        WHERE s.code = ? AND dr.id = ? AND dr.is_current = 1
        """,
        (code, row_id),
    )
    old = cur.fetchone()
    if not old:
        raise HTTPException(404, detail="Строка не найдена или не актуальна (уже заменена).")
    old_cells: Dict[str, str] = json.loads(old["cells_json"])
    new_cells: Dict[str, str] = {str(k): str(v) if v is not None else "" for k, v in payload.items()}
    if _cells_canonical_json(old_cells) == _cells_canonical_json(new_cells):
        raise HTTPException(400, detail="Нет изменений — сохранение не требуется.")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    mode = CFG.get("consistency", {}).get("mode", "warn")

    try:
        conn.execute("BEGIN")
        conn.execute(
            "UPDATE data_row SET is_current = 0, updated_at = ? WHERE id = ?",
            (now, row_id),
        )
        conn.execute(
            """
            INSERT INTO data_row (sheet_id, row_index, sort_key, cells_json, consistency_ok, consistency_errors, updated_at, is_current, replaces_row_id)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,
            (
                int(old["sheet_id"]),
                int(old["row_index"]),
                float(old["sort_key"] if old["sort_key"] is not None else old["row_index"]),
                json.dumps(new_cells, ensure_ascii=False),
                1,
                "[]",
                now,
                1,
                row_id,
            ),
        )
        new_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        consistency.run_all_checks(conn, do_commit=False)
        cur_ok = conn.execute(
            "SELECT consistency_ok, consistency_errors FROM data_row WHERE id = ?",
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
