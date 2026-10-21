@echo off
title clipping
cd /d "%~dp0"
if not exist "_system\.venv\Scripts\python.exe" (
  echo First run: setting up Python. This takes a few minutes, once.
  python -m venv "_system\.venv" || (echo. & echo Python wasn't found. Install it from https://python.org and tick "Add to PATH". & pause & exit /b 1)
  "_system\.venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  "_system\.venv\Scripts\python.exe" -m pip install -r "_system\requirements.txt"
)
"_system\.venv\Scripts\python.exe" app.py
pause
