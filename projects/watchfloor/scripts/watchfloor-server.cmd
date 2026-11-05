@echo off
rem The screensaver's own Watchfloor server: port 8088 with its own picture
rem file, so it never collides with a dev server on 8080. Reads the repo's
rem .env for API keys. install-screensaver.cmd puts a stub for this in the
rem Startup folder; it does nothing if the server is already running.
rem
rem It runs with no window: on Windows 11 a "minimised" console opens as an
rem ordinary Windows Terminal window, which is easy to close by accident,
rem and closing it stopped the server. Output goes to .cache\server.log.
rem To stop it: stop-watchfloor-server.cmd.
netstat -ano | findstr /c:":8088 " | findstr LISTENING >nul && exit /b 0
if not exist "%~dp0..\server\dist\index.js" (
  echo Build first: npm run build
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath '%~dp0watchfloor-server-loop.cmd' -WindowStyle Hidden"
