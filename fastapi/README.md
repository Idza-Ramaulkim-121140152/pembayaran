# WhatsApp Notification Service

API FastAPI untuk mengirim notifikasi gangguan jaringan ke pelanggan melalui WhatsApp **GRATIS** menggunakan whatsapp-web.js.

## 🏗️ Arsitektur

```
┌─────────────────┐     HTTP      ┌─────────────────┐     WhatsApp Web
│                 │ ───────────── │                 │ ─────────────────►  WhatsApp Server
│   FastAPI       │    :8001      │   WA Gateway    │      :3001
│   (Python)      │ ◄───────────  │   (Node.js)     │ ◄─────────────────
│                 │               │                 │
└─────────────────┘               └─────────────────┘
        │                                 │
        │                                 │
        ▼                                 ▼
   ┌─────────┐                    ┌──────────────┐
   │ MySQL   │                    │ Session WA   │
   │ Database│                    │ (LocalAuth)  │
   └─────────┘                    └──────────────┘
```

## 📋 Fitur

- 📢 Kirim notifikasi gangguan ke **semua pelanggan aktif**
- 👤 Kirim notifikasi ke **pelanggan tertentu** berdasarkan ID
- 🏢 Kirim notifikasi ke pelanggan berdasarkan **ODP**
- ✉️ Kirim **pesan kustom** dengan template nama `{nama}`
- ⏭️ **Otomatis skip** pelanggan dengan nomor tidak valid (0 atau kosong)
- 📊 **Laporan detail** hasil pengiriman
- 🔐 **Session tersimpan** - tidak perlu scan QR setiap kali restart
- 💰 **GRATIS** - menggunakan whatsapp-web.js

## 🚀 Instalasi

### 1. Install Dependencies Python (FastAPI)

```bash
cd fastapi
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 2. Install Dependencies Node.js (WA Gateway)

```bash
cd fastapi/wa-gateway
npm install
```

### 3. Konfigurasi Database

Edit file `fastapi/.env`:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=pembayaran
DB_USERNAME=root
DB_PASSWORD=
```

## ▶️ Menjalankan

### Langkah 1: Jalankan WhatsApp Gateway

```bash
cd fastapi/wa-gateway
node server.js
```

**Pertama kali:** QR Code akan muncul di terminal. Scan dengan WhatsApp Anda.

### Langkah 2: Jalankan FastAPI

```bash
cd fastapi
venv\Scripts\activate  # Windows
python -m uvicorn main:app --reload --port 8001
```

### Akses Dokumentasi API

- Swagger UI: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## 🔌 API Endpoints

### WhatsApp Management

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/whatsapp/status` | Cek status koneksi WA |
| GET | `/api/whatsapp/qr` | Ambil QR code (base64) |
| POST | `/api/whatsapp/connect` | Cek koneksi gateway |
| POST | `/api/whatsapp/restart` | Restart WA client |
| POST | `/api/whatsapp/logout` | Logout (perlu scan QR lagi) |

### Data

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/notices` | Daftar pemberitahuan gangguan |
| GET | `/api/notices/{id}` | Detail pemberitahuan |
| GET | `/api/customers` | Daftar pelanggan |

### Kirim Notifikasi

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/send/notification` | Kirim notifikasi gangguan |
| POST | `/api/send/custom` | Kirim pesan kustom |
| POST | `/api/send/phone` | Kirim ke nomor tertentu |
| POST | `/api/send/by-odp/{odp}` | Kirim berdasarkan ODP |

## 📝 Contoh Penggunaan

### Kirim Notifikasi Gangguan ke Semua Pelanggan

```bash
curl -X POST "http://localhost:8001/api/send/notification" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Kirim ke Pelanggan Tertentu

```bash
curl -X POST "http://localhost:8001/api/send/notification" \
  -H "Content-Type: application/json" \
  -d '{
    "notice_id": 1,
    "customer_ids": [1, 2, 3]
  }'
```

### Kirim Pesan Kustom dengan Template

```bash
curl -X POST "http://localhost:8001/api/send/custom" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Halo {nama}, ini adalah pesan test dari sistem."
  }'
```

### Kirim ke Pelanggan di ODP Tertentu

```bash
curl -X POST "http://localhost:8001/api/send/by-odp/ODP-001" \
  -H "Content-Type: application/json" \
  -d '{
    "notice_id": 1
  }'
```

### Test Kirim ke Satu Nomor

```bash
curl -X POST "http://localhost:8001/api/send/phone" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "08123456789",
    "message": "Test pesan dari sistem"
  }'
```

## 📱 Format Nomor Telepon

Sistem akan otomatis mengkonversi format nomor:

| Input | Output | Status |
|-------|--------|--------|
| `08123456789` | `628123456789` | ✅ Valid |
| `8123456789` | `628123456789` | ✅ Valid |
| `+628123456789` | `628123456789` | ✅ Valid |
| `628123456789` | `628123456789` | ✅ Valid |
| `0` | - | ❌ Skip |
| `` (kosong) | - | ❌ Skip |

## 📊 Response Format

```json
{
  "success": true,
  "message": "Notifikasi berhasil diproses untuk 10 pelanggan",
  "total_customers": 10,
  "sent_count": 8,
  "failed_count": 1,
  "skipped_count": 1,
  "results": [
    {
      "phone": "628123456789",
      "customer_name": "John Doe",
      "success": true,
      "error": null
    },
    {
      "phone": "0",
      "customer_name": "Jane Doe",
      "success": false,
      "error": "Nomor tidak valid atau 0"
    },
    {
      "phone": "628111111111",
      "customer_name": "Bob",
      "success": false,
      "error": "Nomor tidak terdaftar di WhatsApp"
    }
  ]
}
```

## 🔧 Troubleshooting

### QR Code tidak muncul
- Pastikan Node.js sudah terinstall
- Jalankan `npm install` di folder wa-gateway
- Cek apakah port 3001 sudah digunakan

### WhatsApp terputus
- Buka http://localhost:8001/api/whatsapp/qr untuk scan ulang
- Atau restart: `POST /api/whatsapp/restart`

### Pesan tidak terkirim
- Pastikan nomor terdaftar di WhatsApp
- Cek format nomor (harus valid)
- Jangan spam terlalu cepat (ada delay 2 detik per pesan)

### Session hilang
- Session disimpan di `wa-gateway/sessions/`
- Jangan hapus folder ini jika tidak ingin scan QR lagi

## ⚠️ Peringatan

- **Jangan spam!** WhatsApp bisa memblokir nomor jika mengirim terlalu banyak pesan
- Delay default 2 detik antar pesan untuk menghindari block
- Gunakan untuk keperluan legitimate (notifikasi gangguan, dll)
- Tidak untuk bulk marketing/spam

## 📄 License

MIT License
