Write-Host "🔄 Starting Full Data Reset..." -ForegroundColor Yellow

# 1. Flush Redis
Write-Host "🧹 Flushing Redis Cache..." -ForegroundColor Cyan
docker exec catering-redis redis-cli FLUSHALL
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Redis Cache Flushed" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to flush Redis" -ForegroundColor Red
}

# 2. Reset Database
Write-Host "🧹 Resetting Database..." -ForegroundColor Cyan
docker exec catering-backend npx prisma db push --accept-data-loss
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database Reset" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to reset Database" -ForegroundColor Red
    exit 1
}

# 3. Seed Database
Write-Host "🌱 Seeding Database..." -ForegroundColor Cyan
docker exec catering-backend npx prisma db seed
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database Seeded" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to seed Database" -ForegroundColor Red
}

# 4. Restart Backend (Optional, but good to clear in-memory states)
Write-Host "🔄 Restarting Backend..." -ForegroundColor Cyan
docker-compose restart backend
Write-Host "✅ Backend Restarted" -ForegroundColor Green

Write-Host "✨ ALL DONE! System is fresh and ready." -ForegroundColor Green
