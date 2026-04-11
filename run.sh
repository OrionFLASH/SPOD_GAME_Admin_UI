#!/usr/bin/env bash
# Запуск панели с интерпретатором из локального .venv (не из venv корня SPOD_PROM).
set -e
cd "$(dirname "$0")"
PY=".venv/bin/python"
if [[ ! -x "$PY" ]]; then
  echo "Нет $PY — создайте окружение и установите зависимости:"
  echo "  python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi
exec "$PY" main.py "$@"
