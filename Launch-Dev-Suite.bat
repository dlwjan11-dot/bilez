@echo off
setlocal
set "ROOT=%~dp0"
set "TARGET=%ROOT%release\win-unpacked\dev-suite.exe"

if exist "%TARGET%" (
    echo Launching fresh Dev Suite release...
    start "" "%TARGET%"
) else (
    echo Missing packaged app: "%TARGET%"
    echo Please run: npm run build-exe
    pause
)
exit /b 0