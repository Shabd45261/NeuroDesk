@echo off
setlocal
title NeuroDesk App
cd /d "D:\NeuroDesk\NeuroDeskApp"
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is required. Install it from https://nodejs.org
    pause
    exit /b 1
)
start "" node_modules\.bin\electron.cmd .