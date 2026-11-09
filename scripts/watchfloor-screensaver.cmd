@echo off
rem Watchfloor as a screensaver: a full-screen Edge kiosk on the tour.
rem Esc leaves; so does the X at the top right. Starts the screensaver's server (port 8088) if it isn't up.
rem install-screensaver.cmd wires this to a 10-minute idle trigger.
call "%~dp0watchfloor-server.cmd"
set URL=http://127.0.0.1:8088/?screensaver
start "" msedge --kiosk "%URL%" --edge-kiosk-type=fullscreen --no-first-run
