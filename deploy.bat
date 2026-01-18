@echo off
REM ============================================
REM Production Deployment Script for Windows
REM Rumah Kita Net - ISP Billing System
REM ============================================

echo.
echo ============================================
echo   Production Deployment
echo   Rumah Kita Net - ISP Billing System
echo ============================================
echo.

REM Check if .env exists
if not exist .env (
    echo [ERROR] .env file not found!
    echo Please copy .env.example to .env and configure it.
    pause
    exit /b 1
)

REM Check APP_DEBUG
findstr /C:"APP_DEBUG=true" .env >nul
if %errorlevel% equ 0 (
    echo [ERROR] APP_DEBUG is still true! Must be false in production.
    pause
    exit /b 1
)

echo [1/7] Installing dependencies...
call composer install --optimize-autoloader --no-dev --no-interaction
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [2/7] Generating application key...
php artisan key:generate --force

echo.
echo [3/7] Running migrations...
php artisan migrate --force
if %errorlevel% neq 0 (
    echo [ERROR] Migration failed
    pause
    exit /b 1
)

echo.
echo [4/7] Creating storage link...
php artisan storage:link

echo.
echo [5/7] Clearing old cache...
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear

echo.
echo [6/7] Optimizing for production...
php artisan config:cache
php artisan route:cache
php artisan view:cache
call composer dump-autoload --optimize

echo.
echo [7/7] Deployment completed!
echo.
echo ============================================
echo   Post-deployment Checklist
echo ============================================
echo   1. Verify .env configuration
echo   2. Test admin login
echo   3. Test MikroTik connection
echo   4. Check logs in storage/logs/
echo   5. Configure web server
echo   6. Setup SSL certificate
echo   7. Setup automated backups
echo.
echo See PRODUCTION_DEPLOYMENT.md for detailed guide
echo.

pause
