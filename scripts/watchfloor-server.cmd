@echo off
rem The screensaver's own Watchfloor server: port 8088 with its own picture
rem file, so it never collides with a dev server on 8080. Reads the repo's
rem .env for API keys. install-screensaver.cmd puts a stub for this in the
rem Startup folder; it runs minimised and does nothing if already running.
netstat -ano | findstr /c:":8088 " | findstr LISTENING >nul && exit /b 0
cd /d "%~dp0..\server"
if not exist dist\index.js (
  echo Build first: npm run build
  exit /b 1
)
set PORT=8088
set PICTURE_FILE=../.cache/picture-saver.json
start "Watchfloor server" /min node --enable-source-maps dist/index.js
