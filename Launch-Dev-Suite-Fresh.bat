@echo off
setlocal
set "ROOT=%~dp0"
set "TARGET=%ROOT%release\win-unpacked\dev-suite.exe"

if exist "%TARGET%" (
    echo Launching fresh Dev Suite build...
    start "" "%TARGET%"
) else (
    echo Missing packaged app: "%TARGET%"
    echo Building a fresh release now...
    cd /d "%ROOT%"
    call npm run build-exe
    if exist "%TARGET%" (
        start "" "%TARGET%"
    ) else (
        echo Build failed or the app is still missing.
        pause
    )
)

exit /b 0
