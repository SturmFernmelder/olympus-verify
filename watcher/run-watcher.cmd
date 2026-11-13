@echo off
REM Starts the olympus-verify watcher from its own folder, so the relative paths in config.json
REM (state_file) resolve correctly no matter where this is launched from. Output stays on the
REM console so you can see it working; minimise the window rather than closing it.
REM
REM This is an attended console launcher by default. For an already-authorized noninteractive
REM invocation set OLYMPUS_WATCHER_NONINTERACTIVE=1 in that process environment; it exits
REM with Python's status and never pauses or restarts. No scheduled task is installed or changed here.
REM An installed task may use a different launcher; inspect it separately before changing it.
REM Keep state_file in a private local folder outside sync clients such as OneDrive.
REM A released .197 OS lock file stays on disk; do not delete it on restart.
REM The positive launch flag requires native membership without changing private configuration.
REM Pass --wow-dir "C:\path\to\client" for the selected client; preserve those quoted arguments on restart.
cd /d "%~dp0"
title Olympus watcher - leave running
python watcher.py --config config.json --membership-only %*
set "olympus_watcher_exit280=%errorlevel%"
if "%OLYMPUS_WATCHER_NONINTERACTIVE%"=="1" exit /b %olympus_watcher_exit280%
echo.
echo *** The watcher has stopped. Press a key to restart it, or close this window. ***
echo Check any storage error first. Keep the same state and configuration; never delete custody to resume.
pause >nul
REM Re-run this file from the top (a fresh copy, so edits made while it was running take effect).
"%~f0" %*
