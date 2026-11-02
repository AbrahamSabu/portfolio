@echo off
rem Runs the server and restarts it if it dies (see watchfloor-server.cmd).
rem Started minimised by watchfloor-server.cmd; safe standalone too.
cd /d "%~dp0..\server"
set PORT=8088
set PICTURE_FILE=../.cache/picture-saver.json
:run
node --enable-source-maps dist/index.js
echo %date% %time% server exited with code %errorlevel%, restarting in 5 s
timeout /t 5 /nobreak >nul
rem If another instance took the port meanwhile (a redeploy), bow out.
netstat -ano | findstr /c:":8088 " | findstr LISTENING >nul && exit /b 0
goto run
