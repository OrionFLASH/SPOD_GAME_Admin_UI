# -*- coding: utf-8 -*-
"""
Одноразовая/повторная генерация блока editor_field_ui в config.json.

Берёт заголовки CSV листа и объединяет пути листьев JSON по всем строкам выборки
для колонок из sheets[].json_columns (через spod_json.try_parse_cell).
Подписи и описания по умолчанию совпадают с именем колонки / путём; show_description: false.
После генерации можно вручную править label, description и show_description в config.json.

Формат вывода для JSON-колонок — плоский: отдельное правило на каждый путь (поля column и json_path).
В рабочем config.json длинные блоки удобно сворачивать в одну запись с тем же column и массивом paths
(в каждом элементе paths — json_path, label, description и пр.); развёртка в плоский список для UI —
в editor_config.flatten_editor_field_ui (см. README).
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from spod_json import try_parse_cell  # noqa: E402


def format_path(parts: list) -> str:
    s = ""
    for p in parts:
        if isinstance(p, int):
            s += f"[{p}]"
        elif s == "":
            s = str(p)
        elif s.endswith("]"):
            s += "." + str(p)
        else:
            s += "." + str(p)
    return s or "(корень)"


def leaf_paths_from_value(val: object, parts: list, out: list) -> None:
    if val is None:
        out.append(parts[:])
        return
    if isinstance(val, (str, int, float, bool)):
        out.append(parts[:])
        return
    if isinstance(val, list):
        if len(val) == 0:
            out.append(parts[:])
            return
        for i, item in enumerate(val):
            leaf_paths_from_value(item, parts + [i], out)
        return
    if isinstance(val, dict):
        if len(val) == 0:
            out.append(parts[:])
            return
        for k in sorted(val.keys()):
            leaf_paths_from_value(val[k], parts + [str(k)], out)
        return


def flat_column_flags(rows: list, col: str) -> dict:
    """
    По всем строкам CSV: required — ни в одной строке значение не пустое (в истории всегда заполнено);
    allows_empty — встречалась хотя бы одна пустая ячейка (или все пустые — поле необязательное).
    """
    if not rows:
        return {"required": False, "allows_empty": True}
    nonempty = 0
    empty = 0
    for row in rows:
        v = row.get(col, "")
        s = str(v).strip() if v is not None else ""
        if s == "":
            empty += 1
        else:
            nonempty += 1
    if nonempty == 0:
        return {"required": False, "allows_empty": True}
    required = empty == 0
    allows_empty = empty > 0
    return {"required": required, "allows_empty": allows_empty}


def collect_paths_union(rows: list, column_name: str, max_rows: int = 400) -> list:
    union: dict[str, list] = {}
    for row in rows[:max_rows]:
        raw = row.get(column_name) or ""
        if not str(raw).strip():
            continue
        parsed, err = try_parse_cell(raw)
        if err is not None or parsed is None:
            continue
        paths: list = []
        leaf_paths_from_value(parsed, [], paths)
        for pl in paths:
            key = json.dumps(pl, ensure_ascii=False)
            union[key] = pl
    return list(union.values())


def main() -> None:
    cfg_path = ROOT / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    input_dir = ROOT / (cfg.get("paths") or {}).get("input_spod", "IN/SPOD")
    sheets = cfg.get("sheets") or []
    blocks: list = []
    for spec in sheets:
        code = spec.get("code")
        fn = spec.get("file")
        if not code or not fn:
            continue
        csv_path = ROOT / input_dir / str(fn)
        if not csv_path.is_file():
            print("пропуск: нет файла", csv_path)
            continue
        with csv_path.open(encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f, delimiter=";")
            fieldnames = reader.fieldnames or []
            rows = list(reader)
        json_cols = set(spec.get("json_columns") or [])
        rules: list = []
        for h in fieldnames:
            if not h or h in json_cols:
                continue
            flags = flat_column_flags(rows, h)
            rules.append(
                {
                    "column": h,
                    "label": h,
                    "description": h,
                    "show_description": False,
                    "required": flags["required"],
                    "allows_empty": flags["allows_empty"],
                }
            )
        for jc in sorted(json_cols):
            if jc not in fieldnames:
                continue
            paths = collect_paths_union(rows, jc)
            if not paths:
                rules.append(
                    {
                        "column": jc,
                        "label": jc,
                        "description": jc,
                        "show_description": False,
                        "required": False,
                        "allows_empty": True,
                    }
                )
                continue
            paths.sort(key=lambda pl: format_path(pl))
            for pl in paths:
                fp = format_path(pl)
                rules.append(
                    {
                        "column": jc,
                        "json_path": pl,
                        "label": fp,
                        "description": fp,
                        "show_description": False,
                        "required": False,
                        "allows_empty": True,
                    }
                )
        blocks.append({"sheet_code": code, "rules": rules})
        print(code, "правил:", len(rules))

    cfg["editor_field_ui"] = blocks
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("записано:", cfg_path)


if __name__ == "__main__":
    main()
