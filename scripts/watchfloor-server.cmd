@echo off
rem The screensaver's own Watchfloor server: port 8088 with its own picture
rem file, so it never collides with a dev server on 8080. Reads the repo's
rem .env for API keys. install-screensaver.cmd puts a stub for this in the
rem Startup folder; it runs minimised and does nothing if already running.
rem The minimised window is a supervisor: if the server ever crashes it is
rem restarted after five seconds (a stack lands in .cache\crash.log), so the
rem screensaver heals itself. Closing the window stops both.
netstat -ano | findstr /c:":8088 " | findstr LISTENING >nul && exit /b 0
cd /d "%~dp0..\server"
if not exist dist\index.js (
  echo Build first: npm run build
  exit /b 1
)
set PORT=8088
set PICTURE_FILE=../.cache/picture-saver.json
start "Watchfloor server" /min cmd /c "%~dp0watchfloor-server-loop.cmd"
