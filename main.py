# -*- coding: utf-8 -*-
"""
Точка входа: запуск встроенного Uvicorn без Docker и отдельных сервисов.
Из корня проекта: python main.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> None:
    cfg_path = ROOT / "config.json"
    if not cfg_path.is_file():
        raise SystemExit("Нет config.json в корне проекта")
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    host = cfg["server"]["host"]
    port = int(cfg["server"]["port"])
    # Зависимости панели — только из spod_tournament_admin/requirements.txt (не из venv корня SPOD_PROM).
    try:
        import uvicorn
    except ModuleNotFoundError:
        req = ROOT / "requirements.txt"
        raise SystemExit(
            "Не установлен пакет uvicorn (и, вероятно, остальной стек панели).\n"
            "Сейчас используется не тот Python: нужен интерпретатор из spod_tournament_admin/.venv\n"
            "или скрипт ./run.sh из этой папки.\n\n"
            "Установка и запуск:\n"
            f"  cd {ROOT}\n"
            "  python3 -m venv .venv\n"
            "  source .venv/bin/activate\n"
            f"  pip install -r {req.name}\n"
            "  python main.py\n"
            "либо после установки зависимостей:  ./run.sh\n\n"
            "Не запускайте main.py через SPOD_PROM/venv/bin/python — там нет зависимостей панели."
        ) from None

    print(f"Откройте в браузере: http://{host}:{port}/")
    uvicorn.run(
        "src.app:app",
        host=host,
        port=port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
