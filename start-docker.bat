@echo off
title Catering Management System - Docker Startup
color 0A

echo ============================================================
echo    CATERING MANAGEMENT SYSTEM - Docker Startup Script
echo ============================================================
echo.

:: Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    color 0C
    echo [ERROR] Docker is not running!
    echo.
    echo Please start Docker Desktop first, then run this script again.
    echo.
    pause
    exit /b 1
)

echo [OK] Docker is running
echo.

:: Navigate to project directory
cd /d "%~dp0"
echo [INFO] Working directory: %cd%
echo.

:: Check if docker-compose.yml exists
if not exist "docker-compose.yml" (
    color 0C
    echo [ERROR] docker-compose.yml not found!
    echo.
    echo Make sure this script is in the project root directory.
    pause
    exit /b 1
)

echo ============================================================
echo    Starting Catering Management System...
echo ============================================================
echo.

:: Stop any existing containers
echo [STEP 1/6] Stopping existing containers...
docker-compose down 2>nul
echo.

:: Build and start containers
echo [STEP 2/6] Building Docker images (this may take a few minutes)...
docker-compose build --no-cache

if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Build failed! Check the error messages above.
    pause
    exit /b 1
)

echo.
echo [STEP 3/6] Starting database container...
docker-compose up -d db

if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Failed to start database container!
    pause
    exit /b 1
)

echo.
echo [STEP 4/6] Waiting for database to be ready...
timeout /t 10 /nobreak >nul

:: Initialize database schema and seed
echo.
echo [STEP 5/6] Initializing database schema and seed data...
docker-compose run --rm backend sh -c "npx prisma db push --force-reset && npx prisma db seed"

if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Database initialization failed!
    pause
    exit /b 1
)

echo.
echo [STEP 6/6] Starting all containers...
docker-compose up -d

if errorlevel 1 (
    color 0C
    echo.
    echo [ERROR] Failed to start containers!
    pause
    exit /b 1
)

echo.
echo Waiting for services to be ready...
timeout /t 8 /nobreak >nul

:: Show container status
echo.
echo ============================================================
echo    Container Status
echo ============================================================
docker-compose ps
echo.

:: Show logs briefly
echo ============================================================
echo    Recent Logs (last 20 lines)
echo ============================================================
docker-compose logs --tail=20
echo.

echo ============================================================
color 0A
echo.
echo    [SUCCESS] Catering Management System is running!
echo.
echo    Access the application:
echo    -------------------------------------------------------
echo    Frontend:     http://localhost:3011
echo    Backend API:  http://localhost:3012
echo    Database:     localhost:3013
echo    -------------------------------------------------------
echo.
echo    Demo Credentials:
echo    -------------------------------------------------------
echo    Admin:    ADMIN001 / admin123
echo    Canteen:  CANTEEN001 / admin123
echo    User:     EMP001 / admin123
echo    -------------------------------------------------------
echo.
echo    Admin Features:
echo    -------------------------------------------------------
echo    - Time Settings:  /admin/time-settings (NTP sync)
echo    - Audit Log:      /admin/audit-log (activity tracking)
echo    - Blacklist:      /admin/blacklist (password confirmed)
echo    -------------------------------------------------------
echo.
echo    Commands:
echo    -------------------------------------------------------
echo    View logs:     docker-compose logs -f
echo    Stop system:   docker-compose down
echo    Restart:       docker-compose restart
echo    -------------------------------------------------------
echo.
echo ============================================================
echo.

:: Ask if user wants to see live logs
set /p viewlogs="Do you want to view live logs? (Y/N): "
if /i "%viewlogs%"=="Y" (
    echo.
    echo Showing live logs... (Press Ctrl+C to stop)
    echo.
    docker-compose logs -f
)

pause
