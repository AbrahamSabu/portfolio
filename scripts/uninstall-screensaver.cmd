@echo off
rem Undo install-screensaver.cmd: no more server at logon, no idle trigger,
rem and the running server stopped.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\watchfloor-server.cmd" 2>nul
schtasks /delete /f /tn "Watchfloor screensaver" >nul 2>nul
call "%~dp0stop-watchfloor-server.cmd"
echo Removed.
