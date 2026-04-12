# -*- coding: utf-8 -*-
"""
Локальное завершение процесса панели по запросу из UI (POST /admin/stop).

Панель рассчитана на запуск на своей машине без внешней аутентификации: любой,
кто может открыть страницу, может остановить сервер — это осознанный компромисс.
"""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import threading
import time
from typing import List

logger = logging.getLogger(__name__)


def _child_pids_unix(ppid: int) -> List[int]:
    """Список прямых дочерних процессов (pgrep -P), только POSIX."""
    try:
        proc = subprocess.run(
            ["pgrep", "-P", str(ppid)],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except (FileNotFoundError, OSError):
        return []
    out: List[int] = []
    for line in (proc.stdout or "").splitlines():
        s = line.strip()
        if s.isdigit():
            out.append(int(s))
    return out


def _sigterm(pid: int) -> None:
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    except PermissionError:
        logger.warning("Нет прав завершить процесс pid=%s", pid)


def _shutdown_worker() -> None:
    """
    Небольшая задержка — чтобы успел уйти HTTP-ответ клиенту,
    затем SIGTERM дочерним процессам (если есть) и текущему процессу панели.
    """
    time.sleep(0.45)
    me = os.getpid()
    if sys.platform != "win32":
        for pid in _child_pids_unix(me):
            logger.info("Завершение дочернего процесса панели pid=%s", pid)
            _sigterm(pid)
        time.sleep(0.1)
    logger.warning("Завершение процесса панели pid=%s (SIGTERM)", me)
    _sigterm(me)
    if sys.platform == "win32":
        return
    time.sleep(2.5)
    try:
        os.kill(me, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except PermissionError:
        pass


def schedule_local_shutdown() -> None:
    """Запускает завершение в фоновом потоке (после ответа обработчика маршрута)."""
    t = threading.Thread(target=_shutdown_worker, name="spod-admin-stop", daemon=True)
    t.start()
