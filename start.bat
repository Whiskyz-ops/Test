@echo off
REM WISING demo launcher (Windows). Double-click this file.
REM
REM Serves the WHOLE app - Layer 0 router, both Layer 1 intake forms, AND the
REM Layer 2 Monitor - from a SINGLE web address. That single origin is what makes
REM the Layer 0 -> Layer 1 -> Layer 2 data flow work: the forms and the Monitor
REM share data through the browser's localStorage, which is tied to the address
REM it was saved under. Two different addresses = they can't see each other's
REM data and the forms look empty. This launcher guarantees one address.
REM
REM Close this window to stop the server.
cd /d "%~dp0"
set PORT=8099
set OUT=monitor-next\out
set URL=http://localhost:%PORT%/

REM Build the single-origin bundle if it isn't there yet (first run / fresh clone).
if not exist "%OUT%\index.html" (
  echo First run: building the app bundle ^(this can take a minute^)...
  pushd monitor-next
  if not exist node_modules ( call npm install --no-audit --no-fund )
  call npm run build
  popd
)

echo Starting WISING at %URL%
echo Everything (router, both forms, Monitor) is served from this ONE address.
echo In the Monitor, pick a test profile from the dropdown, then click the
echo Router / India / US links up top - the forms will be populated from it.
echo Leave this window open during the demo. Close it to stop.

REM Serve the built bundle (out\) - NOT the repo root - so the Monitor is the
REM landing page and the forms are its same-origin siblings.
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  cd "%OUT%"
  py -m http.server %PORT%
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  cd "%OUT%"
  python -m http.server %PORT%
  goto :eof
)
where npx >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  npx --yes serve -l %PORT% "%OUT%"
  goto :eof
)
echo No Python or npx found. Please install Python 3, then run this again.
pause
