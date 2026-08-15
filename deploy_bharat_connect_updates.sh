#!/bin/bash
set -e

echo "═══════════════════════════════════════════════════════════════"
echo " BHARAT CONNECT UAT DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Pulling latest changes...${NC}"
git pull origin main

echo -e "${BLUE}Step 2: Verifying brand assets in dist...${NC}"
if [ ! -f "utility-frontend/dist/brand/sonic-branding.mp3" ]; then
    echo -e "${RED}✗ Sonic branding missing! Copying from public/...${NC}"
    cp utility-frontend/public/brand/* utility-frontend/dist/brand/
else
    echo -e "${GREEN}✓ Brand assets present${NC}"
fi

echo ""
echo "Brand asset sizes:"
ls -lh utility-frontend/dist/brand/ | grep -E "\.(mp3|png|svg)$"

echo ""
echo -e "${BLUE}Step 3: Building backend...${NC}"
cd backend
go build -o api ./cmd/api
if [ -f "api" ]; then
    echo -e "${GREEN}✓ Backend built successfully${NC}"
    ls -lh api
else
    echo -e "${RED}✗ Backend build failed${NC}"
    exit 1
fi
cd ..

echo ""
echo -e "${BLUE}Step 4: Docker deployment...${NC}"
echo "Choose deployment method:"
echo "  1) Restart only (quick, preserves containers)"
echo "  2) Full rebuild (slow, fresh build)"
read -p "Enter choice [1]: " choice
choice=${choice:-1}

if [ "$choice" == "2" ]; then
    echo "Full rebuild..."
    docker-compose down
    docker-compose build frontend backend
    docker-compose up -d
else
    echo "Quick restart..."
    docker-compose restart frontend backend
fi

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} DEPLOYMENT COMPLETE${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

echo "Next steps:"
echo "1. Verify assets are accessible:"
echo "   curl -I https://utilipayhub.com/app/brand/sonic-branding.mp3"
echo ""
echo "2. Test frontend (see FRONTEND_TESTING_GUIDE.md):"
echo "   - Homepage: https://utilipayhub.com/app/"
echo "   - Payment success screen (audio should play)"
echo "   - All 7 compliance screens"
echo ""
echo "3. Enable UAT logging (backend/.env):"
echo "   BC_UAT_LOGGING=true"
echo "   Then restart: docker-compose restart backend"
echo ""
echo "4. Run UAT tests and collect logs:"
echo "   docker-compose logs backend | grep 'bharatconnect_uat' > uat_logs.txt"
echo ""
