@echo off
setlocal
title NeuroDesk

REM --- Toolchain paths ---
set "GO_ROOT=C:\go"
set "GOMODCACHE=%USERPROFILE%\go\pkg\mod"
if exist "%GO_ROOT%\bin\go.exe" set "PATH=%GO_ROOT%\bin;%PATH%"

REM --- Build if binary missing ---
set "APP_DIR=D:\NeuroDesk\NeuroDesk"
set "BIN=%APP_DIR%\neurodesk.exe"
if not exist "%BIN%" (
    echo Building NeuroDesk... this may take a few minutes on first run.
    pushd "%APP_DIR%"
    set "GOPROXY=https://proxy.golang.org,direct"
    set "GOTOOLCHAIN=local"
    set "GONOSUMCHECK=*"
    set "GONOSUMDB=*"
    go build -ldflags "-s -w -X github.com/mudler/NeuroDesk/internal.Version=dev -X github.com/mudler/NeuroDesk/internal.Commit=custom" -o "%BIN%" ./cmd/neurodesk
    popd
    if not exist "%BIN%" (
        echo Build failed. Check the output above.
        pause
        exit /b 1
    )
)

REM --- Start server ---
echo Starting NeuroDesk at http://localhost:8080
echo Press Ctrl+C in this window to stop.
start "" http://localhost:8080
"%BIN%" --address 0.0.0.0:8080