# Audit Fitur Penting (Balanced)

Tanggal audit: 2026-05-15
Scope: Internal ISP app (Laravel 12 + React SPA)
Mode prioritas: Balanced (cashflow + operasional)

## Ringkasan Eksekutif

Fondasi inti sudah berjalan: billing dasar, approval pembayaran, dashboard prediksi, ODP mapping, incident engine awal, ticketing SLA dasar, workflow instalasi, inventory, dan access policy.

Gap terbesar saat ini bukan di CRUD, tetapi di kontrol proses end-to-end:
- Collection masih minim otomasi bertahap.
- Closing & reconciliation belum ada lock period + mismatch monitor.
- Payment capture belum punya auto-matching/idempotency yang kuat.
- SLA/incident belum lengkap di escalation loop.
- Guardrail kualitas data ODP/wilayah belum jadi sistem skor berkelanjutan.

## Status Audit per Prioritas

| Prioritas | Status | Kondisi Saat Ini | Gap Utama |
|---|---|---|---|
| 1) Dunning & Collection Automation | Missing | Ada indikator collection di dashboard/prediksi, belum ada mesin reminder bertahap terjadwal | Scheduler reminder H-7/H-3/H-1/H+1/H+3, retry, log pengiriman, segmentasi |
| 2) Closing & Reconciliation Keuangan | Missing | Belum ada konsep lock/reopen periode dan panel mismatch lintas sumber | Lock period, audit reopen, ringkasan mismatch invoice-mutasi-ledger |
| 3) Payment Capture Reliability | Partial | Ada konfirmasi pembayaran + bukti bayar + status menunggu konfirmasi | Auto-match pembayaran, idempotency key, duplicate guard, confidence scoring |
| 4) SLA Engine Komplain | Partial | Sudah ada field SLA dan policy dasar, report awal sudah ada | SLA live endpoint, breach alert terjadwal, escalation action + timeline |
| 5) Incident Command (NOC) | Partial | Sudah ada incident open/resolve + engine otomatis | Acknowledge, escalation chain, timeline tindakan, postmortem ringkas |
| 6) Instalasi + Inventory Governance | Partial | Work order/checklist/inventory movement sudah ada | Mandatory gate per tahap, approval material keluar, completion validator |
| 7) Data Quality Guardrail ODP/Wilayah | Partial | ODP mapping dan backfill ada, filtering wilayah sudah ada | Skor kualitas, daftar perbaikan prioritas, endpoint audit kualitas |
| 8) Security Hardening Internal | Partial | Session auth + access policy + audit policy ada | 2FA role sensitif, device/session log terpadu, anomali login |

## Urutan Implementasi (Balanced, 2-3 fitur per sprint)

### Sprint 1 (Cashflow first)
1. Dunning & Collection Automation
2. Payment Capture Reliability

Deliverables:
- Reminder bertahap otomatis + retry + log.
- Auto-match pembayaran manual/gateway-ready + idempotent submit.
- Dashboard metrik mismatch dan collection uplift week-over-week.

### Sprint 2 (Finance control + service discipline)
1. Closing & Reconciliation Keuangan
2. SLA Engine Komplain

Deliverables:
- Lock/reopen periode dengan audit trail approval.
- Rekonsiliasi invoice vs mutasi vs ledger (summary + drill-down mismatch).
- SLA live board + escalation otomatis berbasis due/breach.

### Sprint 3 (Operasional stabilitas)
1. Incident Command (NOC Workflow)
2. Data Quality Guardrail ODP/Wilayah

Deliverables:
- Incident ack/escalate/timeline/postmortem.
- Skor kualitas ODP mapping + daftar tindakan per wilayah.

### Sprint 4 (Governance & hardening)
1. Instalasi + Inventory Governance
2. Security Hardening Internal

Deliverables:
- Gate mandatory per tahap instalasi + approval material.
- 2FA finance/superadmin + session/device monitor + login anomaly alert.

## Rekomendasi Endpoint Additive

### Dunning
- `GET /api/billing/dunning/config`
- `PUT /api/billing/dunning/config`
- `POST /api/billing/dunning/run`
- `GET /api/billing/dunning/logs`
- `POST /api/billing/dunning/{log}/retry`

### Closing & Reconciliation
- `POST /api/finance/closing-periods/{period}/lock`
- `POST /api/finance/closing-periods/{period}/reopen`
- `GET /api/finance/reconciliation/summary`
- `GET /api/finance/reconciliation/mismatches`

### Payment Capture Reliability
- `POST /api/billing/payments/capture` (idempotent)
- `POST /api/billing/payments/match`
- `GET /api/billing/payments/unmatched`

### SLA Komplain
- `GET /api/complaints/sla-live`
- `POST /api/complaints/{complaint}/escalate`

### Incident Command
- `POST /api/network-incidents/{networkIncident}/ack`
- `POST /api/network-incidents/{networkIncident}/escalate`
- `GET /api/network-incidents/{networkIncident}/timeline`
- `POST /api/network-incidents/{networkIncident}/postmortem`

### ODP Quality
- `GET /api/odp-mapping/quality-audit`

### Security
- `POST /api/security/2fa/enable`
- `POST /api/security/2fa/verify`
- `GET /api/security/sessions`
- `GET /api/security/login-anomalies`

## Detail Implementasi per Prioritas

### 1) Dunning & Collection Automation
Backend:
- Tambah tabel jadwal reminder + log pengiriman + retry_count + last_error.
- Job scheduler harian untuk memproses wave H-7/H-3/H-1/H+1/H+3.
- Integrasi ke WhatsApp service existing dengan template per wave.

Frontend:
- Panel konfigurasi cadence reminder, jam kirim, template aktif.
- Halaman monitoring log: success/failed/retry/pending.

Acceptance KPI:
- Collection rate naik WoW minimal target internal (mis. +5% awal).
- Rasio invoice overdue menurun dalam 2-4 minggu.

### 2) Closing & Reconciliation Keuangan
Backend:
- Tabel `closing_periods` dengan status `open|locked|reopened`.
- Guard write untuk transaksi/invoice pada periode locked.
- Reconciliation summary: due_amount, collected, unmatched, variance.

Frontend:
- Panel lock/reopen (dengan reason + approver).
- Reconciliation board dengan quick filter mismatch.

Acceptance KPI:
- Tidak ada mutasi data tanpa reopen pada periode locked.
- Mismatch rate invoice-mutasi turun bertahap.

### 3) Payment Capture Reliability
Backend:
- Standardisasi fingerprint pembayaran (customer + amount + date + ref).
- Idempotency key pada endpoint capture.
- Duplicate detector + queue manual review.

Frontend:
- Banner status match confidence: exact/possible/unmatched.
- Tombol merge/resolve manual untuk ambiguous match.

Acceptance KPI:
- Kasus “sudah bayar tapi belum update” turun signifikan.
- Duplicate confirmation hampir nol.

### 4) SLA Engine Komplain
Backend:
- Worker periodic untuk cek due soon/breached.
- Auto-escalate berdasarkan priority dan policy.
- Simpan event escalation ke timeline complaint_events.

Frontend:
- SLA live board: due soon, breached, assignment gap.
- Action escalate manual dengan reason.

Acceptance KPI:
- Breach rate turun.
- Median first response/resolution membaik.

### 5) Incident Command (NOC)
Backend:
- State tambahan incident: `open -> acknowledged -> mitigated -> resolved`.
- Timeline tindakan terstruktur (actor, action, note, timestamp).
- Postmortem schema ringkas (root cause, impact, prevention).

Frontend:
- Incident panel dengan CTA ack/escalate.
- Timeline aktivitas teknisi.

Acceptance KPI:
- MTTA turun.
- MTTR turun.

### 6) Instalasi + Inventory Governance
Backend:
- Validasi checklist wajib sebelum status complete.
- Approval material keluar di atas threshold tertentu.
- Audit relasi WO <-> inventory movement wajib lengkap.

Frontend:
- Gate visual step-by-step (belum bisa lanjut jika mandatory belum terpenuhi).
- Badge “material approved” vs “pending approval”.

Acceptance KPI:
- Selisih stok karena WO incomplete menurun.
- Rework instalasi menurun.

### 7) Data Quality Guardrail ODP/Wilayah
Backend:
- Scoring formula: unassigned, mismatch, legacy null wilayah, duplicate naming.
- Endpoint audit + rekomendasi perbaikan otomatis per wilayah.

Frontend:
- Widget kualitas data (score + trend) di ODP Mapping.
- Queue perbaikan prioritas (quick assign/fix).

Acceptance KPI:
- Unassigned/mismatch turun konsisten.
- Legacy ODP tanpa wilayah mendekati nol.

### 8) Security Hardening Internal
Backend:
- 2FA TOTP untuk superadmin/finance.
- Device/session registry dengan revoke session aktif.
- Rule-based anomaly detector (IP/lokasi/perangkat baru).

Frontend:
- Wizard setup 2FA.
- Halaman session management + login activity.

Acceptance KPI:
- Akun sensitif 100% aktif 2FA.
- Event login anomali terdeteksi dan ditindaklanjuti.

## Dependency & Risiko

Dependency lintas fitur:
- Dunning bergantung pada kualitas data due_date + nomor WA valid.
- Reconciliation bergantung pada konsistensi sumber transaksi (billing/ledger/mutasi).
- SLA dan Incident membutuhkan notifikasi internal stabil.

Risiko utama:
- Over-automation tanpa review step bisa menghasilkan false action.
- Lock period tanpa prosedur reopen yang jelas bisa menghambat operasi.

Mitigasi:
- Mulai dengan mode shadow/monitoring untuk workflow baru berisiko tinggi.
- Semua aksi otomatis wajib audit log + actor/system stamp.

## Definition of Done per Sprint

- Endpoint additive tersedia + test feature lulus.
- UI operasional utama tersedia minimal untuk monitoring/action.
- Metrik baseline vs sesudah implementasi tercatat.
- Dokumentasi runbook operasional diperbarui.
