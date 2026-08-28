<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
    <title>Invoice {{ $invoiceNumber }}</title>
    <style>
        @page { size: A4 landscape; margin: 0; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            background: #e9e9e9;
            color: #000;
            font-family: Arial, sans-serif;
        }
        .paper {
            position: relative;
            width: 100%;
            min-height: 100vh;
            padding: 16px 20px 14px;
            overflow: hidden;
            background: #e9e9e9;
        }
        .header-table,
        .meta-table,
        .signature-table {
            width: 100%;
            border-collapse: collapse;
        }
        .header-table td { vertical-align: top; }
        .brand-cell { width: 76%; }
        .company-table { border-collapse: collapse; }
        .company-table td { vertical-align: middle; }
        .logo {
            display: block;
            width: auto;
            height: 70px;
            margin-right: 14px;
        }
        .company-name {
            margin: 0;
            font-size: 32px;
            font-weight: 700;
            line-height: 1.05;
            white-space: nowrap;
        }
        .company-address {
            margin: 2px 0 0;
            font-size: 14px;
            line-height: 1.28;
        }
        .invoice-title {
            padding-top: 8px;
            text-align: right;
            font-size: 48px;
            font-weight: 700;
            letter-spacing: 1px;
            white-space: nowrap;
        }
        .line {
            margin-top: 8px;
            border-top: 4px solid #111;
        }
        .meta-table {
            margin-top: 14px;
            font-size: 14px;
            line-height: 1.3;
        }
        .meta-table > tbody > tr > td {
            width: 50%;
            padding-right: 22px;
            vertical-align: top;
        }
        .meta-detail {
            width: 100%;
            border-collapse: collapse;
        }
        .meta-detail td {
            padding: 1px 0;
            vertical-align: top;
        }
        .meta-detail .label { width: 105px; white-space: nowrap; }
        .meta-detail .sep { width: 14px; text-align: center; }
        .table-wrap {
            position: relative;
            margin-top: 12px;
            padding-bottom: 105px;
        }
        .watermark {
            position: absolute;
            top: 52%;
            left: 50%;
            z-index: 0;
            width: 310px;
            transform: translate(-50%, -50%);
            opacity: .12;
        }
        .watermark img { display: block; width: 100%; }
        .invoice-table {
            position: relative;
            z-index: 1;
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            border-right: 2px dashed #222;
            border-bottom: 2px dashed #222;
            border-left: 2px dashed #222;
            background: transparent;
            font-family: "Times New Roman", serif;
            font-size: 14px;
        }
        .invoice-table th,
        .invoice-table td {
            padding: 6px 7px;
            border-right: 2px dashed #222;
            vertical-align: top;
        }
        .invoice-table th:last-child,
        .invoice-table td:last-child { border-right: 0; }
        .invoice-table thead th {
            border-bottom: 2px dashed #222;
            text-align: left;
            font-weight: 700;
            white-space: nowrap;
        }
        .invoice-table tfoot td {
            border-top: 2px dashed #222;
            font-weight: 700;
        }
        .col-no { width: 4%; }
        .col-name { width: 43%; }
        .col-num { width: 17.67%; text-align: left; }
        .tfoot-label { text-align: right; }
        .signature {
            position: absolute;
            right: 35px;
            bottom: 22px;
            width: 300px;
            text-align: center;
        }
        .signature-title {
            margin-bottom: 2px;
            font-size: 14px;
            font-weight: 700;
        }
        .signature-qr {
            display: block;
            width: 82px;
            height: 82px;
            margin: 2px auto;
        }
        .signature-name {
            margin-top: 2px;
            font-size: 13px;
            font-weight: 700;
        }
        .signature-role,
        .signature-note {
            font-size: 10px;
            line-height: 1.25;
        }
        .signature-note { margin-top: 2px; color: #333; }
        @media screen {
            .paper {
                max-width: 1123px;
                min-height: 794px;
                margin: 0 auto;
            }
        }
        @media print {
            body, .paper { margin: 0; }
        }
    </style>
</head>
<body>
    <main class="paper">
        <table class="header-table">
            <tr>
                <td class="brand-cell">
                    <table class="company-table">
                        <tr>
                            <td>
                                @if ($logoDataUri)
                                    <img src="{{ $logoDataUri }}" alt="Rumah Kita Network" class="logo">
                                @endif
                            </td>
                            <td>
                                <p class="company-name">RUMAH KITA NETWORK</p>
                                <p class="company-address">Jl. H. M. Yunus, Kebun Agung Selatan, Desa Taman Agung, Kalianda, Lampung Selatan, Lampung</p>
                                <p class="company-address">Telp: +6285158025553</p>
                            </td>
                        </tr>
                    </table>
                </td>
                <td class="invoice-title">INVOICE</td>
            </tr>
        </table>

        <div class="line"></div>

        <table class="meta-table">
            <tr>
                <td>
                    <table class="meta-detail">
                        <tr><td class="label">Kepada Yth</td><td class="sep">:</td><td></td></tr>
                        <tr><td class="label">Nama</td><td class="sep">:</td><td>{{ $customer?->name ?? '-' }}</td></tr>
                        <tr><td class="label">Telp./HP</td><td class="sep">:</td><td>{{ $customer?->phone ?? '-' }}</td></tr>
                        <tr><td class="label">Alamat</td><td class="sep">:</td><td>{{ $customer?->address ?? '-' }}</td></tr>
                    </table>
                </td>
                <td>
                    <table class="meta-detail">
                        <tr><td class="label">No. Invoice</td><td class="sep">:</td><td>{{ $invoiceNumber }}</td></tr>
                        <tr><td class="label">Tanggal Inv.</td><td class="sep">:</td><td>{{ optional($invoice->invoice_date)->timezone('Asia/Jakarta')->translatedFormat('d F Y') ?? '-' }}</td></tr>
                        <tr><td class="label">Jatuh Tempo</td><td class="sep">:</td><td>{{ optional($invoice->due_date)->timezone('Asia/Jakarta')->translatedFormat('d F Y') ?? '-' }}</td></tr>
                        <tr><td class="label">Status</td><td class="sep">:</td><td>{{ strtoupper((string) $invoice->status) }}</td></tr>
                    </table>
                </td>
            </tr>
        </table>

        <div class="table-wrap">
            @if ($logoDataUri)
                <div class="watermark"><img src="{{ $logoDataUri }}" alt=""></div>
            @endif

            <table class="invoice-table">
                <thead>
                    <tr>
                        <th class="col-no">No</th>
                        <th class="col-name">Nama</th>
                        <th class="col-num">Harga</th>
                        <th class="col-num">PPN 11%</th>
                        <th class="col-num">Jumlah</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach ($rows as $index => $row)
                        <tr>
                            <td>{{ $index + 1 }}</td>
                            <td>{{ $row['name'] }}</td>
                            <td>Rp. {{ number_format($row['base'], 0, ',', '.') }}</td>
                            <td>Rp. {{ number_format($row['tax'], 0, ',', '.') }}</td>
                            <td>Rp. {{ number_format($row['gross'], 0, ',', '.') }}</td>
                        </tr>
                    @endforeach
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" class="tfoot-label">Jumlah</td>
                        <td>Rp. {{ number_format($baseTotal, 0, ',', '.') }}</td>
                        <td>Rp. {{ number_format($taxTotal, 0, ',', '.') }}</td>
                        <td>Rp. {{ number_format($grossTotal, 0, ',', '.') }}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <section class="signature">
            <div class="signature-title">RUMAH KITA NETWORK</div>
            @if (!empty($signatureMeta['qr']))
                <img class="signature-qr" src="{{ $signatureMeta['qr'] }}" alt="QR tanda tangan digital">
            @endif
            <div class="signature-name">{{ $signatureMeta['signer'] ?? 'Idza Ramaulkim' }}</div>
            <div class="signature-role">{{ $signatureMeta['role'] ?? 'Direktur Utama' }}</div>
            <div class="signature-note">Ditandatangani digital. Scan QR untuk verifikasi.</div>
        </section>
    </main>

    @if ($autoPrint)
        <script>
            window.addEventListener('load', () => {
                window.setTimeout(() => window.print(), 350);
            });
        </script>
    @endif
</body>
</html>
