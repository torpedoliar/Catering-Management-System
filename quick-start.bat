@echo off
title Catering Management System - Quick Start
color 0A

cd /d "%~dp0"

echo ============================================================
echo    CATERING MANAGEMENT SYSTEM - Quick Start
echo    (Use start-docker.bat for full reset with seed data)
echo ============================================================
echo.

echo Starting containers...
docker-compose up -d

echo.
echo Waiting for services to be ready...
timeout /t 5 /nobreak >nul

echo.
echo ============================================================
echo    System Started!
echo    -------------------------------------------------------
echo    Frontend:  http://localhost:3011
echo    Backend:   http://localhost:3012
echo    -------------------------------------------------------
echo    Admin Features:
echo    - Time Settings:  /admin/time-settings
echo    - Audit Log:      /admin/audit-log
echo    - Blacklist:      /admin/blacklist
echo ============================================================
echo.

timeout /t 2 >nul
start http://localhost:3011

pause
