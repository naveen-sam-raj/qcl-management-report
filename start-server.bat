@echo off
title SPIC Backend API (Node + Express)
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0server"
node server.js
pause
