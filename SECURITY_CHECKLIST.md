# Security Configuration Checklist

## ✅ Configuration Security (COMPLETED)

### 1. Environment Variables to Config Migration
**Status**: ✅ **COMPLETED**

All `env()` calls moved from application code to config files:

#### MikroTik Configuration
- **File**: `config/mikrotik.php`
- **Variables**:
  - `MIKROTIK_HOST` → `config('mikrotik.host')`
  - `MIKROTIK_USER` → `config('mikrotik.user')`
  - `MIKROTIK_PASSWORD` → `config('mikrotik.password')`
  - `MIKROTIK_PORT` → `config('mikrotik.port')`
  - `MIKROTIK_TIMEOUT` → `config('mikrotik.timeout')`
  - `MIKROTIK_CONNECTION_LIFETIME` → `config('mikrotik.connection_lifetime')`

#### Google Sheets Configuration
- **File**: `config/google.php`
- **Variables**:
  - `GOOGLE_SHEETS_ENABLED` → `config('google.enabled')`
  - `GOOGLE_SHEETS_ID` → `config('google.spreadsheet_id')`
  - `GOOGLE_SHEETS_RANGE` → `config('google.range')`
  - `GOOGLE_SHEETS_SKIP_ROWS` → `config('google.skip_rows')`
  - `GOOGLE_SHEETS_CREDENTIALS_PATH` → `config('google.credentials_path')`
  - `GOOGLE_FORM_URL` → `config('google.form_url')`

#### Updated Files
1. ✅ `app/Services/MikroTikService.php` - Uses `config('mikrotik.*)`
2. ✅ `app/Services/GoogleSheetsService.php` - Uses `config('google.*)`
3. ✅ `app/Http/Controllers/CustomerVerificationController.php` - Uses `config('google.form_url')`

### 2. Benefits of Using config() over env()

#### Performance
- ✅ Config caching works (`php artisan config:cache`)
- ✅ No need to parse .env file on every request
- ✅ Faster application bootstrap
- ✅ Reduced I/O operations

#### Security
- ✅ Environment variables not exposed at runtime
- ✅ Config cache stored in optimized PHP arrays
- ✅ Sensitive data centralized in config files
- ✅ Easier to audit configuration usage

#### Maintainability
- ✅ Centralized configuration management
- ✅ Type hinting and IDE support
- ✅ Easy to document and validate
- ✅ Clear separation of concerns

## 📋 Production Deployment Checklist

### Before Deployment

- [ ] Review `.env.production` template
- [ ] Update all credentials with secure values
- [ ] Set `APP_ENV=production`
- [ ] Set `APP_DEBUG=false`
- [ ] Generate strong `APP_KEY`
- [ ] Configure database credentials
- [ ] Set secure MikroTik password
- [ ] Configure Google Sheets (if used)
- [ ] Set proper `APP_URL` (with HTTPS)

### During Deployment

- [ ] Run `composer install --no-dev --optimize-autoloader`
- [ ] Run `php artisan migrate --force`
- [ ] Run `php artisan config:cache`
- [ ] Run `php artisan route:cache`
- [ ] Run `php artisan view:cache`
- [ ] Run `php artisan storage:link`
- [ ] Set file permissions (chmod 600 .env)
- [ ] Set directory permissions (775 storage, bootstrap/cache)

### After Deployment

- [ ] Test admin login
- [ ] Test customer operations
- [ ] Test MikroTik connection
- [ ] Test payment confirmation
- [ ] Test isolation/restoration flow
- [ ] Verify SSL certificate
- [ ] Check error logs
- [ ] Setup monitoring
- [ ] Configure backups
- [ ] Setup queue workers
- [ ] Setup cron jobs

## 🔒 Additional Security Measures

### Web Server Security

#### Nginx
```nginx
# Hide PHP version
fastcgi_hide_header X-Powered-By;

# Security headers
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
add_header X-XSS-Protection "1; mode=block";
add_header Referrer-Policy "strict-origin-when-cross-origin";

# Deny access to hidden files
location ~ /\.(?!well-known).* {
    deny all;
}
```

#### Apache
```apache
# In .htaccess or virtual host config
Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-Content-Type-Options "nosniff"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
```

### Database Security

- [ ] Create dedicated database user (not root)
- [ ] Grant only necessary privileges
- [ ] Use strong password (min 20 characters)
- [ ] Bind MySQL to localhost only (if not remote)
- [ ] Enable MySQL slow query log
- [ ] Regular database backups

```sql
-- Create dedicated user
CREATE USER 'pembayaran_user'@'localhost' IDENTIFIED BY 'strong_password_here';
GRANT SELECT, INSERT, UPDATE, DELETE ON pembayaran_db.* TO 'pembayaran_user'@'localhost';
FLUSH PRIVILEGES;
```

### File System Security

```bash
# Secure .env file
chmod 600 .env
chown www-data:www-data .env

# Secure Google credentials
chmod 600 storage/app/google-sheets-credentials.json
chown www-data:www-data storage/app/google-sheets-credentials.json

# Writable directories
chmod -R 775 storage bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache

# Prevent execution in storage
# Add to storage/.htaccess
<FilesMatch "\.ph(p[3-8]?|tml|ar)$">
    Require all denied
</FilesMatch>
```

### Network Security

- [ ] Configure firewall (ufw/iptables)
- [ ] Open only necessary ports (22, 80, 443)
- [ ] Install fail2ban for SSH protection
- [ ] Use SSH keys instead of passwords
- [ ] Disable root SSH login
- [ ] Change default SSH port (optional)

```bash
# UFW firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Application Security

- [ ] Enable rate limiting on routes
- [ ] Implement CSRF protection (already enabled)
- [ ] Sanitize user inputs (already done via validation)
- [ ] Use prepared statements (Eloquent ORM)
- [ ] Implement proper authentication
- [ ] Use HTTPS only in production
- [ ] Regular dependency updates

### MikroTik Security

- [ ] Use strong password (min 12 characters, mixed case + numbers + symbols)
- [ ] Restrict API access by IP (firewall rule)
- [ ] Use non-standard API port (change from 8728)
- [ ] Enable API-SSL if possible
- [ ] Regular MikroTik firmware updates
- [ ] Monitor API access logs

```
# MikroTik: Restrict API access by IP
/ip firewall filter
add chain=input protocol=tcp dst-port=8728 src-address=YOUR_SERVER_IP action=accept
add chain=input protocol=tcp dst-port=8728 action=drop
```

## 📊 Monitoring & Alerts

### Log Monitoring

```bash
# Monitor Laravel logs
tail -f /var/www/pembayaran/storage/logs/laravel.log

# Monitor nginx access
tail -f /var/log/nginx/access.log

# Monitor nginx errors
tail -f /var/log/nginx/error.log
```

### Automated Monitoring

Consider implementing:
- [ ] **New Relic** - Application performance monitoring
- [ ] **Sentry** - Error tracking and reporting
- [ ] **Uptime Robot** - Uptime monitoring
- [ ] **Prometheus + Grafana** - System metrics
- [ ] **Laravel Telescope** (dev only) - Request monitoring

### Health Check Endpoint

Create a health check endpoint:

```php
// routes/web.php
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'timestamp' => now(),
        'database' => DB::connection()->getPdo() ? 'connected' : 'disconnected',
    ]);
});
```

## 🔄 Update & Maintenance

### Regular Updates

```bash
# Weekly
composer update --with-dependencies
npm update

# Monthly
php artisan optimize:clear
composer dump-autoload
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Check for security advisories
composer audit
npm audit
```

### Backup Verification

- [ ] Test database restore monthly
- [ ] Verify file backups
- [ ] Test disaster recovery plan
- [ ] Document recovery procedures

## 📞 Emergency Response

### In Case of Security Breach

1. **Immediately**:
   - Take application offline (maintenance mode)
   - Disconnect affected servers from network
   - Preserve logs and evidence

2. **Assess**:
   - Identify breach scope
   - Check logs for unauthorized access
   - Review database for data exfiltration

3. **Contain**:
   - Change all passwords (database, MikroTik, admin)
   - Revoke API tokens
   - Update .env with new credentials

4. **Recover**:
   - Restore from clean backup
   - Patch vulnerabilities
   - Update all dependencies
   - Run security audit

5. **Post-Incident**:
   - Document incident
   - Improve security measures
   - Notify affected parties (if required)
   - Implement additional monitoring

## ✅ Security Audit Completed

**Date**: 2026-01-18
**Status**: ✅ Ready for Production

All `env()` calls have been migrated to `config()` for enhanced security and performance.

### Summary of Changes:

1. ✅ Created `config/mikrotik.php`
2. ✅ Created `config/google.php`
3. ✅ Updated `MikroTikService.php` to use config()
4. ✅ Updated `GoogleSheetsService.php` to use config()
5. ✅ Updated `CustomerVerificationController.php` to use config()
6. ✅ Created deployment scripts (deploy.sh, deploy.bat)
7. ✅ Created production documentation (PRODUCTION_DEPLOYMENT.md)
8. ✅ Created .env.production template
9. ✅ Created security checklist (this file)

### Next Steps:

1. Review `.env.production` and update with actual values
2. Run deployment script on production server
3. Follow PRODUCTION_DEPLOYMENT.md guide
4. Complete post-deployment checklist
5. Setup monitoring and backups
6. Regular security audits
