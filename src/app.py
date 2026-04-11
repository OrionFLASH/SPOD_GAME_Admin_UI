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
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from markupsafe import Markup

from src import consistency, db, export_csv, ingest, relations, sheet_list_display, spod_json

ROOT = Path(__file__).resolve().parent.parent
CFG: Dict[str, Any] = {}
CONN: sqlite3.Connection | None = None
DB_PATH: Path | None = None


def _json_for_script_tag(obj: Any) -> Markup:
    """Сериализация JSON для вставки в <script type=\"application/json\"> без поломки разметки."""
    s = json.dumps(obj, ensure_ascii=False)
    s = s.replace("<", "\\u003c").replace(">", "\\u003e")
    return Markup(s)


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
    DB_PATH = db.get_db_path(ROOT, CFG)
    CONN = db.open_connection(DB_PATH)
    db.init_schema(CONN)
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
        "LEFT JOIN data_row dr ON dr.sheet_id = s.id GROUP BY s.id ORDER BY s.code"
    )
    sheets = [dict(r) for r in cur.fetchall()]
    return templates.TemplateResponse(
        request,
        "index.html",
        {"sheets": sheets, "title": "Панель турниров SPOD"},
    )


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
        "WHERE sheet_id = ? ORDER BY row_index",
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
        WHERE s.code = ? AND dr.id = ?
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
    editor_bootstrap = {
        "sheetCode": code,
        "rowId": row_id,
        "flat": {k: cells.get(k, "") for k in flat_columns},
        "jsonCols": json_cols_boot,
    }
    return templates.TemplateResponse(
        request,
        "row_detail.html",
        {
            "sheet_code": code,
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
    """Сохранение: тело запроса — JSON-объект «колонка → строковое значение ячейки»."""
    conn = get_conn()
    cur = conn.execute(
        """
        SELECT dr.id FROM data_row dr
        JOIN sheet s ON s.id = dr.sheet_id
        WHERE s.code = ? AND dr.id = ?
        """,
        (code, row_id),
    )
    if not cur.fetchone():
        raise HTTPException(404)
    new_cells: Dict[str, str] = {str(k): str(v) if v is not None else "" for k, v in payload.items()}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    mode = CFG.get("consistency", {}).get("mode", "warn")

    try:
        conn.execute("BEGIN")
        conn.execute(
            "UPDATE data_row SET cells_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(new_cells, ensure_ascii=False), now, row_id),
        )
        consistency.run_all_checks(conn, do_commit=False)
        cur_ok = conn.execute(
            "SELECT consistency_ok, consistency_errors FROM data_row WHERE id = ?",
            (row_id,),
        )
        chk = cur_ok.fetchone()
        if mode == "strict" and chk and int(chk["consistency_ok"]) == 0:
            conn.rollback()
            errs = json.loads(chk["consistency_errors"] or "[]")
            raise HTTPException(
                400,
                detail="Режим strict: строка не сохранена из‑за ошибок консистентности: " + "; ".join(errs),
            )
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise

    return RedirectResponse(f"/sheet/{code}/row/{row_id}", status_code=303)


@app.post("/admin/reimport")
def admin_reimport():
    conn = get_conn()
    counts = ingest.import_all(ROOT, CFG, conn, clear=True)
    consistency.run_all_checks(conn)
    logging.info("Переимпорт: %s", counts)
    return RedirectResponse("/", status_code=303)


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
