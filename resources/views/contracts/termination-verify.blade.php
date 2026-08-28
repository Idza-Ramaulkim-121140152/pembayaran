<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Verifikasi Surat Copot</title>
    <style>
        body { margin: 0; font-family: Arial, sans-serif; background: #f3f4f6; color: #111827; }
        .wrap { max-width: 720px; margin: 40px auto; padding: 0 16px; }
        .card { background: #fff; border-radius: 18px; box-shadow: 0 12px 30px rgba(15, 23, 42, .12); overflow: hidden; }
        .head { background: linear-gradient(135deg, #f97316, #dc2626); color: #fff; padding: 24px; }
        .body { padding: 24px; }
        .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; font-size: 12px; }
        .row { display: grid; grid-template-columns: 180px 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        .label { color: #6b7280; }
        .hash { word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        @media (max-width: 640px) { .row { grid-template-columns: 1fr; gap: 4px; } }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card">
            <div class="head">
                <h1>Verifikasi Surat Copot Pemasangan</h1>
                <p>PT. Rumah Kita Network</p>
            </div>
            <div class="body">
                <p><span class="badge">DOKUMEN VALID</span></p>
                <div class="row"><div class="label">Nomor Dokumen</div><div>{{ $termination->document_number }}</div></div>
                <div class="row"><div class="label">Nama Pelanggan</div><div>{{ $customerData['customer_name'] ?? $termination->customer?->name ?? '-' }}</div></div>
                <div class="row"><div class="label">Status</div><div>{{ strtoupper((string) $termination->status) }}</div></div>
                <div class="row"><div class="label">Tanggal Rencana</div><div>{{ optional($termination->planned_termination_date)->format('Y-m-d') ?: '-' }}</div></div>
                <div class="row"><div class="label">Dibuat</div><div>{{ optional($termination->generated_at)->format('Y-m-d H:i') ?: '-' }}</div></div>
                <div class="row"><div class="label">Final</div><div>{{ optional($termination->completed_at)->format('Y-m-d H:i') ?: 'Belum final' }}</div></div>
                <div class="row"><div class="label">Hash PDF</div><div class="hash">{{ $termination->pdf_hash ?: '-' }}</div></div>
                <p style="margin-top: 20px; color: #4b5563;">{{ $signatureMeta['statement'] ?? 'Dokumen diterbitkan secara digital oleh sistem.' }}</p>
                <p><a href="{{ route('terminations.public.download', ['token' => $termination->public_token]) }}">Download PDF</a></p>
            </div>
        </div>
    </div>
</body>
</html>
