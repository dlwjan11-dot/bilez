@echo off
setlocal
set "ROOT=%~dp0"
set "TARGET=%ROOT%release\win-unpacked\dev-suite.exe"
if exist "%TARGET%" (
  echo Launching cleaned Dev Suite build...
  start "" "%TARGET%"
) else (
  echo Missing app: "%TARGET%"
  echo Please run: npm run build-exe
  pause
)
