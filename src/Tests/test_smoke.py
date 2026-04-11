# -*- coding: utf-8 -*-
"""Минимальные проверки импорта и жизненного цикла приложения."""

from __future__ import annotations

import json
import sqlite3
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class SmokeTest(unittest.TestCase):
    """Базовый импорт и один запрос с поднятым lifespan."""

    def test_import_app(self) -> None:
        from src import app as appmod  # noqa: PLC0415

        self.assertTrue(hasattr(appmod, "app"))

    def test_lifespan_and_get_root(self) -> None:
        from fastapi.testclient import TestClient  # noqa: PLC0415

        from src import app as appmod  # noqa: PLC0415

        db_path = ROOT / "OUT" / "DB" / "tournament_admin.sqlite"
        if db_path.is_file():
            db_path.unlink()
        with TestClient(appmod.app) as client:
            r = client.get("/")
            self.assertEqual(r.status_code, 200)
            self.assertIn("Листы", r.text)
            r2 = client.get("/sheet/CONTEST-DATA")
            self.assertEqual(r2.status_code, 200)
            self.assertIn("CONTEST-DATA", r2.text)

    def test_row_detail_and_save_roundtrip(self) -> None:
        """Карточка строки и сохранение без изменений (тот же JSON ячеек)."""
        from fastapi.testclient import TestClient  # noqa: PLC0415

        from src import app as appmod  # noqa: PLC0415

        db_path = ROOT / "OUT" / "DB" / "tournament_admin.sqlite"
        if db_path.is_file():
            db_path.unlink()
        with TestClient(appmod.app) as client:
            conn = sqlite3.connect(str(db_path))
            rid = conn.execute(
                "SELECT dr.id FROM data_row dr "
                "JOIN sheet s ON s.id = dr.sheet_id WHERE s.code = ? LIMIT 1",
                ("CONTEST-DATA",),
            ).fetchone()[0]
            cells = json.loads(
                conn.execute("SELECT cells_json FROM data_row WHERE id = ?", (rid,)).fetchone()[0]
            )
            conn.close()
            r = client.get(f"/sheet/CONTEST-DATA/row/{rid}")
            self.assertEqual(r.status_code, 200)
            r2 = client.post(
                f"/sheet/CONTEST-DATA/row/{rid}/save",
                json=cells,
                follow_redirects=False,
            )
            self.assertEqual(r2.status_code, 303)


if __name__ == "__main__":
    unittest.main()
