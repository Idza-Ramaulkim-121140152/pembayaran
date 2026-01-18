# 🔒 LAPORAN AUDIT KEAMANAN - ISP Billing System
**Tanggal Audit:** 17 Januari 2026  
**Auditor:** Security Assessment  
**Versi Aplikasi:** Laravel 12 + React 18

---

## 📋 RINGKASAN EKSEKUTIF

Aplikasi ISP Billing System mengelola **data sensitif pelanggan** (NIK, foto KTP, alamat, nomor telepon) dan **informasi finansial** (tagihan, pembayaran). Audit ini menemukan **6 isu keamanan kritis** yang memerlukan perbaikan segera untuk melindungi data pelanggan dan mematuhi **UU Perlindungan Data Pribadi (UU No. 27 Tahun 2022)**.

### Severity Breakdown:
- 🔴 **CRITICAL:** 2 isu
- 🟠 **HIGH:** 3 isu  
- 🟡 **MEDIUM:** 1 isu
- ✅ **SECURE:** 3 aspek sudah aman

---

## ✅ ASPEK YANG SUDAH AMAN

### 1. Autentikasi & Otorisasi ✓
- **Framework:** Laravel Breeze dengan session-based authentication
- **Route Protection:** Semua endpoint admin dilindungi `middleware('auth')`
- **Session Config:** Session lifetime 120 menit, driver database
- **Password Security:** Bcrypt dengan 12 rounds

**Lokasi:**
- `routes/web.php` - Route protection
- `config/auth.php` - Authentication config
- `config/session.php` - Session settings

### 2. CSRF Protection ✓
- **Token Generation:** Otomatis di semua form
- **React Integration:** Token disertakan di header `X-CSRF-TOKEN`
- **Coverage:** Semua POST/PUT/DELETE requests

**Implementasi:**
```javascript
// resources/js/services/api.js
headers: {
    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
}
```

### 3. File Upload Validation ✓
- **Format:** Hanya menerima file gambar (image mime type)
- **Size Limit:** Maksimal 5MB per file
- **Validation:**
```php
'photo_ktp' => 'nullable|image|max:5120',
'photo_front' => 'nullable|image|max:5120',
```

---

## 🔴 ISU KEAMANAN KRITIS

### 1. KREDENSIAL MIKROTIK HARDCODED 🔴 **[CRITICAL]**

#### 📍 Lokasi
`app/Services/MikroTikService.php:17`

#### ⚠️ Kode Bermasalah
```php
public function __construct(
    $host = '103.195.65.216',  // IP Public terekspos
    $user = 'admin',            // Username default
    $pass = 'rumahkita69',      // PASSWORD DI SOURCE CODE!
    $port = 8728,
    $timeout = 5
)
```

#### 🎯 Risiko
1. **Kontrol Router:** Siapapun yang akses repository (GitHub, backup, developer) bisa remote router
2. **Network Takeover:** Attacker bisa:
   - Isolir semua pelanggan
   - Ubah konfigurasi router
   - Akses data traffic
   - Install backdoor
3. **Compliance:** Melanggar best practice keamanan infrastruktur

#### ✅ Solusi

**Step 1:** Tambahkan ke `.env`
```dotenv
MIKROTIK_HOST=103.195.65.216
MIKROTIK_USER=admin
MIKROTIK_PASS=rumahkita69
MIKROTIK_PORT=8728
MIKROTIK_TIMEOUT=5
```

**Step 2:** Update `MikroTikService.php`
```php
public function __construct(
    $host = null,
    $user = null,
    $pass = null,
    $port = null,
    $timeout = null
) {
    $this->host = $host ?? env('MIKROTIK_HOST');
    $this->user = $user ?? env('MIKROTIK_USER');
    $this->pass = $pass ?? env('MIKROTIK_PASS');
    $this->port = $port ?? env('MIKROTIK_PORT', 8728);
    $this->timeout = $timeout ?? env('MIKROTIK_TIMEOUT', 5);
}
```

**Step 3:** Update `.env.example`
```dotenv
MIKROTIK_HOST=your_router_ip
MIKROTIK_USER=your_username
MIKROTIK_PASS=your_secure_password
MIKROTIK_PORT=8728
MIKROTIK_TIMEOUT=5
```

**Step 4:** Update `.gitignore` (pastikan `.env` tidak ter-commit)
```
.env
.env.backup
```

---

### 2. DATA SENSITIF TIDAK TERENKRIPSI 🔴 **[CRITICAL]**

#### 📍 Lokasi
- `database/migrations/2025_09_19_021840_create_customers_table.php`
- `config/session.php:50`
- `.env:30`

#### ⚠️ Temuan
1. **NIK pelanggan** disimpan **plain text** di kolom `nik` (varchar)
2. **Session tidak terenkripsi:** `SESSION_ENCRYPT=false`
3. **Database connection:** Tidak ada SSL/TLS encryption

#### 🎯 Risiko
1. **Data Breach:** Jika database bocor (SQL injection, backup leaked), semua NIK terekspos
2. **Identity Theft:** NIK bisa digunakan untuk penipuan
3. **Legal:** **MELANGGAR UU PDP No. 27/2022** - denda hingga Rp 6 Miliar
4. **Session Hijacking:** Attacker bisa intercept session cookies

#### ✅ Solusi

**Step 1: Enkripsi NIK di Database**

Create migration untuk encrypt existing data:
```php
// database/migrations/2026_01_17_encrypt_sensitive_data.php
use Illuminate\Support\Facades\Crypt;

public function up()
{
    $customers = DB::table('customers')->whereNotNull('nik')->get();
    
    foreach ($customers as $customer) {
        DB::table('customers')
            ->where('id', $customer->id)
            ->update([
                'nik' => Crypt::encryptString($customer->nik)
            ]);
    }
}
```

**Step 2: Update Model Customer**
```php
// app/Models/Customer.php
use Illuminate\Support\Facades\Crypt;

protected $casts = [
    'nik' => 'encrypted', // Laravel 12 auto-encrypt
];

// Atau manual accessor/mutator:
public function getNikAttribute($value)
{
    return $value ? Crypt::decryptString($value) : null;
}

public function setNikAttribute($value)
{
    $this->attributes['nik'] = $value ? Crypt::encryptString($value) : null;
}
```

**Step 3: Enable Session Encryption**
```dotenv
# .env
SESSION_ENCRYPT=true
SESSION_SECURE_COOKIE=true  # HTTPS only (production)
SESSION_HTTP_ONLY=true
```

**Step 4: Database SSL (Production)**
```dotenv
# .env (production)
DB_SSLMODE=require
DB_SSLCERT=/path/to/client-cert.pem
DB_SSLKEY=/path/to/client-key.pem
DB_SSLROOTCERT=/path/to/server-ca.pem
```

---

## 🟠 ISU KEAMANAN HIGH

### 3. FILE FOTO PUBLICLY ACCESSIBLE 🟠 **[HIGH]**

#### 📍 Lokasi
- `storage/app/public/uploads/customers/`
- URL: `/storage/uploads/customers/photo_ktp_xxx.jpg`

#### ⚠️ Masalah
Foto KTP/identitas pelanggan bisa diakses **tanpa autentikasi** jika orang lain tahu path-nya:
```
https://yourdomain.com/storage/uploads/customers/photo_ktp_12345.jpg
```

#### 🎯 Risiko
1. **Privacy Violation:** Data pribadi (foto KTP) terekspos
2. **Identity Theft:** Foto KTP bisa disalahgunakan
3. **Legal:** Melanggar UU PDP - data pribadi harus dilindungi

#### ✅ Solusi

**Step 1: Pindahkan file ke private storage**
```php
// app/Http/Controllers/CustomerController.php
// Change from:
$validated[$field] = $request->file($field)->store('uploads/customers', 'public');

// To:
$validated[$field] = $request->file($field)->store('uploads/customers', 'local');
```

**Step 2: Buat Controller untuk serve file dengan auth**
```php
// app/Http/Controllers/FileController.php
namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Auth;

class FileController extends Controller
{
    public function serveCustomerPhoto($customerId, $field)
    {
        // Check authentication
        if (!Auth::check()) {
            abort(403, 'Unauthorized');
        }
        
        $customer = \App\Models\Customer::findOrFail($customerId);
        
        // Check authorization (admin or owner)
        if (Auth::user()->role !== 'admin' && Auth::id() !== $customer->user_id) {
            abort(403, 'Forbidden');
        }
        
        $path = $customer->$field;
        
        if (!$path || !Storage::disk('local')->exists($path)) {
            abort(404);
        }
        
        return response()->file(
            Storage::disk('local')->path($path)
        );
    }
}
```

**Step 3: Add protected route**
```php
// routes/web.php
Route::middleware('auth')->group(function () {
    Route::get('/customer-files/{customer}/{field}', [FileController::class, 'serveCustomerPhoto'])
        ->name('customer.file');
});
```

**Step 4: Update views untuk gunakan protected URL**
```jsx
// Sebelum:
<img src={`/storage/${customer.photo_ktp}`} />

// Sesudah:
<img src={`/customer-files/${customer.id}/photo_ktp`} />
```

---

### 4. INVOICE LINK PREDICTABLE 🟠 **[HIGH]**

#### 📍 Lokasi
`app/Http/Controllers/BillingController.php:136`

#### ⚠️ Kode Bermasalah
```php
'invoice_link' => uniqid('inv_'),
// Generates: inv_679a8b4c12345
```

#### 🎯 Risiko
1. **Predictable:** `uniqid()` berdasarkan timestamp + random digits
2. **Enumeration Attack:** Attacker bisa brute force:
   ```
   inv_679a8b4c00001
   inv_679a8b4c00002
   inv_679a8b4c00003
   ```
3. **Data Leak:** Bisa akses invoice & data pelanggan lain

#### ✅ Solusi

**Option 1: Gunakan Secure Random (Recommended)**
```php
use Illuminate\Support\Str;

'invoice_link' => Str::random(32),
// Generates: 4f3c8b7a9e2d1f0c8b7a9e2d1f0c8b7a
```

**Option 2: UUID**
```php
use Illuminate\Support\Str;

'invoice_link' => Str::uuid()->toString(),
// Generates: 550e8400-e29b-41d4-a716-446655440000
```

**Step: Update Migration**
```php
// database/migrations/xxxx_update_invoice_link_length.php
public function up()
{
    Schema::table('invoices', function (Blueprint $table) {
        $table->string('invoice_link', 64)->change();
    });
}
```

---

### 5. TIDAK ADA RATE LIMITING 🟠 **[HIGH]**

#### 📍 Lokasi
Semua API endpoints di `routes/web.php`

#### ⚠️ Temuan
Hanya password reset yang ada throttling:
```php
->middleware(['signed', 'throttle:6,1'])
```

Endpoints lain tidak terlindungi:
- `/api/customers` - Create customer
- `/api/invoice/{link}` - View invoice
- `/invoice/{invoice}/konfirmasi` - Upload payment proof

#### 🎯 Risiko
1. **Brute Force:** Login/API abuse
2. **DDoS:** Request flooding
3. **Resource Exhaustion:** Upload spam files

#### ✅ Solusi

**Step 1: Add rate limiting middleware**
```php
// routes/web.php

// Public endpoints - strict limit
Route::middleware('throttle:10,1')->group(function () {
    Route::get('/api/invoice/{invoice_link}', [BillingController::class, 'showInvoiceApi']);
    Route::post('/invoice/{invoice}/konfirmasi', [BillingController::class, 'confirmPayment']);
});

// Customer login - prevent brute force
Route::middleware('throttle:5,1')->group(function () {
    Route::post('/api/customer/login', [CustomerAuthController::class, 'login']);
});

// Admin API - moderate limit
Route::middleware(['auth', 'throttle:60,1'])->group(function () {
    Route::get('/api/customers', [CustomerController::class, 'list']);
    Route::post('/api/customers', [CustomerController::class, 'store']);
    // ... other admin routes
});

// File uploads - very strict
Route::middleware(['auth', 'throttle:10,1'])->group(function () {
    Route::post('/api/customers', [CustomerController::class, 'store']); // with files
});
```

**Step 2: Custom rate limit messages**
```php
// app/Http/Kernel.php or bootstrap/app.php
RateLimiter::for('api', function (Request $request) {
    return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
});
```

---

### 6. BUKTI PEMBAYARAN TIDAK TERVALIDASI 🟡 **[MEDIUM]**

#### 📍 Lokasi
- `storage/app/public/bukti_pembayaran/`
- URL: `/storage/bukti_pembayaran/xxx.jpg`

#### ⚠️ Masalah
Sama seperti foto customer, file bukti pembayaran bisa diakses publik tanpa auth.

#### ✅ Solusi
Sama dengan solusi #3 - pindah ke private storage + protected route:

```php
// FileController.php
public function servePaymentProof($invoiceId)
{
    // Only admin or invoice owner can view
    if (!Auth::check()) {
        abort(403);
    }
    
    $invoice = Invoice::findOrFail($invoiceId);
    
    // Check authorization
    if (Auth::user()->role !== 'admin' && 
        Auth::id() !== $invoice->customer->user_id) {
        abort(403);
    }
    
    $path = $invoice->bukti_pembayaran;
    
    if (!$path || !Storage::disk('local')->exists($path)) {
        abort(404);
    }
    
    return response()->file(Storage::disk('local')->path($path));
}
```

---

## 📊 CHECKLIST PERBAIKAN

### Prioritas 1 - SEGERA (1-2 Hari)
- [ ] **#1** Pindahkan kredensial MikroTik ke `.env`
- [ ] **#2** Enable session encryption
- [ ] **#4** Ganti `uniqid()` dengan `Str::random(32)`
- [ ] **#5** Implementasi rate limiting di semua endpoints

### Prioritas 2 - URGENT (1 Minggu)
- [ ] **#2** Enkripsi kolom NIK (migration + model cast)
- [ ] **#3** Pindah foto ke private storage + protected routes
- [ ] **#6** Protected route untuk bukti pembayaran

### Prioritas 3 - PENTING (1 Bulan)
- [ ] Implementasi SSL/TLS untuk database connection
- [ ] Two-Factor Authentication (2FA) untuk admin
- [ ] Audit logging untuk akses data sensitif
- [ ] Penetration testing oleh security professional

---

## 🔐 BEST PRACTICES TAMBAHAN

### 1. Environment Variables Security
```dotenv
# .env - PRODUCTION
APP_ENV=production
APP_DEBUG=false  # NEVER true in production
APP_KEY=base64:... # Generate with: php artisan key:generate

SESSION_SECURE_COOKIE=true  # HTTPS only
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=strict

SANCTUM_STATEFUL_DOMAINS=yourdomain.com
```

### 2. Content Security Policy
```php
// app/Http/Middleware/SetSecurityHeaders.php
public function handle($request, Closure $next)
{
    $response = $next($request);
    
    $response->headers->set('X-Content-Type-Options', 'nosniff');
    $response->headers->set('X-Frame-Options', 'DENY');
    $response->headers->set('X-XSS-Protection', '1; mode=block');
    $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    return $response;
}
```

### 3. Database Backups Encryption
```bash
# Encrypt backup
php artisan backup:run
gpg --encrypt --recipient admin@yourdomain.com backup.sql

# Store encrypted backup in secure location (not public web directory)
```

### 4. Logging & Monitoring
```php
// Log akses data sensitif
Log::info('Customer data accessed', [
    'user_id' => Auth::id(),
    'customer_id' => $customer->id,
    'ip' => $request->ip(),
    'action' => 'view_ktp'
]);
```

### 5. Regular Security Updates
```bash
# Update dependencies
composer update
npm update

# Check for known vulnerabilities
composer audit
npm audit
```

---

## 📝 COMPLIANCE CHECKLIST (UU PDP)

- [ ] **Pasal 16:** Data pribadi (NIK) dienkripsi
- [ ] **Pasal 17:** Akses data dibatasi (role-based)
- [ ] **Pasal 20:** Audit trail untuk akses data sensitif
- [ ] **Pasal 21:** Backup terenkripsi
- [ ] **Pasal 22:** Notifikasi jika terjadi breach
- [ ] **Pasal 35:** Data retention policy (hapus data lama)

---

## 🚨 INSIDEN RESPONSE PLAN

Jika terjadi security breach:

1. **Immediate (0-1 jam):**
   - Isolate affected systems
   - Change all credentials (database, MikroTik, admin)
   - Enable maintenance mode

2. **Short-term (1-24 jam):**
   - Investigate breach extent
   - Identify affected customers
   - Patch vulnerability

3. **Follow-up (1-7 hari):**
   - Notify affected customers (UU PDP requirement)
   - Report to authorities if required
   - Implement additional security measures

---

## 📞 KONTAK

Untuk pertanyaan atau klarifikasi audit ini:
- **Email:** security@yourcompany.com
- **Escalation:** Segera jika ada indikasi breach

---

**Dokumen ini CONFIDENTIAL - hanya untuk internal team**
