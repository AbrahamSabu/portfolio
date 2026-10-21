@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo  Clipper setup
echo ============================================
echo.

echo Creating folders...
if not exist "_system" mkdir "_system"
if not exist "1 Drop videos here" mkdir "1 Drop videos here"
if not exist "2 Clips" mkdir "2 Clips"

echo Moving code into _system...
for %%F in (auto.py captions.py clips_schema.py ingest.py reframe.py render.py run.py select_clips.py transcribe.py requirements.txt CLIPPING_BRIEF.md README.md) do (
    if exist "%%F" move /y "%%F" "_system\" >nul
)

echo Removing old folders...
if exist "out"    rmdir /s /q "out"
if exist "work"   rmdir /s /q "work"
if exist "inbox"  rmdir /s /q "inbox"
if exist "done"   rmdir /s /q "done"
if exist "failed" rmdir /s /q "failed"
if exist ".venv"  rmdir /s /q ".venv"
if exist "__pycache__" rmdir /s /q "__pycache__"

echo.
echo Building Python environment (a few minutes the first time)...
cd "_system"
python -m venv .venv
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
cd ..

echo.
echo Hiding system folder...
attrib +h "_system"

echo.
echo ============================================
echo  Done.
echo.
echo  Put videos in : 1 Drop videos here
echo  Then run      : CLIP.bat
echo  Clips land in : 2 Clips
echo ============================================
echo.
pause
