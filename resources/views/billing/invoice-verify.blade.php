<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
    <title>Verifikasi Invoice {{ $invoice->invoice_link }}</title>
    <style>
        body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
        .wrap { max-width: 760px; margin: 40px auto; padding: 0 16px; }
        .card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px; box-shadow: 0 16px 40px rgba(15, 23, 42, .08); }
        .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; font-size: 12px; }
        h1 { margin: 14px 0 8px; font-size: 26px; }
        .grid { display: grid; grid-template-columns: 190px 1fr; gap: 10px; margin-top: 22px; }
        .label { color: #64748b; }
        .box { margin-top: 22px; padding: 16px; border-radius: 14px; background: #f1f5f9; }
        .hash { word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
        a { color: #2563eb; font-weight: 700; }
        @media (max-width: 640px) { .grid { grid-template-columns: 1fr; gap: 4px; } }
    </style>
</head>
<body>
    <main class="wrap">
        <section class="card">
            <span class="badge">DOKUMEN VALID</span>
            <h1>Verifikasi Invoice Digital</h1>
            <p>Dokumen ini tercatat dan diterbitkan oleh sistem Rumah Kita Network.</p>

            <div class="grid">
                <div class="label">Nomor Invoice</div><div><strong>{{ $invoice->invoice_link }}</strong></div>
                <div class="label">Nama Pelanggan</div><div>{{ $customer?->name ?? '-' }}</div>
                <div class="label">Nominal</div><div>Rp {{ number_format((float) $invoice->amount, 0, ',', '.') }}</div>
                <div class="label">Status</div><div>{{ strtoupper((string) $invoice->status) }}</div>
                <div class="label">Tanggal Invoice</div><div>{{ optional($invoice->invoice_date)->format('d/m/Y') ?? '-' }}</div>
                <div class="label">Jatuh Tempo</div><div>{{ optional($invoice->due_date)->format('d/m/Y') ?? '-' }}</div>
                <div class="label">Ditandatangani</div><div>{{ optional($invoice->document_generated_at)->timezone('Asia/Jakarta')->format('d/m/Y H:i') ?? '-' }} WIB</div>
                <div class="label">Hash PDF</div><div class="hash">{{ $invoice->pdf_hash ?? '-' }}</div>
            </div>

            <div class="box">
                <strong>{{ $signatureMeta['signer'] ?? 'Idza Ramaulkim' }}</strong>
                <div>{{ $signatureMeta['role'] ?? 'Direktur Utama' }}</div>
                <p>{{ $signatureMeta['statement'] ?? 'Invoice ini ditandatangani secara digital oleh Rumah Kita Network.' }}</p>
            </div>

            <p>
                <a href="{{ route('invoice-documents.public.download', ['token' => $invoice->document_token]) }}">Download PDF invoice</a>
            </p>
        </section>
    </main>
</body>
</html>
