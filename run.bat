@echo off
rem ============================================================
rem  Antenna LOS - foolproof launcher (Windows). Double-click me.
rem  Delegates to run.ps1, which finds a free port, starts the
rem  local server, waits until it is ready, then opens the browser.
rem  If no Python/Node exists, it opens the online version instead.
rem ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
if %errorlevel% neq 0 (
  echo.
  echo Could not start locally. Opening the online version...
  start "" "https://noamsolomon123.github.io/antenna-los-test/"
)
