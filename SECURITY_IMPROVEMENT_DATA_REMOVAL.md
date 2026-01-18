# 🔒 SECURITY IMPROVEMENT: Penghapusan Data Sensitif Pelanggan

**Tanggal:** 17 Januari 2026  
**Tujuan:** Meningkatkan keamanan aplikasi dengan menghapus penyimpanan data sensitif (NIK & foto pelanggan)

---

## 📋 RINGKASAN PERUBAHAN

Berdasarkan audit keamanan, data sensitif pelanggan (NIK dan foto-foto) telah **dihapus dari sistem** untuk mengurangi risiko kebocoran data dan meningkatkan compliance dengan UU Perlindungan Data Pribadi.

### Data yang Dihapus:
- ❌ NIK pelanggan
- ❌ Foto depan rumah (`photo_front`)
- ❌ Foto modem (`photo_modem`)
- ❌ Foto KTP (`photo_ktp`)
- ❌ Foto redaman OPM (`photo_opm`)

---

## ✅ FILE YANG DIUBAH

### 1. **Backend - Model**
- **File:** `app/Models/Customer.php`
- **Perubahan:** 
  - Removed `nik`, `photo_front`, `photo_modem`, `photo_ktp`, `photo_opm` dari `$fillable`
  - Model sekarang hanya menyimpan data operasional (nama, alamat, paket, dll)

### 2. **Backend - Controller**
- **File:** `app/Http/Controllers/CustomerController.php`
- **Perubahan:**
  - **Method `store()`**: Removed NIK & foto validation + file upload logic
  - **Method `update()`**: Removed NIK & foto validation + file upload logic
  - Tidak ada lagi pemrosesan file upload untuk foto pelanggan

### 3. **Database Migration**
- **File:** `database/migrations/2026_01_17_remove_sensitive_customer_data.php`
- **Perubahan:**
  - Migration baru untuk drop columns: `nik`, `photo_front`, `photo_modem`, `photo_ktp`, `photo_opm`
  - **PENTING:** Run migration untuk menghapus kolom dari database

### 4. **Frontend - Form**
- **File:** `resources/js/pages/Customers/CustomerForm.jsx`
- **Perubahan:**
  - Removed NIK input field
  - Removed seluruh section "Dokumentasi Foto" (4 photo upload fields)
  - Removed `photos` dan `previews` state
  - Removed `handlePhotoChange()` dan `removePhoto()` functions
  - Removed file appending logic dari submit handler
  - Cleaned up unused imports (`Camera`, `X` icons)

### 5. **Frontend - Detail View**
- **File:** `resources/js/pages/Customers/CustomersPage.jsx`
- **Perubahan:**
  - Removed NIK display dari modal detail pelanggan
  - Removed seluruh section "Dokumentasi" yang menampilkan foto-foto

---

## 🚀 CARA MENERAPKAN PERUBAHAN

### Step 1: Run Migration
```bash
php artisan migrate
```

Output expected:
```
Migrating: 2026_01_17_remove_sensitive_customer_data
Migrated:  2026_01_17_remove_sensitive_customer_data (XX.XXms)
```

### Step 2: (Opsional) Cleanup File Storage
Jika ingin menghapus foto-foto lama dari storage:
```bash
# Backup dulu jika diperlukan
cd storage/app/public/uploads/customers
# Hapus semua file foto (HATI-HATI!)
# rm -rf *
```

### Step 3: Clear Cache
```bash
php artisan config:clear
php artisan cache:clear
php artisan view:clear
```

### Step 4: Rebuild Frontend
```bash
npm run build
# atau untuk development:
npm run dev
```

---

## 🎯 DAMPAK PERUBAHAN

### ✅ Keuntungan:
1. **Keamanan Meningkat**
   - Tidak ada lagi data sensitif (NIK, foto KTP) yang bisa bocor
   - Mengurangi attack surface
   - Compliance dengan UU PDP lebih mudah

2. **Storage Savings**
   - Tidak perlu menyimpan foto-foto besar
   - Database lebih kecil dan cepat

3. **Privacy by Design**
   - Mengikuti prinsip data minimization
   - Hanya simpan data yang benar-benar dibutuhkan

### ⚠️ Yang Perlu Diperhatikan:
1. **Data Lama**
   - Data NIK & foto yang sudah ada akan dihapus permanen saat migration
   - Pastikan backup database sebelum migrate jika perlu

2. **Form Pelanggan**
   - Teknisi tidak bisa lagi upload foto saat aktivasi
   - Proses aktivasi jadi lebih cepat dan simple

3. **Dokumentasi Eksternal**
   - Jika perlu dokumentasi foto, bisa dilakukan di luar sistem
   - Bisa gunakan Google Drive/Folder terpisah yang tidak terintegrasi

---

## 📊 BEFORE vs AFTER

### Before (Dengan Data Sensitif):
```
customers table:
├── name
├── nik ❌ SENSITIVE
├── photo_front ❌ SENSITIVE
├── photo_modem ❌ SENSITIVE
├── photo_ktp ❌ SENSITIVE (KTP!)
├── photo_opm ❌ SENSITIVE
├── address
├── phone
└── ...
```

### After (Data Minimization):
```
customers table:
├── name
├── address
├── phone
├── package_type
├── pppoe_username
├── odp
├── latitude/longitude
└── ...
```

---

## 🔐 REKOMENDASI TAMBAHAN

### 1. Data Retention Policy
```php
// Implement automatic data cleanup
// Example: Delete inactive customers after 3 years
php artisan customers:cleanup-inactive --years=3
```

### 2. Audit Logging
Pastikan logging untuk akses data pelanggan:
```php
Log::info('Customer data accessed', [
    'admin_id' => Auth::id(),
    'customer_id' => $customer->id,
    'action' => 'view'
]);
```

### 3. Backup Strategy
```bash
# Automated encrypted backups
php artisan backup:run
gpg --encrypt backup.sql
```

---

## ✅ CHECKLIST DEPLOYMENT

- [ ] Review semua file yang diubah
- [ ] Backup database production
- [ ] Test di staging environment
- [ ] Run migration di staging
- [ ] Test form aktivasi pelanggan baru
- [ ] Test edit pelanggan existing
- [ ] Test tampilan detail pelanggan
- [ ] Deploy ke production
- [ ] Run migration di production
- [ ] Clear all caches
- [ ] Verify form & detail page working
- [ ] Monitor error logs

---

## 📝 ROLLBACK PLAN

Jika perlu rollback:

```bash
# Rollback migration (akan restore columns kosong)
php artisan migrate:rollback --step=1

# Restore data dari backup
mysql -u user -p database_name < backup_before_migration.sql
```

**Note:** Data yang sudah dihapus tidak bisa di-restore kecuali dari backup!

---

## 🎓 LESSONS LEARNED

### Data Minimization Principle:
> "The best way to protect sensitive data is to not collect it in the first place."

Sistem sekarang hanya menyimpan:
- ✅ Data operasional (nama, alamat, paket)
- ✅ Data teknis (PPPoE username, ODP)
- ✅ Data billing (tanggal aktivasi, jatuh tempo)

**Tidak menyimpan:**
- ❌ Data identitas (NIK)
- ❌ Foto pribadi (KTP)
- ❌ Dokumentasi visual yang tidak perlu untuk operasional

---

## 📞 SUPPORT

Jika ada pertanyaan atau issue:
- Technical: Developer team
- Security: Security audit report: `SECURITY_AUDIT_REPORT.md`
- Legal: Pastikan comply dengan UU PDP No. 27/2022

---

**Status:** ✅ READY FOR DEPLOYMENT
**Priority:** HIGH (Security improvement)
**Impact:** Medium (UI changes + database schema change)
