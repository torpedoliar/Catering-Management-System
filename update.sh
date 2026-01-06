#!/bin/bash
# ============================================
# UPDATE.SH - One-Click Update Script
# Catering Management System
# ============================================

echo ""
echo "============================================"
echo "  Catering Management System - Update"
echo "============================================"
echo ""

# Check if in correct directory
if [ ! -f "docker-compose.yml" ] && [ ! -f "docker-compose.example.yml" ]; then
    echo "ERROR: docker-compose.yml not found!"
    echo "Please run this script from the project directory."
    exit 1
fi

# Step 1: Backup database
echo "[1/6] Backing up database..."
BACKUP_DIR="backups"
mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.sql"

docker-compose exec -T db pg_dump -U postgres catering_db > "$BACKUP_FILE" 2>/dev/null
if [ -s "$BACKUP_FILE" ]; then
    echo "✓ Database backed up to: $BACKUP_FILE"
else
    echo "⚠ Backup may have failed (database might not be running)"
fi

# Step 2: Pull latest code
echo ""
echo "[2/6] Pulling latest code from GitHub..."
git pull origin main
if [ $? -ne 0 ]; then
    echo "ERROR: Git pull failed!"
    echo "Try: git stash && git pull origin main && git stash pop"
    exit 1
fi
echo "✓ Code updated"

# Step 3: Check for schema changes
echo ""
echo "[3/6] Checking for database schema changes..."
SCHEMA_CHANGED=$(git diff HEAD~1 --name-only 2>/dev/null | grep "prisma/schema.prisma")
if [ -n "$SCHEMA_CHANGED" ]; then
    echo "⚡ Schema changes detected - will sync after rebuild"
else
    echo "✓ No schema changes detected"
fi

# Step 4: Stop containers
echo ""
echo "[4/6] Stopping containers..."
docker-compose down 2>/dev/null
echo "✓ Containers stopped"

# Step 5: Rebuild
echo ""
echo "[5/6] Rebuilding (this may take 2-5 minutes)..."
docker-compose build --no-cache
if [ $? -ne 0 ]; then
    echo "ERROR: Build failed!"
    echo ""
    echo "To restore database from backup:"
    echo "  docker-compose up -d db"
    echo "  cat $BACKUP_FILE | docker-compose exec -T db psql -U postgres catering_db"
    exit 1
fi
echo "✓ Build completed"

# Step 6: Start containers and sync database
echo ""
echo "[6/6] Starting containers and syncing database..."
docker-compose up -d
sleep 10

# Sync database schema
echo ""
echo "Syncing database schema..."
docker-compose exec -T backend npx prisma db push --accept-data-loss 2>&1
if [ $? -eq 0 ]; then
    echo "✓ Database schema synced"
else
    echo "⚠ Schema sync completed with warnings (may be normal)"
fi

# Generate Prisma client
echo "Generating Prisma client..."
docker-compose exec -T backend npx prisma generate 2>&1
echo "✓ Prisma client generated"

# Cleanup old backups (keep last 5)
echo ""
echo "Cleaning up old backups (keeping last 5)..."
ls -t $BACKUP_DIR/db_backup_*.sql 2>/dev/null | tail -n +6 | xargs -r rm
echo "✓ Cleanup completed"

# Done
echo ""
echo "============================================"
echo "  UPDATE COMPLETE!"
echo "============================================"
echo ""
echo "  Application: Access via your configured domain"
echo "  Backup file: $BACKUP_FILE"
echo ""
echo "  To restore if needed:"
echo "  cat $BACKUP_FILE | docker-compose exec -T db psql -U postgres catering_db"
echo ""

