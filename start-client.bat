@echo off
title SPIC Client (React + Vite)
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
cd /d "%~dp0client"
npm run dev
pause
