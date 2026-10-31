@echo off
rem Watchfloor as a screensaver: a full-screen Edge kiosk on the tour.
rem The server must be running (npm start, port 8080). Esc leaves.
rem
rem To start it by itself after 10 idle minutes, like a real screensaver:
rem   schtasks /create /tn "Watchfloor screensaver" /tr "%~f0" /sc onidle /i 10
set URL=http://127.0.0.1:8080/?screensaver
start "" msedge --kiosk "%URL%" --edge-kiosk-type=fullscreen --no-first-run
