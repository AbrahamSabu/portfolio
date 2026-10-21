#!/usr/bin/env bash
# clipping launcher for macOS / Linux. First run sets up Python, then opens the app.
set -e
cd "$(dirname "$0")"
if [ ! -x "_system/.venv/bin/python" ]; then
  echo "First run: setting up Python. This takes a few minutes, once."
  python3 -m venv _system/.venv
  _system/.venv/bin/python -m pip install --upgrade pip >/dev/null
  _system/.venv/bin/python -m pip install -r _system/requirements.txt
fi
exec _system/.venv/bin/python app.py
