@echo off
rem Install Watchfloor as a screensaver for the current user. No admin needed.
rem  1. The server starts at logon (a stub in the Startup folder), minimised,
rem     on port 8088, and is started right now too.
rem  2. After 10 minutes of no input, a full-screen kiosk opens on the tour
rem     (Task Scheduler idle trigger). Esc leaves it.
rem uninstall-screensaver.cmd removes both.
setlocal
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
> "%STARTUP%\watchfloor-server.cmd" echo @call "%~dp0watchfloor-server.cmd"
if errorlevel 1 goto :fail
schtasks /create /f /tn "Watchfloor screensaver" /tr "\"%~dp0watchfloor-screensaver.cmd\"" /sc onidle /i 10 >nul
if errorlevel 1 goto :fail
call "%~dp0watchfloor-server.cmd"
echo Installed: the server starts at logon (and is up now, port 8088), and
echo the screensaver opens after 10 idle minutes. Esc leaves it.
exit /b 0
:fail
echo Install failed.
exit /b 1
