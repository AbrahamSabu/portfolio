@echo off
cd /d "%~dp0"
call "_system\.venv\Scripts\activate.bat"
python "_system\auto.py"
echo.
echo ----------------------------------------
echo Finished. Press any key to close.
pause >nul
