@echo off
rem Runs the server and restarts it if it dies, five seconds later. Started
rem hidden by watchfloor-server.cmd; stopped by stop-watchfloor-server.cmd.
cd /d "%~dp0..\server"
set PORT=8088
set PICTURE_FILE=../.cache/picture-saver.json
if not exist ..\.cache mkdir ..\.cache
:run
rem Keep the log from growing without end: one old copy, 5 MB each.
for %%F in ("..\.cache\server.log") do if %%~zF GTR 5000000 move /y "..\.cache\server.log" "..\.cache\server.log.1" >nul
echo %date% %time% starting>> ..\.cache\server.log
node --enable-source-maps dist/index.js >> ..\.cache\server.log 2>&1
echo %date% %time% server exited with code %errorlevel%, restarting in 5 s>> ..\.cache\server.log
rem ping, not timeout: timeout gives up at once when there's no console input.
ping -n 6 127.0.0.1 >nul
rem Someone else serving 8088 by now (a redeploy): bow out.
netstat -ano | findstr /c:":8088 " | findstr LISTENING >nul && exit /b 0
goto run
