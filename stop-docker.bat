@echo off
title Catering Management System - Stop
color 0E

echo ============================================================
echo    CATERING MANAGEMENT SYSTEM - Stopping...
echo ============================================================
echo.

cd /d "%~dp0"

echo [INFO] Stopping all containers...
docker-compose down

echo.
echo [OK] All containers stopped.
echo.

pause
