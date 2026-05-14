# Roadmap Pengembangan P1 & P2 + Perbaikan Menu ODP

Tanggal: 2026-05-12

Dokumen ini adalah rencana pengembangan fitur lanjutan (P1 & P2) untuk sistem billing & operasional ISP berbasis **Laravel 12 (session auth)** + **React 18 SPA (Vite)**.

## Ringkasan Tujuan

**P1 (Billing & Cashflow):** membuat tagihan lebih fleksibel dan akuntabel (prorate, diskon, add-on, cicilan instalasi, histori harga/paket) agar proses billing lebih sedikit manual dan lebih sedikit “edit nominal” yang rawan salah.

**P2 (Operasional & Kualitas Layanan):** menjadikan komplain sebagai ticketing yang bisa diukur SLA-nya, monitoring gangguan per ODP yang update otomatis ke halaman status, serta workflow instalasi end-to-end yang terhubung ke inventory.

**ODP (Data kualitas & UX):** menyediakan menu khusus untuk pemetaan ODP ↔ pelanggan (lebih akurat, bisa bulk, ada validasi), dan membuat flow pembuatan ODP lebih “operator-friendly”.

## Prinsip Desain (Agar Konsisten Dengan Arsitektur Saat Ini)

- **SPA pattern**: semua halaman UI berada di React; server mengembalikan `view('app')` untuk route UI.
- **API convention**: endpoint JSON di `/api/*`, memakai session + CSRF.
- **Roles**: fitur internal umumnya untuk `teknisi`/`finance` (dan `superadmin`).
- **Data integrity**: hindari relasi berbasis string untuk data inti (ODP/paket) untuk mencegah mismatch; lakukan migrasi bertahap agar aman.

---

# P1 — Fleksibilitas Billing (Prorate, Diskon, Add-on, Cicilan Instalasi, Histori Harga/Paket)

## 1) Scope P1 (Yang Akan Dibuat)

1. **Invoice line items** (rincian tagihan): invoice tidak hanya 1 angka `amount`, tetapi punya item-item (paket bulanan, biaya instalasi cicilan, add-on, diskon, prorate).
2. **Prorate**:
   - Prorate untuk pelanggan baru (aktivasi di tengah bulan).
   - Prorate saat upgrade/downgrade paket di tengah periode.
3. **Diskon**:
   - Diskon manual (nominal/persen) untuk invoice tertentu.
   - (Opsional) aturan diskon per customer untuk N bulan.
4. **Add-on**:
   - Add-on bulanan (mis. IP Publik, tambahan device).
   - One-time add-on (mis. biaya perangkat tertentu).
5. **Cicilan biaya instalasi**:
   - Biaya instalasi bisa dicicil X bulan dan otomatis masuk ke invoice bulanan.
6. **Histori perubahan harga/paket**:
   - Histori perubahan harga paket.
   - Histori perubahan paket pelanggan (kapan berubah, alasan, oleh siapa).

## 2) Non-scope (Supaya Tidak Melebar)

- Integrasi payment gateway (QRIS/VA) + webhook (boleh jadi P1.5/P2).
- Multi-payments/partial payments per 1 invoice (kecuali memang dibutuhkan setelah desain cicilan berjalan).
- Pajak kompleks (PPN multi rate, e-faktur). Jika dibutuhkan, direncanakan fase berikut.

## 3) Data Model (Rancangan Database)

> Catatan: tabel/kolom di bawah adalah rancangan. Penamaan bisa disesuaikan agar selaras dengan konvensi saat implementasi.

### 3.1 `invoice_items`
Menyimpan rincian setiap invoice.

Kolom utama:
- `id`
- `invoice_id` (FK)
- `item_type` enum: `package`, `addon`, `discount`, `prorate`, `installation_installment`, `adjustment`
- `description` (contoh: “Paket 50 Mbps”, “Diskon Retensi 10%”, “Cicilan Instalasi (bulan 2/6)”)
- `quantity` (decimal)
- `unit_price` (decimal)
- `amount` (decimal, bisa negatif untuk diskon)
- `meta` (json): konteks prorate (start/end), reference add-on, dsb.
- `created_by` (FK user) nullable
- timestamps

### 3.2 `customer_billing_profiles` (atau kolom tambahan di `customers`)
Menyimpan konfigurasi billing customer.

Kolom opsi:
- `customer_id` (unique)
- `billing_cycle` (mis. monthly)
- `billing_day` (1–28) atau `due_date_rule`
- `prorate_policy` enum: `daily`, `half_month`, `none`
- `addon_bundle` (json) atau relasi ke tabel add-on
- timestamps

### 3.3 `customer_installment_plans`
Menyimpan cicilan biaya instalasi.

Kolom:
- `customer_id`
- `total_amount`
- `installment_count`
- `installment_amount`
- `remaining_amount`
- `start_invoice_date` / `start_period`
- `status` (`active`, `completed`, `cancelled`)
- `meta` (json)

### 3.4 `package_price_histories`
Histori perubahan harga paket.

Kolom:
- `package_id`
- `old_price`, `new_price`
- `effective_from` (date)
- `reason` (text)
- `changed_by` (FK user)
- timestamps

### 3.5 `customer_package_histories`
Histori perubahan paket customer.

Kolom:
- `customer_id`
- `old_package_label` / `old_package_id` (jika sudah dinormalisasi)
- `new_package_label` / `new_package_id`
- `effective_from` (date)
- `reason` (text)
- `changed_by` (FK user)
- timestamps

## 4) Aturan Perhitungan (Business Rules)

### 4.1 Total Invoice
- `invoice.amount` menjadi **grand total** hasil penjumlahan `invoice_items.amount`.
- Diskon direpresentasikan sebagai item dengan `amount` negatif (lebih mudah audit).

### 4.2 Prorate (Rekomendasi aturan sederhana)
- **Daily prorate**: nilai prorate = (harga paket / jumlah hari periode) × hari pemakaian.
- Definisi periode:
  - Jika billing berdasarkan “bulan kalender”, periode = tanggal 1–akhir bulan.
  - Jika billing berdasarkan “cycle date customer”, periode = dari `billing_day` ke `billing_day-1` bulan berikutnya.

> Pertanyaan terbuka (perlu diputuskan): billing cycle Anda saat ini mengikuti `due_date` customer (per pelanggan) atau mengikuti tanggal invoice dibuat?

### 4.3 Cicilan Instalasi
- Cicilan tidak membuat “partial payment”; tetapi membuat **item cicilan** pada beberapa invoice berturut-turut.
- Jika customer membayar lunas sekaligus, maka sisa cicilan bisa ditutup dengan membuat item `adjustment` negatif/positif sesuai kebutuhan.

## 5) API (Rancangan Endpoint)

Contoh endpoint (di bawah `/api` dengan auth + role yang sesuai):

- `GET /api/invoices/{invoice}` → detail + items
- `POST /api/invoices/{invoice}/items` → tambah item
- `PUT /api/invoices/{invoice}/items/{item}` → edit item
- `DELETE /api/invoices/{invoice}/items/{item}` → hapus item

- `POST /api/customers/{customer}/billing-profile` → set profile
- `POST /api/customers/{customer}/installment-plan` → set cicilan instalasi

- `GET /api/packages/{package}/price-history`
- `POST /api/packages/{package}/price-change` (superadmin)

## 6) UI/UX (Rancangan Halaman & Komponen)

### 6.1 Invoice Management (Admin)
- Tambahkan panel “Rincian Tagihan” untuk invoice:
  - List item (type, deskripsi, qty, harga, subtotal)
  - Tombol tambah diskon / tambah add-on / tambah adjustment
  - Preview total dan audit “siapa ubah apa”

### 6.2 Customer Billing Profile
- Pada form customer atau halaman detail customer:
  - Pilih paket (jika sudah ada master packages)
  - Atur billing day & policy prorate
  - Atur cicilan instalasi

### 6.3 Safety UX
- Setiap perubahan nominal harus:
  - Tercatat (history)
  - Meminta alasan (opsional) untuk audit

## 7) Migration & Rollout Strategy

- Tahap 1: tambah tabel `invoice_items` dan mulai menulis item untuk invoice baru.
- Tahap 2: backfill item untuk invoice lama (opsional; minimal untuk invoice yang masih terbuka).
- Tahap 3: UI admin menampilkan breakdown.

**Risiko**: perubahan ini menyentuh banyak flow (auto invoice, print invoice). Rollout disarankan bertahap (feature flag / env toggle).

## 8) Acceptance Criteria (P1)

- Admin bisa membuat invoice yang memiliki beberapa item (paket + cicilan + diskon) dan totalnya otomatis konsisten.
- Prorate menghasilkan angka yang bisa dijelaskan (ada rentang tanggal di meta).
- Ada histori perubahan paket customer dan harga paket.
- Cicilan instalasi berjalan otomatis sampai lunas.

---

# P2 — Operasional & Kualitas Layanan

## A) Komplain → Ticketing (SLA, Assignment, Timeline, Root Cause, Report)

### 1) Scope
- Jadikan komplain sebagai **ticket** yang:
  - Bisa di-assign ke teknisi
  - Memiliki SLA (first response / resolution)
  - Memiliki timeline event (status change, komentar, internal note)
  - Memiliki kategori sebab (root cause) untuk laporan

### 2) Data Model

Opsi 1 (paling aman): evolusi tabel `complaints` yang sudah ada.
- Tambah kolom:
  - `ticket_number` (unique)
  - `opened_at`, `first_response_at`, `closed_at`
  - `sla_first_response_due_at`, `sla_resolution_due_at`
  - `cause_category` / `root_cause_id`
  - `last_activity_at`

Tambahan tabel:
- `complaint_events`:
  - `complaint_id`
  - `event_type` (`status_changed`, `comment`, `assignment_changed`, `sla_breached`, ...)
  - `message`, `meta`, `created_by`, timestamps

- `complaint_cause_categories` (master): untuk root cause (ODP down, fiber putus, power, router rumah, pembayaran, dll)
- `sla_policies`:
  - aturan SLA berdasarkan `category` + `priority`

### 3) UX
- List ticket:
  - Filter: status, priority, assigned_to, SLA due soon, category
  - Badge SLA: “due in X jam”, “breached”

- Detail ticket:
  - Timeline (event log)
  - Assign teknisi
  - Update status
  - Root cause
  - Catatan internal vs catatan untuk pelanggan

### 4) Reporting
- KPI minimal:
  - Avg first response time
  - Avg resolution time
  - Breach rate
  - Ticket volume per ODP/kategori

### 5) Acceptance Criteria
- Setiap perubahan status tercatat di timeline.
- SLA due dates dihitung otomatis.
- Ada laporan ringkas per minggu/bulan.

---

## B) Monitoring Jaringan per ODP (Real-time status, alarm, incident → update “status jaringan”)

### 1) Scope
- Status ODP internal (admin) dan publik (status-jaringan) update otomatis berdasar incident.
- Alarm gangguan (ke admin/teknisi) saat incident muncul/selesai.

### 2) Komponen Utama

1. **ODP Health Aggregation**
   - Input: data pelanggan per ODP + status online/offline (MikroTik).
   - Output: metrik per ODP (jumlah online/offline, offline ratio, last_checked_at).

2. **Incident Engine**
   - Aturan contoh:
     - Jika offline_ratio ≥ 60% dan customer_count ≥ 5 selama 10 menit → buat incident.
     - Jika offline_ratio turun < 20% selama 10 menit → resolve.

3. **Public Status Feed**
   - Halaman `status-jaringan` menampilkan incident ongoing + area/ODP terdampak.

### 3) Data Model
- `network_incidents`:
  - `title`, `severity`, `status` (`open`, `resolved`)
  - `started_at`, `resolved_at`
  - `affected_odps` (disarankan relasi, bukan comma separated)
  - `detected_by` (`auto`, `manual`)
  - `meta` (json)

- `network_incident_odps` (join table) jika pakai relasi many-to-many.

### 4) Integrasi dengan Network Notices
- Pilih 1 sumber kebenaran:
  - Opsi A: `network_incidents` jadi sumber utama, `network_notices` jadi publikasi.
  - Opsi B: `network_notices` ditambah field untuk incident linkage.

### 5) Alarm/Notifikasi
- Notifikasi internal (admin/teknisi) saat incident open/resolved.
- Opsional: broadcast ke pelanggan terdampak (per ODP) via WhatsApp.

### 6) Acceptance Criteria
- Incident otomatis tercatat tanpa input manual.
- Status-jaringan publik menampilkan incident yang valid.
- Ada audit log untuk incident manual.

---

## C) Workflow Instalasi (Lead → Survey → Jadwal → Pemasangan → Aktivasi PPPoE → BA + Inventory)

### 1) Scope
- Satu pipeline kerja instalasi yang bisa di-track statusnya.
- Terhubung dengan:
  - Customer record
  - ODP mapping
  - MikroTik provisioning
  - Inventory movements (material keluar)

### 2) Data Model
- `installation_leads`:
  - nama, telepon, alamat, sumber lead, koordinat (opsional), status

- `installation_surveys`:
  - lead_id, scheduled_at, hasil survey, rekomendasi ODP, foto, catatan

- `installation_work_orders`:
  - lead_id/customer_id, assigned_to/team, scheduled_at, status, completed_at

- `installation_checklists` (atau json checklist) + `installation_events` (timeline)
- `installation_documents`:
  - BA pemasangan (file), foto bukti, tanda tangan

**Inventory integration**:
- Buat `inventory_movements` tipe `out` dengan `reference` mengarah ke work order.

### 3) UX
- Halaman “Instalasi”:
  - Tab Leads (calon) dan Work Orders (proses instalasi)
  - Detail work order: checklist step, alokasi material, upload BA

### 4) Automation
- Setelah aktivasi PPPoE berhasil:
  - set status work order = completed
  - buat invoice pertama (opsional sesuai policy)
  - kirim WA konfirmasi aktivasi

### 5) Acceptance Criteria
- Pipeline bisa dilihat jelas (status & timeline).
- Material yang terpakai tercatat ke inventory.
- Aktivasi PPPoE tercatat dan repeatable.

---

# Perbaikan Menu ODP: Mapping Pelanggan & UX Pembuatan ODP

## 1) Masalah Saat Ini (Yang Biasanya Terjadi)

- Mapping ODP ↔ pelanggan rawan mismatch karena relasi masih berbasis string (`customers.odp` menyimpan nama ODP).
- Re-assign customer ke ODP lain mudah terjadi tanpa warning (data “tiba-tiba pindah ODP”).
- Tidak ada tampilan khusus untuk audit kualitas data (unassigned, ODP tidak ditemukan, typo, duplikat).
- Flow pembuatan ODP bisa dibuat lebih cepat untuk operator lapangan (lebih sedikit klik, lebih banyak default/saran).

## 2) Target UX (Menu Khusus Mapping)

Tambahkan menu baru: **“Pemetaan ODP”**

Fungsi yang wajib ada:
1. **Tabel Pelanggan** dengan kolom:
   - Nama, PPPoE, Telepon, Alamat, ODP saat ini, Status (online/offline opsional), Koordinat (opsional)
2. **Filter**:
   - Filter ODP
   - Filter “Belum ada ODP”
   - Filter “ODP tidak ditemukan” (customer.odp tidak match ke master)
3. **Assign/Re-assign**:
   - Assign 1 pelanggan
   - Bulk assign (multi-select)
   - Konfirmasi saat customer sudah punya ODP lain
4. **Audit kualitas**:
   - Daftar “ODP mismatch” + tombol perbaiki
   - Statistik: total assigned/unassigned/mismatch

## 3) UX Pembuatan ODP (Lebih User Friendly)

Perbaikan yang disarankan:
- **Quick Create** ODP dari halaman mapping (modal cepat): nama + rasio + lokasi.
- **Default values**:
  - `rasio_distribusi` default 1:8
- **Validasi yang jelas**:
  - Pesan error yang spesifik (nama sudah ada, koordinat invalid).
- **Map assistance**:
  - Bisa “ambil koordinat” dari pelanggan terpilih (jika pelanggan punya lat/long) untuk mempercepat input lokasi ODP.

## 4) Perbaikan Struktur Data (Migrasi Bertahap)

**Phase 1 (Quick Win, minim risiko)**
- Tetap gunakan string `customers.odp`, tetapi:
  - Saat assign wajib pilih dari daftar ODP master (tidak boleh free text).
  - Simpan event log (siapa memindahkan pelanggan dari ODP A ke B).

**Phase 2 (Perbaikan fundamental)**
- Tambah kolom `customers.odp_id` (FK ke `odps.id`).
- Backfill `odp_id` dengan join berdasarkan nama.
- Update relasi:
  - `Customer` belongsTo `Odp` via `odp_id`
  - `Odp` hasMany `Customer` via `odp_id`
- Tetap simpan `customers.odp` sementara untuk kompatibilitas, lalu deprecate.

## 5) Endpoint (Rancangan)

- `GET /api/odp-mapping/customers` → list pelanggan (minimal fields + filter)
- `POST /api/odp-mapping/assign` → bulk assign (customer_ids + odp_id)
- `POST /api/odp-mapping/unassign` → bulk unassign
- `GET /api/odps/options` → dropdown cepat

## 6) Acceptance Criteria (ODP)

- Operator bisa memperbaiki mapping ODP pelanggan dengan cepat (bulk) dan aman (ada konfirmasi + audit log).
- Tidak ada lagi customer yang menyimpan ODP “typo” (karena input berbasis pilihan).
- Monitoring Maps dan monitoring per ODP menjadi lebih akurat.

---

# Urutan Implementasi yang Direkomendasikan

1. **ODP Mapping Menu (Phase 1)** → supaya data ODP rapi dan jadi fondasi monitoring + instalasi.
2. **Invoice Items + Histori Paket/Harga** → supaya billing fleksibel dan audit-able.
3. **Cicilan Instalasi + Add-on + Prorate** → melengkapi fleksibilitas billing.
4. **Ticketing (SLA + Timeline + Report)** → operasional lebih terukur.
5. **Network Incident Engine + Alarm** → kualitas layanan dan komunikasi gangguan.
6. **Workflow Instalasi + Inventory Integration** → operasional lapangan terstruktur.

---

# Pertanyaan Terbuka (Perlu Jawaban Sebelum Coding)

## Billing
1. Cycle billing Anda: berdasarkan `due_date` per customer, atau tanggal invoice dibuat (bulan kalender)?
2. Prorate: per hari (daily) atau aturan lain?
3. Diskon: apakah butuh kupon/kode promo atau cukup diskon manual per invoice?
4. Cicilan instalasi: default berapa bulan (3/6/12) dan boleh lunas dipercepat?

## Ticketing
1. SLA target: first response dan resolution untuk setiap priority?
2. Apakah butuh “internal note” vs “customer-visible reply”?

## Monitoring per ODP
1. Ambang incident: offline ratio dan durasi berapa menit?
2. Alarm dikirim ke siapa saja (role teknisi, grup admin, dll)?

## Instalasi
1. Siapa yang mengerjakan instalasi: user teknisi (users) atau payroll members?
2. Checklist step instalasi yang wajib apa saja?

