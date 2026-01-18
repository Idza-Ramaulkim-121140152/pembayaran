#!/bin/bash

# ============================================
# Production Deployment Script
# Rumah Kita Net - ISP Billing System
# ============================================

set -e # Exit on error

echo "🚀 Starting Production Deployment..."
echo "===================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo -e "${RED}❌ Please do not run as root${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

# Check APP_ENV
APP_ENV=$(grep "^APP_ENV=" .env | cut -d '=' -f2)
if [ "$APP_ENV" != "production" ]; then
    echo -e "${YELLOW}⚠️  Warning: APP_ENV is not set to 'production'${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check APP_DEBUG
APP_DEBUG=$(grep "^APP_DEBUG=" .env | cut -d '=' -f2)
if [ "$APP_DEBUG" == "true" ]; then
    echo -e "${RED}❌ APP_DEBUG is still true! Must be false in production.${NC}"
    exit 1
fi

echo ""
echo "📦 Step 1: Installing dependencies..."
composer install --optimize-autoloader --no-dev --no-interaction
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo "🔑 Step 2: Generating application key (if needed)..."
php artisan key:generate --force
echo -e "${GREEN}✓ Application key generated${NC}"

echo ""
echo "🗄️  Step 3: Running migrations..."
php artisan migrate --force
echo -e "${GREEN}✓ Migrations completed${NC}"

echo ""
echo "🔗 Step 4: Creating storage link..."
php artisan storage:link
echo -e "${GREEN}✓ Storage linked${NC}"

echo ""
echo "🧹 Step 5: Clearing old cache..."
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear
echo -e "${GREEN}✓ Cache cleared${NC}"

echo ""
echo "⚡ Step 6: Optimizing for production..."
php artisan config:cache
php artisan route:cache
php artisan view:cache
composer dump-autoload --optimize
echo -e "${GREEN}✓ Optimization completed${NC}"

echo ""
echo "🔒 Step 7: Setting file permissions..."
chmod -R 775 storage bootstrap/cache
chmod 600 .env
if [ -f storage/app/google-sheets-credentials.json ]; then
    chmod 600 storage/app/google-sheets-credentials.json
fi
echo -e "${GREEN}✓ Permissions set${NC}"

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Post-deployment checklist:"
echo "  1. Verify .env configuration"
echo "  2. Test admin login"
echo "  3. Test MikroTik connection"
echo "  4. Check logs: tail -f storage/logs/laravel.log"
echo "  5. Setup queue worker (supervisor)"
echo "  6. Setup cron job for scheduler"
echo "  7. Configure web server (nginx/apache)"
echo "  8. Setup SSL certificate"
echo "  9. Configure firewall"
echo "  10. Setup automated backups"
echo ""
echo "📖 See PRODUCTION_DEPLOYMENT.md for detailed guide"
echo ""
