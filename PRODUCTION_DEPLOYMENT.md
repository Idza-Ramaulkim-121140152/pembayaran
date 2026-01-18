# Production Deployment Guide - Rumah Kita Net

## 🚀 Pre-Deployment Checklist

### 1. Environment Configuration

Pastikan file `.env` sudah dikonfigurasi dengan benar untuk production:

```bash
# Application
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com

# Database
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=pembayaran_db
DB_USERNAME=your_db_user
DB_PASSWORD=your_secure_password

# MikroTik Router (PENTING: Credentials yang aman!)
MIKROTIK_HOST=103.195.65.216
MIKROTIK_USER=admin
MIKROTIK_PASSWORD=your_secure_mikrotik_password
MIKROTIK_PORT=8728
MIKROTIK_TIMEOUT=5
MIKROTIK_CONNECTION_LIFETIME=3600

# Google Sheets (Optional - untuk customer verification)
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_ID=your_spreadsheet_id
GOOGLE_SHEETS_RANGE='Form Responses 1'!A:Z
GOOGLE_SHEETS_SKIP_ROWS=24
GOOGLE_SHEETS_CREDENTIALS_PATH=/path/to/google-credentials.json
GOOGLE_FORM_URL=https://forms.gle/your_form_id

# Session & Cache
SESSION_DRIVER=database
CACHE_STORE=database

# Queue (untuk background jobs)
QUEUE_CONNECTION=database
```

### 2. Security Hardening

#### ✅ Menggunakan `config()` bukan `env()`
**PENTING**: Semua penggunaan `env()` sudah dipindahkan ke config files:
- ✅ `config/mikrotik.php` - MikroTik configuration
- ✅ `config/google.php` - Google Sheets configuration
- ✅ `config/database.php` - Database configuration
- ✅ `config/app.php` - Application settings

**Keuntungan**:
- Config cache akan bekerja optimal (`php artisan config:cache`)
- Performa lebih cepat (tidak perlu parsing .env setiap request)
- Keamanan lebih baik (env values tidak exposed di runtime)

#### ✅ File Permissions
```bash
# Direktori writable
chmod -R 775 storage
chmod -R 775 bootstrap/cache

# Owner yang benar
chown -R www-data:www-data storage
chown -R www-data:www-data bootstrap/cache
```

#### ✅ Sensitive Files Protection
```bash
# .env harus private
chmod 600 .env

# Google credentials harus private
chmod 600 storage/app/google-sheets-credentials.json
```

### 3. Optimization Commands

Jalankan commands berikut untuk optimasi production:

```bash
# 1. Install dependencies (production only)
composer install --optimize-autoloader --no-dev

# 2. Cache configuration
php artisan config:cache

# 3. Cache routes
php artisan route:cache

# 4. Cache views
php artisan view:cache

# 5. Optimize autoloader
composer dump-autoload --optimize

# 6. Run migrations (jika belum)
php artisan migrate --force

# 7. Link storage
php artisan storage:link
```

### 4. Web Server Configuration

#### Nginx Configuration
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    root /var/www/pembayaran/public;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    index index.php;

    charset utf-8;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { access_log off; log_not_found off; }

    error_page 404 /index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        include fastcgi_params;
        fastcgi_hide_header X-Powered-By;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
```

#### Apache Configuration (.htaccess sudah ada di public/)
Pastikan mod_rewrite enabled:
```bash
sudo a2enmod rewrite
sudo systemctl restart apache2
```

### 5. SSL Certificate (HTTPS)

Gunakan Let's Encrypt untuk SSL gratis:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal (cron sudah otomatis)
sudo certbot renew --dry-run
```

Update `.env`:
```bash
APP_URL=https://your-domain.com
SESSION_SECURE_COOKIE=true
```

### 6. Database Optimization

```sql
-- Index yang sudah ada di migrations, pastikan semua running
-- Cek dengan:
SHOW INDEX FROM customers;
SHOW INDEX FROM invoices;
SHOW INDEX FROM odps;

-- Optimize tables secara berkala
OPTIMIZE TABLE customers, invoices, odps, network_notices;
```

### 7. Queue Worker (Background Jobs)

Setup supervisor untuk queue worker:

```bash
sudo nano /etc/supervisor/conf.d/laravel-worker.conf
```

Isi:
```ini
[program:laravel-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/pembayaran/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/www/pembayaran/storage/logs/worker.log
stopwaitsecs=3600
```

Reload supervisor:
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start laravel-worker:*
```

### 8. Scheduler (Cron Jobs)

Tambahkan ke crontab:
```bash
sudo crontab -e -u www-data
```

Tambahkan:
```cron
* * * * * cd /var/www/pembayaran && php artisan schedule:run >> /dev/null 2>&1
```

### 9. Monitoring & Logging

#### Log Rotation
```bash
sudo nano /etc/logrotate.d/laravel
```

Isi:
```
/var/www/pembayaran/storage/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 www-data www-data
    sharedscripts
}
```

#### Monitoring Tools
- **Laravel Telescope** (development only, disable di production)
- **Laravel Horizon** (untuk queue monitoring)
- **New Relic** atau **Sentry** untuk error tracking

### 10. Backup Strategy

#### Database Backup Script
```bash
#!/bin/bash
# /var/www/pembayaran/scripts/backup-db.sh

BACKUP_DIR="/var/backups/pembayaran"
DB_NAME="pembayaran_db"
DB_USER="your_db_user"
DB_PASS="your_db_password"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

mysqldump -u$DB_USER -p$DB_PASS $DB_NAME | gzip > $BACKUP_DIR/db_backup_$DATE.sql.gz

# Keep only 7 days of backups
find $BACKUP_DIR -name "db_backup_*.sql.gz" -mtime +7 -delete
```

Tambahkan ke cron:
```cron
0 2 * * * /var/www/pembayaran/scripts/backup-db.sh
```

#### File Backup
```bash
# Backup storage directory
rsync -avz /var/www/pembayaran/storage/app/public/ /var/backups/pembayaran/files/
```

### 11. Security Headers

Tambahkan di `.env`:
```bash
# Additional security
SESSION_LIFETIME=120
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

### 12. Performance Testing

Sebelum go-live, test performa:

```bash
# Install Apache Bench
sudo apt install apache2-utils

# Load testing
ab -n 1000 -c 10 https://your-domain.com/

# Check response time
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com/
```

### 13. Post-Deployment Verification

- ✅ Test login admin
- ✅ Test customer creation
- ✅ Test invoice generation
- ✅ Test payment confirmation
- ✅ Test MikroTik integration (isolate/restore user)
- ✅ Test Google Sheets sync (jika enabled)
- ✅ Test WhatsApp notifications (jika enabled)
- ✅ Test monitoring maps
- ✅ Check all logs: `tail -f storage/logs/laravel.log`

### 14. Rollback Plan

Jika ada masalah, rollback dengan:

```bash
# 1. Restore database backup
gunzip < /var/backups/pembayaran/db_backup_YYYYMMDD.sql.gz | mysql -u user -p pembayaran_db

# 2. Restore code
cd /var/www/pembayaran
git checkout previous-working-tag

# 3. Clear cache
php artisan cache:clear
php artisan config:clear
php artisan route:clear
php artisan view:clear

# 4. Re-optimize
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

## 🔐 Security Checklist

- ✅ `APP_DEBUG=false` di production
- ✅ `APP_ENV=production`
- ✅ Strong password untuk database
- ✅ Strong password untuk MikroTik
- ✅ HTTPS enabled dengan valid SSL
- ✅ `.env` file permissions 600
- ✅ Google credentials file secured
- ✅ Firewall configured (hanya port 80, 443, 22)
- ✅ Fail2ban installed untuk brute force protection
- ✅ Regular security updates (`apt update && apt upgrade`)
- ✅ Backup automated
- ✅ Error logging configured
- ✅ Rate limiting enabled di routes
- ✅ CSRF protection active
- ✅ XSS protection enabled
- ✅ SQL injection prevention (Eloquent ORM)

## 📊 Maintenance Tasks

### Daily
- Monitor logs: `tail -f storage/logs/laravel.log`
- Check queue worker status: `supervisorctl status`
- Check disk space: `df -h`

### Weekly
- Review error logs
- Check database size
- Verify backups

### Monthly
- Update dependencies: `composer update`
- Security audit
- Performance review
- Database optimization

## 🆘 Emergency Contacts

- **Developer**: [Your Contact]
- **System Admin**: [Admin Contact]
- **MikroTik Support**: [ISP Contact]

## 📝 Notes

- Sistem menggunakan persistent connection pooling untuk MikroTik (1 jam lifetime)
- Customer dengan profile "isolir" akan otomatis di-restore saat pembayaran dikonfirmasi
- Tanggal jatuh tempo: konfirmasi + 31 hari untuk pelanggan isolir
- Google Sheets sync bersifat optional, bisa dinonaktifkan via `GOOGLE_SHEETS_ENABLED=false`
