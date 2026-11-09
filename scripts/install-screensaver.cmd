@echo off
rem Install Watchfloor as a screensaver for the current user. No admin needed.
rem  1. The server starts at logon (a stub in the Startup folder), minimised,
rem     on port 8088, and is started right now too.
rem  2. After 10 minutes of no input, a full-screen kiosk opens on the tour
rem     (Task Scheduler idle trigger). Esc or the X at the top right leaves it.
rem uninstall-screensaver.cmd removes both.
setlocal
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
> "%STARTUP%\watchfloor-server.cmd" echo @call "%~dp0watchfloor-server.cmd"
if not exist "%STARTUP%\watchfloor-server.cmd" (
  echo Could not write the logon stub into %STARTUP%
  goto :fail
)
echo Logon stub written.
schtasks /create /f /tn "Watchfloor screensaver" /tr "\"%~dp0watchfloor-screensaver.cmd\"" /sc onidle /i 10
if errorlevel 1 (
  echo Could not create the idle task.
  goto :fail
)
call "%~dp0watchfloor-server.cmd"
echo.
echo Installed: the server starts at logon (and is up now, port 8088), and
echo the screensaver opens after 10 idle minutes. Esc or the X at the top right leaves it.
pause
exit /b 0
:fail
echo Install failed; uninstall-screensaver.cmd cleans up anything partly set up.
pause
exit /b 1
