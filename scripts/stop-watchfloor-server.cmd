@echo off
rem Stop the screensaver's Watchfloor server: its supervisor first, so it
rem doesn't restart the server, then the server itself.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-watchfloor-server.ps1"
