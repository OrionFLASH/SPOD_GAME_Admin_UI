# -*- coding: utf-8 -*-
"""Минимальные проверки импорта и жизненного цикла приложения."""

from __future__ import annotations

import json
import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

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
            self.assertIn("sheet-list-form-reward", r2.text)
            self.assertIn("Тип конкурса", r2.text)
            self.assertNotIn("col-contest-relations", r2.text)
            rw = client.get("/wizard/new-contest")
            self.assertEqual(rw.status_code, 200)
            self.assertIn("wizard-schema-json", rw.text)
            self.assertIn("/static/row_editor.js", rw.text)
            self.assertIn("CONTEST-DATA", rw.text)
            self.assertIn("Как продолжить", rw.text)
            rseed = client.get("/wizard/new-contest/seed-contests")
            self.assertEqual(rseed.status_code, 200)
            self.assertIsInstance(rseed.json(), list)
            rd = client.get("/wizard/new-contest/drafts")
            self.assertEqual(rd.status_code, 200)
            self.assertIsInstance(rd.json(), list)

    def test_row_detail_and_save_roundtrip(self) -> None:
        """Карточка строки: без изменений — 400; с изменением — 303 и новая версия строки."""
        import re  # noqa: PLC0415

        from fastapi.testclient import TestClient  # noqa: PLC0415

        from src import app as appmod  # noqa: PLC0415
        from src import sheet_storage  # noqa: PLC0415

        db_path = ROOT / "OUT" / "DB" / "tournament_admin.sqlite"
        if db_path.is_file():
            db_path.unlink()
        with TestClient(appmod.app) as client:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            tbl = sheet_storage.physical_table_name("CONTEST-DATA")
            rid = conn.execute(
                f"SELECT dr.id FROM {sheet_storage.quote_ident(tbl)} dr "
                "JOIN sheet s ON s.id = dr.sheet_id "
                "WHERE s.code = ? AND dr.is_current = 1 LIMIT 1",
                ("CONTEST-DATA",),
            ).fetchone()[0]
            headers = json.loads(
                conn.execute("SELECT headers_json FROM sheet WHERE code = ?", ("CONTEST-DATA",)).fetchone()[0]
            )
            cells: dict[str, str] = {}
            for h in headers:
                cells[h] = conn.execute(
                    f"SELECT {sheet_storage.quote_ident(h)} FROM {sheet_storage.quote_ident(tbl)} WHERE id = ?",
                    (rid,),
                ).fetchone()[0] or ""
            conn.close()
            r = client.get(f"/sheet/CONTEST-DATA/row/{rid}")
            self.assertEqual(r.status_code, 200)
            self.assertIn('"fieldUi"', r.text)
            r_same = client.post(
                f"/sheet/CONTEST-DATA/row/{rid}/save",
                json=cells,
                follow_redirects=False,
            )
            self.assertEqual(r_same.status_code, 400)

            cells2 = dict(cells)
            cells2["FULL_NAME"] = (cells2.get("FULL_NAME") or "") + " __smoke_edit__"
            r2 = client.post(
                f"/sheet/CONTEST-DATA/row/{rid}/save",
                json=cells2,
                follow_redirects=False,
            )
            self.assertEqual(r2.status_code, 303, msg=r2.text)
            loc = r2.headers.get("location") or ""
            m = re.search(r"/row/(\d+)", loc)
            self.assertIsNotNone(m, msg="ожидался редирект на /row/<новый_id>")
            new_id = int(m.group(1))
            self.assertNotEqual(new_id, rid)

            conn = sqlite3.connect(str(db_path))
            old_cur = conn.execute(
                f"SELECT is_current FROM {sheet_storage.quote_ident(tbl)} WHERE id = ?", (rid,)
            ).fetchone()[0]
            new_cur = conn.execute(
                f"SELECT is_current FROM {sheet_storage.quote_ident(tbl)} WHERE id = ?", (new_id,)
            ).fetchone()[0]
            conn.close()
            self.assertEqual(old_cur, 0)
            self.assertEqual(new_cur, 1)

    def test_relations_full_set_by_contest_code(self) -> None:
        """Карточка REWARD показывает полный комплект связей по CONTEST_CODE через REWARD-LINK."""
        from fastapi.testclient import TestClient  # noqa: PLC0415

        from src import app as appmod  # noqa: PLC0415
        from src import sheet_storage  # noqa: PLC0415

        db_path = ROOT / "OUT" / "DB" / "tournament_admin.sqlite"
        if db_path.is_file():
            db_path.unlink()
        with TestClient(appmod.app) as client:
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            tbl = sheet_storage.physical_table_name("REWARD")
            rid = conn.execute(
                f"SELECT dr.id FROM {sheet_storage.quote_ident(tbl)} dr "
                "JOIN sheet s ON s.id = dr.sheet_id "
                "WHERE s.code = ? AND dr.is_current = 1 LIMIT 1",
                ("REWARD",),
            ).fetchone()[0]
            conn.close()

            r = client.get(f"/sheet/REWARD/row/{rid}")
            self.assertEqual(r.status_code, 200)
            self.assertIn(">Конкурс<", r.text)
            self.assertIn("Связи REWARD-LINK", r.text)
            self.assertIn(">GROUP<", r.text)

    @patch("src.app.server_stop.schedule_local_shutdown")
    def test_admin_stop_does_not_kill_process(self, mock_sched: object) -> None:
        """POST /admin/stop отдаёт ответ; реальное завершение процесса не вызывается (мок)."""
        from fastapi.testclient import TestClient  # noqa: PLC0415

        from src import app as appmod  # noqa: PLC0415

        db_path = ROOT / "OUT" / "DB" / "tournament_admin.sqlite"
        if db_path.is_file():
            db_path.unlink()
        with TestClient(appmod.app) as client:
            r = client.post("/admin/stop")
            self.assertEqual(r.status_code, 200)
            self.assertIn("останавливается", r.text.lower())
            mock_sched.assert_called_once()


if __name__ == "__main__":
    unittest.main()
