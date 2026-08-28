<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>Kontrak {{ $agreement->agreement_number }}</title>
    <style>
        @page { margin: 24px 34px; }
        body { font-family: DejaVu Sans, sans-serif; color: #111827; font-size: 12px; line-height: 1.45; }
        h1, h2, h3 { margin: 0; }
        .watermark { position: fixed; top: 285px; left: 0; right: 0; text-align: center; opacity: .07; }
        .watermark img { width: 310px; max-height: 310px; }
        .header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
        .brand { width: 58%; display: inline-block; vertical-align: top; }
        .brand-text { width: 100%; display: inline-block; vertical-align: top; padding-top: 7px; }
        .brand-text h2 { font-size: 15px; letter-spacing: .2px; }
        .box { width: 38%; display: inline-block; vertical-align: top; border: 2px solid #111827; padding: 8px; text-align: center; font-weight: bold; font-size: 10.5px; line-height: 1.4; }
        .title { text-align: center; margin: 16px 0 18px; }
        .title h1 { font-size: 17px; text-decoration: underline; }
        .title p { margin: 6px 0 0; }
        .field-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
        .field-table td { border: 0; padding: 0 0 3px; vertical-align: top; }
        .field-label { width: 155px; }
        .field-colon { width: 14px; text-align: center; }
        .field-value { line-height: 1.45; }
        .paragraph { text-align: justify; margin: 9px 0; }
        .article { text-align: center; margin: 13px 0 7px; font-weight: bold; }
        ol { margin: 6px 0 8px 20px; padding: 0; }
        li { margin-bottom: 5px; text-align: justify; }
        .page-break { page-break-before: always; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d1d5db; padding: 7px; vertical-align: top; }
        th { background: #f3f4f6; text-align: left; }
        .muted { color: #6b7280; }
        .photos { margin-top: 12px; page-break-inside: avoid; }
        .photo { display: inline-block; width: 31%; min-height: 142px; border: 1px solid #d1d5db; margin: 0 1% 10px 0; text-align: center; padding: 6px; vertical-align: top; page-break-inside: avoid; }
        .photo-title { font-weight: bold; font-size: 10px; margin-bottom: 5px; }
        .photo img { max-width: 100%; max-height: 128px; }
        .photo-placeholder { min-height: 105px; padding: 20px 6px 0; color: #6b7280; font-size: 10px; background: #f9fafb; }
        .signature { margin-top: 22px; page-break-inside: avoid; }
        .signature-table { width: 100%; border-collapse: collapse; table-layout: fixed; page-break-inside: avoid; }
        .signature-table td { width: 50%; border: 0; padding: 0 18px; text-align: center; vertical-align: top; }
        .signature-party-title { display: block; font-weight: bold; font-size: 12px; white-space: nowrap; margin-bottom: 2px; }
        .signature-party-subtitle { display: block; min-height: 18px; margin-bottom: 8px; }
        .signature-signer { margin-top: 6px; }
        .signature-statement { max-width: 270px; margin: 5px auto 0; line-height: 1.45; }
        .qr { display: block; width: 100px; height: 100px; margin: 8px auto 14px; }
        .verify-line { margin-top: 14px; word-break: break-all; overflow-wrap: break-word; }
        .small { font-size: 10px; }
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
            <div class="brand-text">
                <h2>{{ $customerData['company_name'] ?? 'PT. RUMAH KITA NETWORK' }}</h2>
                <div>Internet Service Provider</div>
                <div>Networking & Maintenance</div>
            </div>
        </div>
        <div class="box">
            <div>{{ $customerData['company_address'] ?: 'Dusun Kebun Agung Selatan RT.07 RW.01, Kec. Kalianda, Kabupaten Lampung Selatan, Lampung 35551' }}</div>
            <div>HP. {{ $customerData['company_phone'] ?? '-' }}</div>
            <div>{{ $customerData['company_email'] ?? '' }}</div>
        </div>
    </div>

    <div class="title">
        <h1>SURAT PERJANJIAN BERLANGGANAN LAYANAN INTERNET</h1>
        <p>No. {{ $agreement->agreement_number }}</p>
    </div>

    <p class="paragraph">Saya yang bertanda tangan di bawah ini:</p>
    <table class="field-table">
        <tr><td class="field-label">Nama Perusahaan</td><td class="field-colon">:</td><td class="field-value">{{ $customerData['company_name'] ?? 'PT. Rumah Kita Network' }}</td></tr>
        <tr><td class="field-label">Alamat</td><td class="field-colon">:</td><td class="field-value">{{ $customerData['company_address'] ?: '-' }}</td></tr>
        <tr><td class="field-label">Telepon</td><td class="field-colon">:</td><td class="field-value">{{ $customerData['company_phone'] ?? '-' }}</td></tr>
    </table>
    <p class="paragraph">Dalam hal ini bertindak untuk dan atas nama {{ $customerData['company_name'] ?? 'PT. Rumah Kita Network' }}, selanjutnya disebut sebagai <strong>PIHAK PERTAMA</strong>.</p>

    <table class="field-table">
        <tr><td class="field-label">Nama Pelanggan</td><td class="field-colon">:</td><td class="field-value">{{ $customerData['customer_name'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Nomor KTP</td><td class="field-colon">:</td><td class="field-value">{{ $customerData['ktp_number'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Alamat</td><td class="field-colon">:</td><td class="field-value">{{ $customerData['address'] ?? '-' }}</td></tr>
        <tr><td class="field-label">Nomor HP/WA</td><td class="field-colon">:</td><td class="field-value">{{ $customerData['phone'] ?? '-' }}</td></tr>
    </table>
    <p class="paragraph">Dalam hal ini bertindak sebagai pelanggan, selanjutnya disebut sebagai <strong>PIHAK KEDUA</strong>.</p>
    <p class="paragraph">Kedua belah pihak sepakat mengadakan perjanjian berlangganan layanan internet dengan ketentuan sebagai berikut:</p>

    <div class="article">PASAL 1<br>OBJEK PERJANJIAN</div>
    <ol>
        <li>PIHAK PERTAMA menyediakan layanan akses internet kepada PIHAK KEDUA sesuai paket yang dipilih.</li>
        <li>Paket layanan, biaya, tanggal aktivasi, dan data teknis dicantumkan pada lampiran kontrak ini.</li>
        <li>Masa aktif layanan internet adalah 30 hari kalender sejak tanggal aktivasi atau pembayaran terakhir.</li>
    </ol>

    <div class="article">PASAL 2<br>KEPEMILIKAN DAN PENGGUNAAN PERANGKAT</div>
    <ol>
        <li>Seluruh perangkat yang dipasang di lokasi pelanggan merupakan milik PIHAK PERTAMA kecuali dinyatakan lain secara tertulis.</li>
        <li>PIHAK KEDUA hanya diberikan hak menggunakan atau meminjam perangkat selama masih berlangganan.</li>
        <li>PIHAK KEDUA dilarang menjual, menggadaikan, memindahtangankan, membongkar, memodifikasi, atau mengubah konfigurasi perangkat tanpa persetujuan PIHAK PERTAMA.</li>
        <li>Seluruh perangkat wajib dikembalikan apabila layanan berakhir atau dihentikan.</li>
    </ol>

    <div class="article">PASAL 3<br>HAK DAN KEWAJIBAN</div>
    <ol>
        <li>PIHAK PERTAMA wajib menyediakan layanan internet sesuai paket dan melakukan pemeliharaan jaringan apabila diperlukan.</li>
        <li>PIHAK PERTAMA berhak menonaktifkan layanan apabila PIHAK KEDUA tidak memenuhi kewajiban pembayaran.</li>
        <li>PIHAK KEDUA wajib membayar biaya berlangganan tepat waktu, menjaga perangkat, dan memberi akses kepada petugas untuk pemeriksaan, perbaikan, atau pengambilan perangkat.</li>
        <li>PIHAK KEDUA bertanggung jawab atas kehilangan atau kerusakan perangkat akibat kelalaian.</li>
    </ol>

    <div class="article">PASAL 4<br>PEMBAYARAN, GANGGUAN, DAN PENUTUP</div>
    <ol>
        <li>Sistem berlangganan menggunakan sistem prabayar dan pembayaran yang telah dilakukan tidak dapat diminta kembali.</li>
        <li>Apabila pelanggan tidak aktif selama 2 bulan berturut-turut, PIHAK PERTAMA berhak menghentikan layanan dan mengambil kembali perangkat.</li>
        <li>PIHAK PERTAMA tidak bertanggung jawab atas gangguan karena listrik pelanggan, bencana alam, kerusakan instalasi milik pelanggan, pihak ketiga, atau modifikasi tanpa izin.</li>
        <li>Perjanjian ini berlaku sejak ditandatangani secara digital dan selama PIHAK KEDUA menggunakan layanan PIHAK PERTAMA.</li>
    </ol>

    <div class="page-break"></div>
    <div class="title">
        <h1>LAMPIRAN DATA PELANGGAN DAN PERANGKAT</h1>
        <p>No. {{ $agreement->agreement_number }}</p>
    </div>

    <table>
        <tr><th colspan="2">Data Pelanggan</th></tr>
        <tr><td>Nama</td><td>{{ $customerData['customer_name'] ?? '-' }}</td></tr>
        <tr><td>Nomor KTP</td><td>{{ $customerData['ktp_number'] ?? '-' }}</td></tr>
        <tr><td>Nomor HP/WA</td><td>{{ $customerData['phone'] ?? '-' }}</td></tr>
        <tr><td>Alamat</td><td>{{ $customerData['address'] ?? '-' }}</td></tr>
        <tr><td>Koordinat Rumah</td><td>{{ ($customerData['latitude'] ?? null) && ($customerData['longitude'] ?? null) ? ($customerData['latitude'] . ', ' . $customerData['longitude']) : '-' }}</td></tr>
        <tr><th colspan="2">Data Layanan dan Perangkat</th></tr>
        <tr><td>Paket</td><td>{{ $deviceData['package_name'] ?? '-' }} {{ $deviceData['package_speed'] ? '(' . $deviceData['package_speed'] . ')' : '' }}</td></tr>
        <tr><td>Biaya Paket</td><td>{{ isset($deviceData['package_price']) ? 'Rp ' . number_format((float) $deviceData['package_price'], 0, ',', '.') : '-' }}</td></tr>
        <tr><td>Biaya Pemasangan</td><td>{{ isset($deviceData['installation_fee']) ? 'Rp ' . number_format((float) $deviceData['installation_fee'], 0, ',', '.') : '-' }}</td></tr>
        <tr><td>Tanggal Aktivasi</td><td>{{ $customerData['activation_date'] ?? '-' }}</td></tr>
        <tr><td>ODP</td><td>{{ $deviceData['odp'] ?? '-' }}</td></tr>
        <tr><td>Username PPPoE</td><td>{{ $deviceData['pppoe_username'] ?? '-' }}</td></tr>
        <tr><td>Profile MikroTik</td><td>{{ $deviceData['mikrotik_profile'] ?? '-' }}</td></tr>
        <tr><td>MAC Address Router/ONU</td><td>{{ $deviceData['router_mac_address'] ?? '-' }}</td></tr>
        <tr><td>Serial Number Perangkat</td><td>{{ $deviceData['device_serial_number'] ?? '-' }}</td></tr>
        <tr><td>Catatan Perangkat</td><td>{{ $deviceData['device_notes'] ?? '-' }}</td></tr>
    </table>

    <div class="photos">
        <h3>Foto Instalasi / Perangkat</h3>
        @foreach ($sheetPhotos as $photo)
            <div class="photo">
                <div class="photo-title">{{ $photo['label'] ?? 'Foto' }}</div>
                @if (!empty($photo['is_image']))
                    <img src="{{ $photo['data_uri'] }}" alt="{{ $photo['label'] ?? 'Foto' }}">
                @else
                    <div class="photo-placeholder">{{ $photo['error'] ?? 'Foto tidak dapat dimuat, pastikan akses Google Drive publik.' }}</div>
                @endif
            </div>
        @endforeach
        @forelse ($attachments as $attachment)
            <div class="photo">
                <div class="photo-title">Foto Tambahan</div>
                @if ($attachment['is_image'])
                    <img src="{{ $attachment['data_uri'] }}" alt="Foto Instalasi">
                @else
                    <div class="muted">Lampiran: {{ $attachment['path'] }}</div>
                @endif
            </div>
        @empty
            @if (empty($sheetPhotos))
                <p class="muted">Belum ada foto instalasi/perangkat yang dilampirkan.</p>
            @endif
        @endforelse
    </div>

    <div class="signature">
        <table class="signature-table">
            <tr>
                <td>
                    <span class="signature-party-title">PIHAK PERTAMA</span>
                    <span class="signature-party-subtitle">{{ $customerData['company_name'] ?? 'PT. Rumah Kita Network' }}</span>
                    @if (!empty($signatureMeta['company']['qr']))
                        <img class="qr" src="{{ $signatureMeta['company']['qr'] }}" alt="QR Tanda Tangan PT">
                    @endif
                    <div class="signature-signer">{{ $signatureMeta['company']['signer'] ?? 'Idza Ramaulkim' }}</div>
                    <div class="small signature-statement">{{ $signatureMeta['company']['statement'] ?? '' }}</div>
                </td>
                <td>
                    <span class="signature-party-title">PIHAK KEDUA</span>
                    <span class="signature-party-subtitle">Pelanggan</span>
                    @if (!empty($signatureMeta['customer']['qr']))
                        <img class="qr" src="{{ $signatureMeta['customer']['qr'] }}" alt="QR Tanda Tangan Pelanggan">
                    @endif
                    <div class="signature-signer">{{ $customerData['customer_name'] ?? '-' }}</div>
                    <div class="small signature-statement">{{ $signatureMeta['customer']['statement'] ?? '' }}</div>
                </td>
            </tr>
        </table>
    </div>

    <p class="small muted verify-line">Verifikasi dokumen: {{ $signatureMeta['verify_url'] ?? '-' }}</p>
</body>
</html>
