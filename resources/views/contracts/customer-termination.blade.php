<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>Surat Copot {{ $termination->document_number }}</title>
    <style>
        @page { margin: 28px 38px; }
        body { font-family: DejaVu Sans, sans-serif; color: #111827; font-size: 12px; line-height: 1.5; }
        h1, h2, h3, p { margin: 0; }
        .watermark { position: fixed; top: 285px; left: 0; right: 0; text-align: center; opacity: .07; }
        .watermark img { width: 310px; max-height: 310px; }
        .header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 20px; }
        .brand { width: 58%; display: inline-block; vertical-align: top; padding-top: 7px; }
        .brand h2 { font-size: 16px; letter-spacing: .2px; }
        .box { width: 38%; display: inline-block; vertical-align: top; border: 2px solid #111827; padding: 8px; text-align: center; font-weight: bold; font-size: 10.5px; line-height: 1.4; }
        .title { text-align: center; margin: 18px 0; }
        .title h1 { font-size: 17px; text-decoration: underline; }
        .title p { margin-top: 6px; }
        .paragraph { margin: 10px 0; text-align: justify; }
        .field-table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
        .field-table td { border: 0; padding: 0 0 4px; vertical-align: top; }
        .field-label { width: 165px; }
        .field-colon { width: 14px; text-align: center; }
        .section-title { margin: 16px 0 8px; font-weight: bold; }
        .notice { border: 1px solid #f59e0b; background: #fffbeb; padding: 10px 12px; border-radius: 6px; margin: 12px 0; }
        .signature { margin-top: 28px; page-break-inside: avoid; }
        .signature-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .signature-table td { width: 50%; border: 0; padding: 0 18px; text-align: center; vertical-align: top; }
        .qr { display: block; width: 105px; height: 105px; margin: 8px auto 12px; }
        .small { font-size: 10px; }
        .muted { color: #6b7280; }
        .verify-line { margin-top: 14px; word-break: break-all; overflow-wrap: break-word; }
    </style>
</head>
<body>
    @if (!empty($logoDataUri))
        <div class="watermark">
            <img src="{{ $logoDataUri }}" alt="Logo Background">
        </div>
    @endif

    <div class="header">
        <div class="brand">
            <h2>PT. RUMAH KITA NETWORK</h2>
            <div>Internet Service Provider</div>
            <div>Networking & Maintenance</div>
        </div>
        <div class="box">
            <div>Dusun Kebun Agung Selatan No.RT.07, rw01, Kec. Kalianda, Kabupaten Lampung Selatan, Lampung 35551</div>
            <div>HP. 085158025553</div>
        </div>
    </div>

    <div class="title">
        <h1>SURAT PENGINGAT COPOT PEMASANGAN</h1>
        <p>No. {{ $termination->document_number }}</p>
    </div>

    <p class="paragraph">
        Dengan ini PT. Rumah Kita Network menyampaikan pemberitahuan rencana pencopotan layanan dan penarikan perangkat kepada pelanggan berikut:
    </p>

    <table class="field-table">
        <tr><td class="field-label">Nama Pelanggan</td><td class="field-colon">:</td><td>{{ $customerData['customer_name'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Nomor HP/WA</td><td class="field-colon">:</td><td>{{ $customerData['phone'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Alamat</td><td class="field-colon">:</td><td>{{ $customerData['address'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Wilayah</td><td class="field-colon">:</td><td>{{ $customerData['region'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Username PPPoE</td><td class="field-colon">:</td><td>{{ $customerData['pppoe_username'] ?? '-' }}</td></tr>
    </table>

    <div class="section-title">Data Layanan dan Perangkat</div>
    <table class="field-table">
        <tr><td class="field-label">Paket</td><td class="field-colon">:</td><td>{{ $deviceData['package_name'] ?? '-' }}</td></tr>
        <tr><td class="field-label">ODP</td><td class="field-colon">:</td><td>{{ $deviceData['odp'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Profile MikroTik</td><td class="field-colon">:</td><td>{{ $deviceData['mikrotik_profile'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Router/Host</td><td class="field-colon">:</td><td>{{ $deviceData['router_type'] ?? '-' }} {{ $deviceData['router_host'] ? '(' . $deviceData['router_host'] . ')' : '' }}</td></tr>
    </table>

    <div class="section-title">Rencana Tindakan</div>
    <table class="field-table">
        <tr><td class="field-label">Tanggal Rencana</td><td class="field-colon">:</td><td>{{ optional($termination->planned_termination_date)->format('Y-m-d') ?: '-' }}</td></tr>
        <tr><td class="field-label">Alasan</td><td class="field-colon">:</td><td>{{ $termination->reason ?: '-' }}</td></tr>
        <tr><td class="field-label">Catatan Perangkat</td><td class="field-colon">:</td><td>{{ $termination->device_notes ?: '-' }}</td></tr>
        <tr><td class="field-label">Instruksi</td><td class="field-colon">:</td><td>{{ $termination->return_instructions ?: '-' }}</td></tr>
    </table>

    <div class="notice">
        Surat ini adalah pengingat awal. Layanan pelanggan belum dinonaktifkan sampai admin melakukan verifikasi final copot pemasangan di sistem.
    </div>

    <p class="paragraph">
        Pelanggan dimohon menyelesaikan kewajiban tertunda apabila ada, menjaga perangkat tetap dalam kondisi baik, dan memberi akses kepada petugas untuk pemeriksaan atau pengambilan perangkat.
    </p>

    <div class="signature">
        <table class="signature-table">
            <tr>
                <td>
                    <strong>PIHAK PERTAMA</strong><br>
                    PT. RUMAH KITA NETWORK
                    @if (!empty($signatureMeta['qr']))
                        <img class="qr" src="{{ $signatureMeta['qr'] }}" alt="QR Verifikasi Surat">
                    @endif
                    <div>Idza Ramaulkim</div>
                    <div class="small">Direktur Utama</div>
                </td>
                <td>
                    <strong>PIHAK KEDUA</strong><br>
                    Pelanggan
                    <div style="height: 125px;"></div>
                    <div>{{ $customerData['customer_name'] ?? '-' }}</div>
                    <div class="small">Penerima pemberitahuan</div>
                </td>
            </tr>
        </table>
    </div>

    <p class="small muted verify-line">Verifikasi dokumen: {{ $signatureMeta['verify_url'] ?? '-' }}</p>
</body>
</html>
