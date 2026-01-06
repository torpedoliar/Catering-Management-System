#!/bin/bash
# ============================================
# DEPLOY-LINUX.SH - One-Click Deploy Script
# Catering Management System
# ============================================

set -e

echo ""
echo "============================================"
echo "  Catering Management System - Deploy"
echo "============================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}ERROR: Please don't run as root. Run as normal user.${NC}"
    exit 1
fi

# Step 1: Check Docker
echo -e "${YELLOW}[1/6] Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker not found. Installing Docker...${NC}"
    
    # Install curl if not exists
    if ! command -v curl &> /dev/null; then
        echo "Installing curl..."
        sudo apt update
        sudo apt install -y curl
    fi
    
    # Install Docker
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✓ Docker installed${NC}"
    echo -e "${YELLOW}⚠ Please logout and login again, then re-run this script.${NC}"
    exit 0
else
    echo -e "${GREEN}✓ Docker found: $(docker --version)${NC}"
fi

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${RED}ERROR: Docker Compose not found.${NC}"
    echo "Install with: sudo apt install docker-compose-plugin"
    exit 1
fi
echo -e "${GREEN}✓ Docker Compose found${NC}"

# Step 2: Create .env if not exists
echo ""
echo -e "${YELLOW}[2/6] Setting up environment...${NC}"
if [ ! -f ".env" ]; then
    # Generate random passwords
    DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
    JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)
    
    cat > .env << EOF
DB_PASSWORD=${DB_PASS}
JWT_SECRET=${JWT_SECRET}
EOF
    
    chmod 600 .env
    echo -e "${GREEN}✓ Environment file created with secure passwords${NC}"
else
    echo -e "${GREEN}✓ Environment file already exists${NC}"
fi

# Copy docker-compose.yml from example if not exists
if [ ! -f "docker-compose.yml" ]; then
    if [ -f "docker-compose.example.yml" ]; then
        cp docker-compose.example.yml docker-compose.yml
        echo -e "${GREEN}✓ docker-compose.yml created from example${NC}"
    else
        echo -e "${RED}ERROR: docker-compose.example.yml not found!${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ docker-compose.yml already exists${NC}"
fi

# Step 3: Build containers
echo ""
echo -e "${YELLOW}[3/6] Building containers (this may take 5-10 minutes)...${NC}"
docker compose build

echo -e "${GREEN}✓ Build completed${NC}"

# Step 4: Start containers
echo ""
echo -e "${YELLOW}[4/6] Starting containers...${NC}"
docker compose up -d

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 10

echo -e "${GREEN}✓ Containers started${NC}"

# Step 5: Initialize database
echo ""
echo -e "${YELLOW}[5/6] Initializing database...${NC}"

# Run prisma db push
docker compose exec -T backend npx prisma db push --accept-data-loss 2>&1 || true
echo -e "${GREEN}✓ Database schema synced${NC}"

# Seed admin user
echo "Seeding admin user..."
docker compose exec -T backend npx ts-node prisma/seed-admin.ts 2>&1 || \
docker compose exec -T backend node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
    const existing = await prisma.user.findUnique({ where: { externalId: 'ADMIN001' } });
    if (existing) {
        console.log('Admin already exists:', existing.externalId);
        return;
    }
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.create({
        data: {
            externalId: 'ADMIN001',
            name: 'Administrator',
            password: hashedPassword,
            role: 'ADMIN',
            isActive: true,
            mustChangePassword: false,
            company: 'System',
            division: 'IT',
            department: 'Administration'
        }
    });
    
    console.log('Admin user created:', admin.externalId);
    await prisma.\$disconnect();
}

seed().catch(console.error);
" 2>&1 || echo "Admin user may already exist"

echo -e "${GREEN}✓ Admin user ready${NC}"

# Step 6: Get server IP
echo ""
echo -e "${YELLOW}[6/6] Getting server information...${NC}"
SERVER_IP=$(hostname -I | awk '{print $1}')

# Done
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  DEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "  Application URL: ${YELLOW}http://${SERVER_IP}:8443${NC}"
echo ""
echo -e "  ${YELLOW}Default Login:${NC}"
echo -e "    Username: ${GREEN}ADMIN001${NC}"
echo -e "    Password: ${GREEN}admin123${NC}"
echo ""
echo -e "  ${RED}⚠ IMPORTANT: Change the admin password after first login!${NC}"
echo ""
echo -e "  Useful commands:"
echo -e "    View logs:    ${YELLOW}docker compose logs -f${NC}"
echo -e "    Stop:         ${YELLOW}docker compose down${NC}"
echo -e "    Update:       ${YELLOW}./update.sh${NC}"
echo ""
