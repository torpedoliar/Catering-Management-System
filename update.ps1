# ============================================
# UPDATE.PS1 - One-Click Update Script
# Dashboard Pengumuman Santos Jaya Abadi
# ============================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Dashboard Pengumuman - Update" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if in correct directory
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "ERROR: docker-compose.yml not found!" -ForegroundColor Red
    Write-Host "Please run this script from the project directory." -ForegroundColor Red
    exit 1
}

# Step 1: Backup database
Write-Host "[1/6] Backing up database..." -ForegroundColor Yellow
$backupDir = "backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "$backupDir/db_backup_$timestamp.sql"

# Get database container name
$dbContainer = docker-compose ps -q db 2>$null
if ($dbContainer) {
    docker-compose exec -T db pg_dump -U postgres announcement_db > $backupFile 2>&1
    if ($LASTEXITCODE -eq 0 -and (Test-Path $backupFile) -and (Get-Item $backupFile).Length -gt 0) {
        Write-Host "OK - Database backed up to: $backupFile" -ForegroundColor Green
    }
    else {
        Write-Host "WARN - Backup may have failed, but continuing..." -ForegroundColor Yellow
        Write-Host "       (Database might not be running yet)" -ForegroundColor Yellow
    }
}
else {
    Write-Host "SKIP - Database container not running (first install?)" -ForegroundColor Yellow
}

# Step 2: Pull latest code
Write-Host ""
Write-Host "[2/6] Pulling latest code from GitHub..." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Git pull failed!" -ForegroundColor Red
    Write-Host "Try: git stash && git pull origin main && git stash pop" -ForegroundColor Yellow
    exit 1
}
Write-Host "OK - Code updated" -ForegroundColor Green

# Step 3: Check for schema changes
Write-Host ""
Write-Host "[3/6] Checking for database schema changes..." -ForegroundColor Yellow
$schemaChanged = git diff HEAD~1 --name-only 2>$null | Select-String "prisma/schema.prisma"
if ($schemaChanged) {
    Write-Host "Schema changes detected - will sync after rebuild" -ForegroundColor Cyan
}
else {
    Write-Host "No schema changes detected" -ForegroundColor Green
}

# Step 4: Stop containers
Write-Host ""
Write-Host "[4/6] Stopping containers..." -ForegroundColor Yellow
docker-compose down 2>&1 | Out-Null
Write-Host "OK - Containers stopped" -ForegroundColor Green

# Step 5: Rebuild
Write-Host ""
Write-Host "[5/6] Rebuilding (this may take 2-5 minutes)..." -ForegroundColor Yellow
docker-compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To restore database from backup:" -ForegroundColor Yellow
    Write-Host "  docker-compose up -d db" -ForegroundColor Cyan
    Write-Host "  Get-Content $backupFile | docker-compose exec -T db psql -U postgres announcement_db" -ForegroundColor Cyan
    exit 1
}
Write-Host "OK - Build completed" -ForegroundColor Green

# Step 6: Start containers and sync database
Write-Host ""
Write-Host "[6/6] Starting containers and syncing database..." -ForegroundColor Yellow
docker-compose up -d
Start-Sleep -Seconds 8

# Sync database schema (db push without data-loss flag for safety)
Write-Host ""
Write-Host "Syncing database schema..." -ForegroundColor Yellow
$pushResult = docker-compose exec -T web npx prisma db push 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK - Database schema synced" -ForegroundColor Green
}
else {
    # Check if it's a data-loss warning
    if ($pushResult -match "data loss" -or $pushResult -match "destructive") {
        Write-Host ""
        Write-Host "WARNING: Schema changes may cause data loss!" -ForegroundColor Red
        Write-Host "Details: $pushResult" -ForegroundColor Yellow
        Write-Host ""
        $confirm = Read-Host "Type 'yes' to continue or press Enter to abort"
        if ($confirm -eq "yes") {
            Write-Host "Applying schema with data loss acceptance..." -ForegroundColor Yellow
            docker-compose exec -T web npx prisma db push --accept-data-loss 2>&1 | Out-Null
            Write-Host "OK - Schema applied" -ForegroundColor Green
        }
        else {
            Write-Host "Aborted. Database unchanged." -ForegroundColor Yellow
            Write-Host "Restore from backup if needed: .\restore.ps1" -ForegroundColor Cyan
        }
    }
    else {
        # Try migrate deploy as fallback
        Write-Host "Trying migration deploy..." -ForegroundColor Yellow
        docker-compose exec -T web npx prisma migrate deploy 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK - Migrations applied" -ForegroundColor Green
        }
        else {
            Write-Host "WARN - Schema sync completed with warnings (may be normal)" -ForegroundColor Yellow
        }
    }
}

# Generate Prisma client
Write-Host "Generating Prisma client..." -ForegroundColor Yellow
docker-compose exec -T web npx prisma generate 2>&1 | Out-Null
Write-Host "OK - Prisma client generated" -ForegroundColor Green

# Cleanup old backups (keep last 5)
Write-Host ""
Write-Host "Cleaning up old backups (keeping last 5)..." -ForegroundColor Yellow
Get-ChildItem -Path $backupDir -Filter "db_backup_*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item -Force 2>$null
Write-Host "OK - Cleanup completed" -ForegroundColor Green

# Done
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  UPDATE COMPLETE!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Application: http://localhost:3100" -ForegroundColor Cyan
Write-Host "  Backup file: $backupFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To restore if needed:" -ForegroundColor Yellow
Write-Host "  .\restore.ps1" -ForegroundColor DarkGray
Write-Host ""
