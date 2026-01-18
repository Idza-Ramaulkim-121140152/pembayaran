# Google Sheets API Integration Setup Guide

## Prerequisites

1. **Google Cloud Project** dengan Sheets API enabled
2. **Service Account** dengan akses ke spreadsheet
3. **JSON credentials** dari service account

## Setup Steps

### 1. Create Google Cloud Project & Enable API

1. Go to: https://console.cloud.google.com/
2. Create new project atau gunakan existing
3. Enable Google Sheets API:
   - APIs & Services → Library
   - Search "Google Sheets API"
   - Click Enable

### 2. Create Service Account

1. APIs & Services → Credentials
2. Create Credentials → Service Account
3. Name: `pembayaran-sheets-reader`
4. Grant role: "Viewer" (read-only)
5. Done

### 3. Generate JSON Key

1. Click pada service account yang baru dibuat
2. Keys tab → Add Key → Create new key
3. Type: JSON
4. Download JSON file
5. Rename ke: `google-sheets-credentials.json`
6. Move ke: `storage/app/google-sheets-credentials.json`

### 4. Share Spreadsheet dengan Service Account

1. Open spreadsheet: https://docs.google.com/spreadsheets/d/1q-XbGhMx3ak0NwfvxFPIk0Sh7V98atUkp7ROtpsj3Uw/edit
2. Click "Share" button
3. Add email dari service account (dari JSON file, field `client_email`)
4. Permission: **Viewer**
5. Send

### 5. Install Laravel Package

```bash
composer require google/apiclient
```

### 6. Configure Environment

Add to `.env`:

```dotenv
# Google Sheets Integration
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_ID=1q-XbGhMx3ak0NwfvxFPIk0Sh7V98atUkp7ROtpsj3Uw
GOOGLE_SHEETS_CREDENTIALS_PATH=storage/app/google-sheets-credentials.json
GOOGLE_SHEETS_RANGE="Sheet1!A:R"

# Google Form untuk pendaftaran
GOOGLE_FORM_URL=https://forms.gle/D7e6D1W5nJHsRiBC7
```

### 7. Add to .gitignore

```gitignore
# Google Sheets credentials (NEVER commit this!)
storage/app/google-sheets-credentials.json
```

## Spreadsheet Structure

Expected columns (A-R):
1. Timestamp (Primary Key)
2. Nama Pelanggan
3. Tanggal Aktivasi
4. NIK Pelanggan
5. Jenis Kelamin Pelanggan
6. Desa
7. Dusun
8. Jenis Paket
9. Poto Depan Rumah (URL)
10. Poto Modem (URL)
11. Username PPPoE
12. ODP
13. Nomor WhatsApp
14. Biaya Pemasangan
15. Poto Redaman OPM (URL)
16. Jenis Paket (duplicate?)
17. Paket Custom
18. Poto KTP (URL)

## Testing

```bash
# Test API connection
php artisan tinker
>>> $service = new App\Services\GoogleSheetsService();
>>> $data = $service->fetchPendingCustomers();
>>> dd($data);
```

## Security Notes

1. **Service Account** memiliki akses read-only
2. **Credentials JSON** tidak boleh di-commit ke Git
3. **Spreadsheet** tetap private, hanya shared dengan service account
4. **Data sensitif** (NIK, foto) tetap di Google, tidak masuk DB
5. Admin hanya copy data operasional ke sistem

## Troubleshooting

### Error: "The caller does not have permission"
- Pastikan spreadsheet sudah di-share dengan service account email

### Error: "Unable to find credentials"
- Check path `GOOGLE_SHEETS_CREDENTIALS_PATH` di `.env`
- Pastikan JSON file ada di lokasi tersebut

### Error: "API key not valid"
- Enable Google Sheets API di Google Cloud Console
- Tunggu beberapa menit setelah enable API
