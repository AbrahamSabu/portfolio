@echo off
title Clipper - watching for videos
cd /d "%~dp0"
call "_system\.venv\Scripts\activate.bat"
python "_system\auto.py" --watch
pause >nul
