@echo off
rem Undo install-screensaver.cmd: no more server at logon, no idle trigger.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\watchfloor-server.cmd" 2>nul
schtasks /delete /f /tn "Watchfloor screensaver" >nul 2>nul
echo Removed. A server already running keeps going until its window is closed.
