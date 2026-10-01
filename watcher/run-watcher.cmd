@echo off
REM Starts the olympus-verify watcher from its own folder, so the relative paths in config.json
REM (state_file) resolve correctly no matter where this is launched from. Output stays on the
REM console so you can see it working; minimise the window rather than closing it.
REM
REM For Task Scheduler ("at log on"), point the task at this file and add a redirect on the last
REM line instead:  python watcher.py --config config.json >> watcher.log 2>&1
cd /d "%~dp0"
title Olympus watcher - leave running
python watcher.py --config config.json
echo.
echo *** The watcher has stopped. Press a key to restart it, or close this window. ***
pause >nul
REM Re-run this file from the top (a fresh copy, so edits made while it was running take effect).
"%~f0"
