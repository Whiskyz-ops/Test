@echo off
REM WISING demo launcher (Windows). Double-click this file.
REM It starts a local web server in this folder and opens the dashboard.
REM Close this window to stop the server.
cd /d "%~dp0"
set PORT=8099
set URL=http://localhost:%PORT%/index.html
echo Starting WISING demo at %URL%
echo Leave this window open during the demo. Close it to stop.

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  py -m http.server %PORT%
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  python -m http.server %PORT%
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  npx --yes serve -l %PORT% .
  goto :eof
)
echo No Python or npx found. Double-click dashboard-standalone.html instead.
pause
