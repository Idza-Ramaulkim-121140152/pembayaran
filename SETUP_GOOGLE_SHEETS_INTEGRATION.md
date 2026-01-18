# Panduan Setup Google Sheets Integration

## ✅ Yang Sudah Selesai

1. ✅ Extension PHP GD & ZIP diaktifkan
2. ✅ Package `google/auth` terinstall
3. ✅ GoogleSheetsService diupdate menggunakan REST API (tanpa package besar)
4. ✅ Migration dijalankan - kolom sensitif dihapus, kolom `google_sheets_timestamp` ditambahkan
5. ✅ Konfigurasi .env sudah ditambahkan
6. ✅ Navbar sudah diupdate dengan link "Verifikasi Pelanggan"

## 📋 Langkah Selanjutnya

### 1. Setup Google Cloud Project & Service Account

#### A. Buat/Pilih Google Cloud Project
1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih project yang sudah ada
3. Catat nama project Anda

#### B. Aktifkan Google Sheets API
1. Di Google Cloud Console, buka **APIs & Services** → **Library**
2. Cari "Google Sheets API"
3. Klik **Enable**

#### C. Buat Service Account
1. Buka **APIs & Services** → **Credentials**
2. Klik **Create Credentials** → **Service Account**
3. Isi detail:
   - **Service account name**: `isp-billing-sheets-reader`
   - **Service account ID**: (otomatis terisi)
   - **Description**: `Read-only access to customer registration Google Sheets`
4. Klik **Create and Continue**
5. **Grant this service account access to project**:
   - Pilih role: **Viewer** (atau biarkan kosong)
6. Klik **Done**

#### D. Generate JSON Credentials
1. Di halaman **Credentials**, cari service account yang baru dibuat
2. Klik pada service account tersebut
3. Buka tab **Keys**
4. Klik **Add Key** → **Create new key**
5. Pilih **JSON**
6. Klik **Create** - file JSON akan terdownload otomatis
7. **PENTING**: Rename file menjadi `google-sheets-credentials.json`

#### E. Upload Credentials ke Server
```bash
# Dari folder project
copy "C:\Users\ACER\Downloads\google-sheets-credentials.json" "storage\app\google-sheets-credentials.json"
```

Atau manual:
1. Buka folder `storage/app/` di project Anda
2. Paste file `google-sheets-credentials.json` ke sana

### 2. Share Google Sheets dengan Service Account

1. Buka file credentials JSON yang baru didownload
2. Cari field `"client_email"` - contoh: `isp-billing-sheets-reader@your-project-123456.iam.gserviceaccount.com`
3. Copy email tersebut
4. Buka [Google Sheets Anda](https://docs.google.com/spreadsheets/d/1q-XbGhMx3ak0NwfvxFPIk0Sh7V98atUkp7ROtpsj3Uw/)
5. Klik **Share** (pojok kanan atas)
6. Paste email service account
7. **Permission**: **Viewer** (read-only)
8. **Hilangkan centang** "Notify people" (service account tidak perlu notifikasi)
9. Klik **Share**

### 3. Aktifkan Google Sheets Integration

Edit file `.env`:
```dotenv
# Ubah false menjadi true
GOOGLE_SHEETS_ENABLED=true

# Spreadsheet ID sudah benar (dari URL Google Sheets)
GOOGLE_SHEETS_ID=1q-XbGhMx3ak0NwfvxFPIk0Sh7V98atUkp7ROtpsj3Uw

# Range sudah benar (kolom A-R)
GOOGLE_SHEETS_RANGE=Sheet1!A:R

# Path credentials sudah benar
GOOGLE_SHEETS_CREDENTIALS_PATH=storage/app/google-sheets-credentials.json
```

### 4. Struktur Google Sheets Form

Pastikan Google Form Anda memiliki kolom dengan urutan berikut (A-R):

| Kolom | Header | Deskripsi | Contoh |
|-------|--------|-----------|--------|
| A | Timestamp | Otomatis dari Google Form | 17/01/2026 14:30:45 |
| B | Nama Lengkap | Nama pelanggan | Ahmad Budiman |
| C | NIK | Nomor Induk Kependudukan | 3201234567890123 |
| D | Alamat Lengkap | Alamat lengkap | Jl. Merdeka No. 123, Jakarta |
| E | Nomor Telepon | Format: 08xxx | 081234567890 |
| F | Username PPPoE | Username untuk koneksi | ahmad_budiman |
| G | Password PPPoE | Password untuk koneksi | password123 |
| H | Paket Internet | Nama paket | Paket 20 Mbps |
| I | Harga Paket | Format: Rp 250.000 | Rp 250.000 |
| J | ODP | Optical Distribution Point | ODP-01 |
| K | Latitude | Koordinat (opsional) | -6.200000 |
| L | Longitude | Koordinat (opsional) | 106.816666 |
| M | Tanggal Aktivasi | Format: DD/MM/YYYY | 17/01/2026 |
| N | Foto KTP | URL upload file | https://drive.google.com/... |
| O | Foto Depan Rumah | URL upload file | https://drive.google.com/... |
| P | Foto OPM | URL upload file | https://drive.google.com/... |
| Q | Foto Modem | URL upload file | https://drive.google.com/... |
| R | (cadangan) | - | - |

**Catatan Penting:**
- Kolom NIK dan Foto (N-Q) **TIDAK** akan disimpan ke database aplikasi
- Hanya tersimpan di Google Sheets (aman)
- Admin hanya bisa lihat link/URL saat verifikasi

### 5. Build Frontend (Opsional - untuk production)

```bash
npm run build
```

Atau untuk development:
```bash
npm run dev
```

### 6. Test Sistem

#### A. Akses Halaman Verifikasi
1. Login sebagai admin
2. Klik menu **"Verifikasi Pelanggan"** di navbar
3. Anda akan melihat 2 pilihan:
   - **Daftarkan Pelanggan** - link ke Google Form
   - **Verifikasi User** - list pending customers

#### B. Isi Google Form (Simulasi Pendaftaran)
1. Klik "Daftarkan Pelanggan"
2. Isi Google Form dengan data test
3. Upload foto-foto (KTP, rumah, dll)
4. Submit form

#### C. Verifikasi Customer
1. Kembali ke aplikasi
2. Klik "Verifikasi User"
3. Customer yang baru submit muncul di list
4. Klik customer tersebut
5. Form akan terisi otomatis dengan data dari Google Sheets
6. **Box biru** menampilkan data sensitif (NIK, link foto) dari Sheets
7. Lengkapi data jika perlu (koordinat, dll)
8. Klik "Verifikasi & Simpan"
9. Sistem akan:
   - Simpan data operasional ke database (tanpa NIK/foto)
   - Buat user PPPoE di MikroTik otomatis
   - Tampilkan modal sukses dengan credentials

#### D. Verifikasi Database
```bash
php artisan tinker
```

```php
// Cek customer terakhir
$customer = App\Models\Customer::latest()->first();
$customer->only(['nama', 'alamat', 'no_telp', 'google_sheets_timestamp']);

// Pastikan TIDAK ada kolom: nik, photo_ktp, photo_front, dll
```

### 7. Troubleshooting

#### Error: "Google Sheets integration is not enabled"
**Solusi**: Set `GOOGLE_SHEETS_ENABLED=true` di `.env`

#### Error: "credentials file not found"
**Solusi**: 
1. Pastikan file `google-sheets-credentials.json` ada di `storage/app/`
2. Cek permission folder: `chmod 755 storage/app/`

#### Error: "Failed to get access token"
**Solusi**:
1. Cek format JSON credentials (harus valid JSON)
2. Pastikan service account sudah diberi permission ke spreadsheet
3. Verifikasi `client_email` di credentials sesuai dengan yang di-share

#### Error: "Failed to fetch data from Google Sheets"
**Solusi**:
1. Cek Google Sheets API sudah enabled
2. Cek spreadsheet ID di `.env` benar
3. Cek service account punya access ke spreadsheet (klik Share di Sheets)
4. Cek range sudah benar: `Sheet1!A:R`

#### Pending customers tidak muncul
**Solusi**:
1. Pastikan ada data di Google Sheets
2. Cek column header di row pertama Sheets sesuai mapping
3. Cek timestamp unik (setiap customer punya timestamp berbeda)

#### PPPoE user tidak terbuat di MikroTik
**Solusi**:
1. Cek MikroTik credentials di `MikroTikService.php`
2. Pastikan MikroTik online dan accessible dari server
3. Cek username belum ada di MikroTik (harus unique)

### 8. Keamanan & Best Practices

✅ **Yang BENAR:**
- NIK dan foto hanya di Google Sheets (private)
- Service account hanya punya akses **Viewer** (read-only)
- Credentials file di `storage/app/` (tidak di public folder)
- `.env` tidak di-commit ke Git (ada di `.gitignore`)

❌ **Yang SALAH:**
- Jangan commit `google-sheets-credentials.json` ke Git
- Jangan share service account email secara publik
- Jangan aktifkan write permission untuk service account
- Jangan taruh credentials di `public/` folder

### 9. Backup & Recovery

#### Backup Database (Sebelum Migration)
```bash
# MySQL
mysqldump -u root -p pembayaran_db > backup_before_migration.sql

# Restore jika perlu
mysql -u root -p pembayaran_db < backup_before_migration.sql
```

#### Backup Google Sheets
1. Buka Google Sheets
2. **File** → **Download** → **Microsoft Excel (.xlsx)**
3. Simpan file sebagai backup mingguan/bulanan

### 10. Monitoring

#### Check Logs
```bash
# Laravel logs
tail -f storage/logs/laravel.log

# Cari error Google Sheets
grep "Google Sheets" storage/logs/laravel.log
```

#### Check Customer Verification Status
```bash
php artisan tinker
```

```php
// Total customers verified via Google Sheets
$verifiedCount = App\Models\Customer::whereNotNull('google_sheets_timestamp')->count();
echo "Total verified: $verifiedCount\n";

// Latest 5 verified customers
$latest = App\Models\Customer::whereNotNull('google_sheets_timestamp')
    ->latest('created_at')
    ->take(5)
    ->get(['nama', 'google_sheets_timestamp', 'created_at']);
print_r($latest->toArray());
```

## 🎉 Selesai!

Sistem Google Sheets integration sudah siap digunakan. Customer bisa mendaftar via Google Form dengan aman (data sensitif di Sheets), dan admin bisa verifikasi dengan mudah (data operasional di aplikasi).

**Workflow Lengkap:**
1. Customer/Teknisi → Isi Google Form (data lengkap + NIK + foto)
2. Data masuk Google Sheets (private, secure)
3. Admin → Klik "Verifikasi Pelanggan" di aplikasi
4. Admin → Lihat list pending customers dari Sheets
5. Admin → Klik customer → Form pre-filled otomatis
6. Admin → Lihat data sensitif di box biru (link ke Sheets)
7. Admin → Lengkapi/verifikasi data → Submit
8. Sistem → Simpan data operasional ke DB (tanpa NIK/foto)
9. Sistem → Buat PPPoE user di MikroTik
10. Selesai → Customer bisa login dengan credentials

**Keuntungan:**
- ✅ Data sensitif (NIK, foto) aman di Google Sheets (tidak di aplikasi)
- ✅ Compliance dengan UU PDP (data minimization)
- ✅ Admin tetap bisa lihat data lengkap saat verifikasi (via link)
- ✅ Workflow efisien (pre-filled form)
- ✅ Audit trail jelas (google_sheets_timestamp)
- ✅ Automatic PPPoE provisioning
