<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
    <title>Verifikasi Kontrak {{ $agreement->agreement_number }}</title>
    <style>
        body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
        .wrap { max-width: 720px; margin: 40px auto; padding: 0 16px; }
        .card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px; box-shadow: 0 16px 40px rgba(15, 23, 42, .08); }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; font-size: 12px; }
        h1 { margin: 14px 0 8px; font-size: 26px; }
        .grid { display: grid; grid-template-columns: 180px 1fr; gap: 10px; margin-top: 22px; }
        .label { color: #64748b; }
        .box { margin-top: 22px; padding: 16px; border-radius: 14px; background: #f1f5f9; }
        a { color: #2563eb; font-weight: 700; }
        @media (max-width: 640px) { .grid { grid-template-columns: 1fr; gap: 4px; } }
    </style>
</head>
<body>
    <main class="wrap">
        <section class="card">
            <span class="badge">DOKUMEN VALID</span>
            <h1>Verifikasi Kontrak Pelanggan</h1>
            <p>Dokumen ini tercatat pada sistem Rumah Kita Network.</p>

            <div class="grid">
                <div class="label">Nomor Kontrak</div><div><strong>{{ $agreement->agreement_number }}</strong></div>
                <div class="label">Nama Pelanggan</div><div>{{ $customerData['customer_name'] ?? $agreement->customer?->name ?? '-' }}</div>
                <div class="label">Dibuat Pada</div><div>{{ optional($agreement->generated_at ?: $agreement->created_at)->timezone('Asia/Jakarta')->format('d/m/Y H:i') }} WIB</div>
                <div class="label">Hash PDF</div><div style="word-break: break-all;">{{ $agreement->pdf_hash ?? '-' }}</div>
            </div>

            <div class="box">
                <strong>Pihak PT</strong>
                <p>{{ $signatureMeta['company']['statement'] ?? 'Dokumen ini ditanda tangani digital oleh Direktur Utama Idza Ramaulkim' }}</p>
                <strong>Pelanggan</strong>
                <p>{{ $signatureMeta['customer']['statement'] ?? 'Pelanggan sudah setuju dengan perjanjian ini dan di tanda tangani digital' }}</p>
            </div>

            <p>
                <a href="{{ route('contracts.public.download', ['token' => $agreement->public_token]) }}">Download PDF kontrak</a>
            </p>
        </section>
    </main>
</body>
</html>
