@echo off
rem ============================================================
rem  Antenna LOS - foolproof launcher (Windows)
rem  Double-click this file. It serves the app locally and opens
rem  your browser. If no Python/Node is found, it opens the
rem  online (GitHub Pages) version instead. Either way you get
rem  a working app.
rem ============================================================
setlocal
set "PORT=8080"
set "PAGES=https://noamsolomon123.github.io/antenna-los-test/"
title Antenna LOS

where py >nul 2>nul
if %errorlevel%==0 (
  echo Serving locally with Python at http://localhost:%PORT%/
  start "" "http://localhost:%PORT%/"
  py -m http.server %PORT%
  goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
  echo Serving locally with Python at http://localhost:%PORT%/
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :end
)
where node >nul 2>nul
if %errorlevel%==0 (
  echo Serving locally with Node at http://localhost:%PORT%/
  start "" "http://localhost:%PORT%/"
  node server.js %PORT%
  goto :end
)
echo No Python or Node found on this PC.
echo Opening the online version instead...
start "" "%PAGES%"
:end
endlocal
