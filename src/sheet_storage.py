# -*- coding: utf-8 -*-
"""
Физическое хранение: отдельная таблица SQLite на каждый лист из config.

Колонки: служебные поля + каждая колонка CSV (TEXT) + JSON-колонки как в CSV (TEXT с JSON)
+ денормализованные «листья» JSON с префиксом j__<имя_JSON_колонки>__<путь_через__>.

Из-за версионирования строк (is_current, несколько версий с одним CONTEST_CODE) нельзя
объявить классические FOREIGN KEY между листами на бизнес-ключи; связи обеспечиваются
индексами и проверками consistency.py (см. README / database_model).
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from src import ingest, spod_json

# Служебные колонки каждой таблицы листа (имена не должны пересекаться с заголовками CSV).
SERVICE_COLUMNS: Tuple[str, ...] = (
    "id",
    "sheet_id",
    "row_index",
    "sort_key",
    "consistency_ok",
    "consistency_errors",
    "updated_at",
    "is_current",
    "replaces_row_id",
)

SERVICE_COLUMNS_SQL = """
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL REFERENCES sheet(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    sort_key REAL NOT NULL,
    consistency_ok INTEGER NOT NULL DEFAULT 1,
    consistency_errors TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT,
    is_current INTEGER NOT NULL DEFAULT 1,
    replaces_row_id INTEGER
"""

# Максимум денормализованных колонок j__* на один JSON-столбец (защита от переполнения лимита SQLite).
_MAX_FLAT_PER_JSON_COL = 450


def physical_table_name(sheet_code: str) -> str:
    """Имя таблицы: только буквы, цифры, подчёркивание (без дефисов в идентификаторе)."""
    safe = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in sheet_code.replace("-", "_"))
    return "spod_sheet_" + safe


def quote_ident(name: str) -> str:
    """Экранирование идентификатора SQLite."""
    return '"' + str(name).replace('"', '""') + '"'


def _walk_json_leaves(obj: Any, path_parts: List[str], acc: Dict[str, str]) -> None:
    """
    Собирает плоские пары путь -> строковое значение.
    Путь — сегменты через «__» без префикса j__ (его добавим снаружи).
    """
    if isinstance(obj, dict):
        if not obj and path_parts:
            acc["__".join(path_parts)] = "{}"
        for k, v in obj.items():
            _walk_json_leaves(v, path_parts + [str(k)], acc)
    elif isinstance(obj, list):
        key = "__".join(path_parts) if path_parts else "_root"
        acc[key] = json.dumps(obj, ensure_ascii=False)
    elif obj is None:
        if path_parts:
            acc["__".join(path_parts)] = ""
    else:
        if path_parts:
            acc["__".join(path_parts)] = str(obj)


def flat_map_for_json_column(json_col: str, raw: str) -> Dict[str, str]:
    """
    Возвращает словарь «имя колонки БД» -> значение для денормализации.
    Имена колонок: j__<json_col>__<path>.
    """
    out: Dict[str, str] = {}
    raw = (raw or "").strip()
    if not raw:
        return out
    parsed, err = spod_json.try_parse_cell(raw)
    if err is not None or parsed is None:
        return out
    leaves: Dict[str, str] = {}
    _walk_json_leaves(parsed, [], leaves)
    prefix = f"j__{json_col}__"
    n = 0
    for path_key, val in sorted(leaves.items()):
        if n >= _MAX_FLAT_PER_JSON_COL:
            logging.warning(
                "Денормализация JSON: обрезка листьев для колонки %s (лимит %s)",
                json_col,
                _MAX_FLAT_PER_JSON_COL,
            )
            break
        out[prefix + path_key] = val
        n += 1
    return out


def collect_flat_keys_from_rows(rows: List[Dict[str, str]], json_cols: Sequence[str]) -> Set[str]:
    """Объединение всех ключей j__* по всем строкам выборки CSV."""
    keys: Set[str] = set()
    for jc in json_cols:
        for row in rows:
            keys.update(flat_map_for_json_column(jc, row.get(jc, "") or "").keys())
    return keys


def merge_flat_for_row(cells: Dict[str, str], json_cols: Sequence[str]) -> Dict[str, str]:
    """Словарь денормализованных колонок для одной строки данных."""
    merged: Dict[str, str] = {}
    for jc in json_cols:
        merged.update(flat_map_for_json_column(jc, cells.get(jc, "") or ""))
    return merged


def sheet_spec_by_code(cfg: Dict[str, Any], code: str) -> Dict[str, Any]:
    for s in cfg.get("sheets") or []:
        if str(s.get("code")) == code:
            return dict(s)
    return {}


def load_sheet_csv_sample(root: Path, cfg: Dict[str, Any], spec: Dict[str, Any]) -> Tuple[List[str], List[Dict[str, str]]]:
    """Заголовки и строки CSV для листа (пусто, если файла нет)."""
    in_dir = root / cfg.get("paths", {}).get("input_spod", "IN/SPOD")
    fn = spec.get("file")
    if not fn:
        return [], []
    path = in_dir / str(fn)
    if not path.is_file():
        return [], []
    return ingest._read_csv_rows(path)


def desired_physical_columns(headers: Sequence[str], json_cols: Sequence[str], flat_keys: Set[str]) -> List[str]:
    """Порядок колонок в CREATE TABLE: сначала все заголовки CSV, затем отсортированные j__*."""
    flat_sorted = sorted(flat_keys)
    return list(headers) + flat_sorted


def pragma_column_names(conn: sqlite3.Connection, table: str) -> Set[str]:
    cur = conn.execute(f"PRAGMA table_info({quote_ident(table)})")
    return {str(r[1]) for r in cur.fetchall()}


def drop_physical_table(conn: sqlite3.Connection, sheet_code: str) -> None:
    t = physical_table_name(sheet_code)
    conn.execute(f"DROP TABLE IF EXISTS {quote_ident(t)}")


def create_physical_table(
    conn: sqlite3.Connection,
    sheet_code: str,
    data_columns: Sequence[str],
) -> None:
    """
    Создаёт таблицу листа. data_columns — заголовки CSV + j__* (без служебных имён).
    """
    t = physical_table_name(sheet_code)
    parts: List[str] = [SERVICE_COLUMNS_SQL.rstrip()]
    for col in data_columns:
        if col in SERVICE_COLUMNS:
            raise ValueError(f"Колонка CSV конфликтует со служебной: {col}")
        parts.append(f"{quote_ident(col)} TEXT")
    ddl = f"CREATE TABLE {quote_ident(t)} (\n    " + ",\n    ".join(parts) + "\n)"
    conn.execute(ddl)
    desired = set(data_columns)
    _create_relation_indices(conn, sheet_code, t, desired)


def _create_relation_indices(
    conn: sqlite3.Connection, sheet_code: str, t: str, desired: Set[str]
) -> None:
    """Индексы по ключам связей (актуальные строки is_current=1); только если колонки есть в таблице."""
    qt = quote_ident(t)

    def ix(name: str, col_names: Tuple[str, ...]) -> None:
        if not all(c in desired for c in col_names):
            return
        cols_sql = ", ".join(quote_ident(c) for c in col_names)
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS {quote_ident(name)} ON {qt} ({cols_sql}) WHERE is_current = 1"
        )

    if sheet_code == "CONTEST-DATA":
        ix(f"{t}_ix_contest_code", ("CONTEST_CODE",))
    elif sheet_code == "GROUP":
        ix(f"{t}_ix_cc", ("CONTEST_CODE",))
        ix(f"{t}_ix_cc_gc", ("CONTEST_CODE", "GROUP_CODE"))
        # Логическая уникальность строки — тройка с GROUP_VALUE (индекс для выборок и связей).
        ix(f"{t}_ix_cc_gc_gv", ("CONTEST_CODE", "GROUP_CODE", "GROUP_VALUE"))
    elif sheet_code == "REWARD":
        ix(f"{t}_ix_reward", ("REWARD_CODE",))
    elif sheet_code == "REWARD-LINK":
        ix(f"{t}_ix_rl_cc", ("CONTEST_CODE",))
        ix(f"{t}_ix_rl_rc", ("REWARD_CODE",))
        ix(f"{t}_ix_rl_cc_gc", ("CONTEST_CODE", "GROUP_CODE"))
    elif sheet_code == "INDICATOR":
        ix(f"{t}_ix_ind_cc", ("CONTEST_CODE",))
        ix(f"{t}_ix_ind_code", ("INDICATOR_CODE",))
    elif sheet_code == "TOURNAMENT-SCHEDULE":
        ix(f"{t}_ix_sch_cc", ("CONTEST_CODE",))
        ix(f"{t}_ix_sch_tc", ("TOURNAMENT_CODE",))


def ensure_sheet_table_matches_csv(
    conn: sqlite3.Connection,
    root: Path,
    cfg: Dict[str, Any],
    spec: Dict[str, Any],
) -> bool:
    """
    Создаёт или пересоздаёт таблицу листа, если набор колонок не совпадает с CSV + денормализация.
    Возвращает True, если таблица была пересоздана.
    """
    code = str(spec.get("code") or "")
    if not code:
        return False
    headers, rows = load_sheet_csv_sample(root, cfg, spec)
    json_cols = list(spec.get("json_columns") or [])
    flat_keys = collect_flat_keys_from_rows(rows, json_cols)
    desired = desired_physical_columns(headers, json_cols, flat_keys)
    t = physical_table_name(code)
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (t,),
    )
    exists = cur.fetchone() is not None
    if not exists:
        create_physical_table(conn, code, desired)
        return True
    existing = pragma_column_names(conn, t)
    want = set(SERVICE_COLUMNS) | set(desired)
    if existing != want:
        logging.info("Пересоздание таблицы %s: изменился набор колонок.", t)
        conn.execute(f"DROP TABLE IF EXISTS {quote_ident(t)}")
        create_physical_table(conn, code, desired)
        return True
    return False


def drop_all_physical_tables(conn: sqlite3.Connection) -> None:
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'spod_sheet_%'"
    )
    for (name,) in cur.fetchall():
        conn.execute(f"DROP TABLE IF EXISTS {quote_ident(str(name))}")


def migrate_legacy_data_row(conn: sqlite3.Connection) -> bool:
    """
    Удаляет устаревшую таблицу data_row и все spod_sheet_* (данные нужно загрузить заново импортом).
    Возвращает True, если обнаружена legacy-схема.
    """
    cur = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = 'data_row'"
    )
    if not cur.fetchone():
        return False
    logging.warning(
        "Обнаружена устаревшая таблица data_row: удаление, дроп физических листов. "
        "Выполните переимпорт (при пустом реестре sheet — автоматически при старте)."
    )
    conn.execute("DROP TABLE IF EXISTS data_row")
    drop_all_physical_tables(conn)
    conn.execute("DELETE FROM sheet")
    conn.commit()
    return True


def headers_for_sheet(conn: sqlite3.Connection, sheet_code: str) -> List[str]:
    """Порядок колонок CSV, сохранённый при импорте."""
    cur = conn.execute(
        "SELECT headers_json FROM sheet WHERE code = ?",
        (sheet_code,),
    )
    r = cur.fetchone()
    if not r:
        return []
    try:
        arr = json.loads(r["headers_json"] or "[]")
        return [str(x) for x in arr] if isinstance(arr, list) else []
    except json.JSONDecodeError:
        return []


def json_columns_for_sheet(cfg: Dict[str, Any], sheet_code: str) -> List[str]:
    return list(sheet_spec_by_code(cfg, sheet_code).get("json_columns") or [])


def cells_to_db_payload(
    cells: Dict[str, Any],
    headers: Sequence[str],
    json_cols: Sequence[str],
) -> Dict[str, Any]:
    """
    Готовит значения для INSERT/UPDATE: только колонки данных + денормализация JSON.
    Все значения приводятся к строкам (как в прежнем cells_json).
    """
    row: Dict[str, Any] = {}
    for h in headers:
        v = cells.get(h)
        row[h] = "" if v is None else str(v)
    flat = merge_flat_for_row({str(k): str(v) if v is not None else "" for k, v in row.items()}, json_cols)
    row.update(flat)
    return row


def fetch_row_cells(conn: sqlite3.Connection, cfg: Dict[str, Any], sheet_code: str, row_id: int) -> Optional[Dict[str, str]]:
    """Актуальная строка: словарь ячеек как раньше (только колонки CSV, без j__)."""
    t = physical_table_name(sheet_code)
    headers = headers_for_sheet(conn, sheet_code)
    if not headers:
        return None
    cur = conn.execute(
        f"SELECT * FROM {quote_ident(t)} WHERE id = ? AND is_current = 1",
        (row_id,),
    )
    r = cur.fetchone()
    if not r:
        return None
    return row_to_cells(r, headers)


def row_to_cells(row: sqlite3.Row, headers: Sequence[str]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for h in headers:
        if h not in row.keys():
            out[h] = ""
            continue
        v = row[h]
        out[h] = "" if v is None else str(v)
    return out


def data_column_order(conn: sqlite3.Connection, sheet_code: str) -> List[str]:
    """Порядок пользовательских колонок таблицы листа (cid), без служебных."""
    t = physical_table_name(sheet_code)
    cur = conn.execute(f"PRAGMA table_info({quote_ident(t)})")
    cols: List[str] = []
    for r in cur.fetchall():
        name = str(r[1])
        if name not in SERVICE_COLUMNS:
            cols.append(name)
    return cols


def next_row_index(conn: sqlite3.Connection, sheet_id: int, sheet_code: str) -> int:
    t = physical_table_name(sheet_code)
    cur = conn.execute(
        f"SELECT COALESCE(MAX(row_index), -1) AS m FROM {quote_ident(t)} WHERE sheet_id = ?",
        (sheet_id,),
    )
    m = cur.fetchone()
    return int(m["m"]) + 1 if m else 0


def insert_data_row(
    conn: sqlite3.Connection,
    root: Path,
    cfg: Dict[str, Any],
    sheet_code: str,
    sheet_id: int,
    row_index: int,
    sort_key: float,
    cells: Dict[str, Any],
    now: str,
    *,
    replaces_row_id: Optional[int] = None,
) -> int:
    """Вставка новой актуальной строки листа. Возвращает id."""
    spec = sheet_spec_by_code(cfg, sheet_code)
    headers = headers_for_sheet(conn, sheet_code)
    if not headers:
        headers, _ = load_sheet_csv_sample(root, cfg, spec)
    if not headers:
        raise ValueError(f"Нет заголовков для листа {sheet_code} (импорт sheet не выполнен?).")
    json_cols = json_columns_for_sheet(cfg, sheet_code)
    base: Dict[str, Any] = {}
    for h in headers:
        v = cells.get(h)
        base[h] = "" if v is None else str(v)
    payload = cells_to_db_payload(base, headers, json_cols)
    t = physical_table_name(sheet_code)
    data_cols_ordered = data_column_order(conn, sheet_code)
    full_vals = {c: payload.get(c, "") for c in data_cols_ordered}
    cols = [
        "sheet_id",
        "row_index",
        "sort_key",
        "consistency_ok",
        "consistency_errors",
        "updated_at",
        "is_current",
        "replaces_row_id",
    ] + data_cols_ordered
    placeholders = ", ".join(["?"] * len(cols))
    col_sql = ", ".join(quote_ident(c) for c in cols)
    values: List[Any] = [
        sheet_id,
        row_index,
        sort_key,
        1,
        "[]",
        now,
        1,
        replaces_row_id,
    ] + [full_vals[c] for c in data_cols_ordered]
    conn.execute(
        f"INSERT INTO {quote_ident(t)} ({col_sql}) VALUES ({placeholders})",
        values,
    )
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def mark_row_not_current(conn: sqlite3.Connection, sheet_code: str, row_id: int, now: str) -> None:
    t = physical_table_name(sheet_code)
    conn.execute(
        f"UPDATE {quote_ident(t)} SET is_current = 0, updated_at = ? WHERE id = ?",
        (now, row_id),
    )


def update_consistency_for_row(conn: sqlite3.Connection, sheet_code: str, row_id: int, ok: int, errors_json: str) -> None:
    t = physical_table_name(sheet_code)
    conn.execute(
        f"UPDATE {quote_ident(t)} SET consistency_ok = ?, consistency_errors = ? WHERE id = ?",
        (ok, errors_json, row_id),
    )


def fetch_row_for_update(
    conn: sqlite3.Connection, sheet_code: str, row_id: int
) -> Optional[sqlite3.Row]:
    """Актуальная строка для сохранения (с sheet_id и sort_key)."""
    t = physical_table_name(sheet_code)
    cur = conn.execute(
        f"""
        SELECT * FROM {quote_ident(t)}
        WHERE id = ? AND is_current = 1
        """,
        (row_id,),
    )
    return cur.fetchone()


def rebuild_all_sheet_tables_from_config(conn: sqlite3.Connection, root: Path, cfg: Dict[str, Any]) -> None:
    """Проверяет DDL каждого листа по текущим CSV (может пересоздать таблицу)."""
    for spec in cfg.get("sheets") or []:
        if spec.get("code"):
            ensure_sheet_table_matches_csv(conn, root, cfg, spec)
    conn.commit()


def relation_doc_lines(cfg: Dict[str, Any]) -> List[str]:
    """Краткое текстовое описание логических связей для README / database_model."""
    return [
        "CONTEST-DATA: бизнес-ключ CONTEST_CODE (не уникален между версиями строки).",
        "GROUP: много строк на один CONTEST_CODE (N:1); уникальность актуальной строки — тройка (CONTEST_CODE, GROUP_CODE, GROUP_VALUE).",
        "REWARD: ключ REWARD_CODE; REWARD-LINK ссылается на CONTEST_CODE, GROUP_CODE, REWARD_CODE.",
        "INDICATOR: CONTEST_CODE + INDICATOR_CODE.",
        "TOURNAMENT-SCHEDULE: CONTEST_CODE + TOURNAMENT_CODE.",
        "Целостность ссылок — consistency.py; индексы по ключам на физических таблицах spod_sheet_*.",
    ]
