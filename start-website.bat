@echo off
title SPIC Website Launcher
echo Starting Backend API and Frontend Client...
start "SPIC Server" cmd /k ""%~dp0start-server.bat""
timeout /t 2 /nobreak >nul
start "SPIC Client" cmd /k ""%~dp0start-client.bat""
echo Both servers have been launched!
echo Access the site at: http://localhost:5173
pause
