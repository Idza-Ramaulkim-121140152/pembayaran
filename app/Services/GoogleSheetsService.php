<?php

namespace App\Services;

use Google\Auth\Credentials\ServiceAccountCredentials;
use GuzzleHttp\Client as HttpClient;
use Exception;
use App\Models\Customer;

class GoogleSheetsService
{
    private $httpClient;
    private $accessToken;
    private $spreadsheetId;
    private $range;
    private $skipRows;

    public function __construct()
    {
        if (!config('google.enabled', false)) {
            throw new \Exception('Google Sheets integration is not enabled');
        }

        $this->spreadsheetId = config('google.spreadsheet_id');
        $this->range = config('google.range', 'Sheet1!A:R');
        $this->skipRows = (int) config('google.skip_rows', 0); // Skip old data rows

        $credentialsPath = config('google.credentials_path', storage_path('app/google-sheets-credentials.json'));
        
        if (!file_exists($credentialsPath)) {
            throw new Exception('Google Sheets credentials file not found: ' . $credentialsPath);
        }

        $this->httpClient = new HttpClient();
        $this->accessToken = $this->getAccessToken($credentialsPath);
    }

    /**
     * Get OAuth2 access token using service account credentials
     */
    private function getAccessToken($credentialsPath)
    {
        $credentials = json_decode(file_get_contents($credentialsPath), true);
        
        $scope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
        
        $serviceAccount = new ServiceAccountCredentials($scope, $credentials);
        $token = $serviceAccount->fetchAuthToken();
        
        if (isset($token['access_token'])) {
            return $token['access_token'];
        }
        
        throw new Exception('Failed to get access token');
    }

    /**
     * Fetch all customer data from Google Sheets using REST API
     * 
     * @return array
     */
    public function fetchAllCustomers()
    {
        try {
            $url = "https://sheets.googleapis.com/v4/spreadsheets/{$this->spreadsheetId}/values/{$this->range}";
            
            $response = $this->httpClient->get($url, [
                'headers' => [
                    'Authorization' => 'Bearer ' . $this->accessToken,
                    'Accept' => 'application/json',
                ]
            ]);
            
            $data = json_decode($response->getBody()->getContents(), true);
            
            if (!isset($data['values']) || empty($data['values'])) {
                return [];
            }

            $rows = $data['values'];
            $headers = array_shift($rows); // First row as headers
            
            // Skip old data rows based on configuration
            if ($this->skipRows > 0) {
                $rows = array_slice($rows, $this->skipRows);
                $startRow = $this->skipRows + 2; // +2 because: +1 for header, +1 for 1-based index
            } else {
                $startRow = 2; // Start from row 2 (after header)
            }
            
            $customers = [];
            $rowNumber = $startRow;
            
            foreach ($rows as $row) {
                // Ensure row has same column count as headers
                $row = array_pad($row, count($headers), '');
                $customer = array_combine($headers, $row);
                
                // Normalize keys to match our expected format
                $normalizedCustomer = [];
                foreach ($customer as $key => $value) {
                    $normalizedKey = $this->normalizeKey($key);
                    $normalizedCustomer[$normalizedKey] = $value;
                }
                
                // Process tanggal_aktivasi if only day number
                if (isset($normalizedCustomer['tanggal_aktivasi'])) {
                    $tanggal = $normalizedCustomer['tanggal_aktivasi'];
                    // If it's just a number (day only), construct full date
                    if (is_numeric($tanggal) || ctype_digit(trim($tanggal))) {
                        $day = (int) $tanggal;
                        $normalizedCustomer['tanggal_aktivasi'] = now()->year . '-' . str_pad(now()->month, 2, '0', STR_PAD_LEFT) . '-' . str_pad($day, 2, '0', STR_PAD_LEFT);
                    }
                }
                
                // Add row number for debugging
                $normalizedCustomer['_row_number'] = $rowNumber;
                
                $customers[] = $normalizedCustomer;
                $rowNumber++;
            }

            return $customers;
        } catch (Exception $e) {
            \Log::error('Google Sheets fetch error: ' . $e->getMessage());
            throw new Exception('Failed to fetch data from Google Sheets: ' . $e->getMessage());
        }
    }

    /**
     * Fetch customers that haven't been verified yet (not in database)
     * 
     * @return array
     */
    public function fetchPendingCustomers()
    {
        $allCustomers = $this->fetchAllCustomers();
        $pendingCustomers = [];

        foreach ($allCustomers as $customer) {
            // Check if customer already exists in database by timestamp
            if (!empty($customer['timestamp'])) {
                $exists = Customer::where('google_sheets_timestamp', $customer['timestamp'])->exists();
                
                if (!$exists) {
                    $pendingCustomers[] = $customer;
                }
            }
        }

        return $pendingCustomers;
    }

    /**
     * Get a specific customer by timestamp
     * 
     * @param string $timestamp
     * @return array|null
     */
    public function getCustomerByTimestamp($timestamp)
    {
        $allCustomers = $this->fetchAllCustomers();
        
        foreach ($allCustomers as $customer) {
            if (isset($customer['timestamp']) && $customer['timestamp'] === $timestamp) {
                return $customer;
            }
        }
        
        return null;
    }

    /**
     * Convert Google Sheets data format to Customer model format
     * 
     * @param array $sheetsData
     * @return array
     */
    public function convertToCustomerData($sheetsData)
    {
        // Combine desa and dusun for alamat if alamat is not provided
        $alamat = $sheetsData['alamat'] ?? '';
        if (empty($alamat)) {
            $desa = $sheetsData['desa'] ?? '';
            $dusun = $sheetsData['dusun'] ?? '';
            $alamat = trim("$dusun, $desa", ', ');
        }
        
        // Handle paket - use paket_custom if jenis_paket is custom
        $paket = $sheetsData['paket'] ?? '';
        if (stripos($paket, 'custom') !== false && !empty($sheetsData['paket_custom'])) {
            $paket = $sheetsData['paket_custom'];
        }
        
        // Handle tanggal aktivasi - if only day number (e.g., "17"), use current month/year
        $tanggalAktivasi = $sheetsData['tanggal_aktivasi'] ?? null;
        if ($tanggalAktivasi) {
            // If it's just a number (day only), construct full date with current month/year
            if (is_numeric($tanggalAktivasi) || ctype_digit(trim($tanggalAktivasi))) {
                $day = (int) $tanggalAktivasi;
                $tanggalAktivasi = now()->year . '-' . str_pad(now()->month, 2, '0', STR_PAD_LEFT) . '-' . str_pad($day, 2, '0', STR_PAD_LEFT);
            }
            // Try to parse as date
            else {
                try {
                    $date = \Carbon\Carbon::parse($tanggalAktivasi);
                    $tanggalAktivasi = $date->format('Y-m-d');
                } catch (\Exception $e) {
                    // If parsing fails, use today
                    $tanggalAktivasi = now()->format('Y-m-d');
                }
            }
        } else {
            $tanggalAktivasi = now()->format('Y-m-d');
        }
        
        // Extract area_code from username PPPoE (first 3 letters before dash)
        $userPppoe = $sheetsData['user_pppoe'] ?? '';
        $areaCode = '';
        if ($userPppoe && strpos($userPppoe, '-') !== false) {
            $parts = explode('-', $userPppoe);
            $areaCode = strtoupper(substr($parts[0], 0, 3));
        }
        
        // Calculate due date (+30 days from activation date)
        $dueDate = '';
        if ($tanggalAktivasi) {
            try {
                $activationDate = \Carbon\Carbon::parse($tanggalAktivasi);
                $dueDate = $activationDate->addDays(30)->format('Y-m-d');
            } catch (\Exception $e) {
                $dueDate = now()->addDays(30)->format('Y-m-d');
            }
        }
        
        // Map gender from Indonesian to English
        $gender = '';
        $jenisKelamin = strtolower($sheetsData['jenis_kelamin'] ?? '');
        if (stripos($jenisKelamin, 'laki') !== false) {
            $gender = 'male';
        } elseif (stripos($jenisKelamin, 'perempuan') !== false || stripos($jenisKelamin, 'wanita') !== false) {
            $gender = 'female';
        }
        
        return [
            // Map to frontend field names
            'google_sheets_timestamp' => $sheetsData['timestamp'] ?? '',
            'name' => $sheetsData['nama'] ?? '',
            'area_code' => $areaCode,
            'email' => '', // Not in Google Sheets
            'phone' => $sheetsData['no_telp'] ?? '',
            'address' => $alamat,
            'gender' => $gender,
            'package_type' => $paket,
            'custom_package' => $sheetsData['paket_custom'] ?? '',
            'activation_date' => $tanggalAktivasi,
            'due_date' => $dueDate,
            'pppoe_username' => $userPppoe,
            'pppoe_password' => $sheetsData['password_pppoe'] ?? '', // Keep for PPPoE secret creation
            'odp' => $sheetsData['odp'] ?? '',
            'installation_fee' => isset($sheetsData['harga']) ? (int) str_replace(['Rp', '.', ',', ' '], '', $sheetsData['harga']) : 0,
            'is_active' => true,
            'latitude' => $sheetsData['latitude'] ?? '',
            'longitude' => $sheetsData['longitude'] ?? '',
            
            // Sensitive data references (not stored in database, just for display)
            'nik_url' => $sheetsData['nik'] ?? '',
            'photo_ktp_url' => $sheetsData['foto_ktp'] ?? '',
            'photo_front_url' => $sheetsData['foto_depan_rumah'] ?? '',
            'photo_opm_url' => $sheetsData['foto_opm'] ?? '',
            'photo_modem_url' => $sheetsData['foto_modem'] ?? '',
        ];
    }

    /**
     * Normalize header key from Indonesian column name to snake_case
     * 
     * @param string $header
     * @return string
     */
    private function normalizeKey($header)
    {
        $mapping = [
            'Timestamp' => 'timestamp',
            'Nama Pelanggan' => 'nama',
            'Nama Lengkap' => 'nama',
            'NIK Pelanggan' => 'nik',
            'NIK' => 'nik',
            'Alamat Lengkap' => 'alamat',
            'Desa' => 'desa',
            'Dusun' => 'dusun',
            'Nomor Telepon' => 'no_telp',
            'Nomor WhatsApp' => 'no_telp',
            'Username PPPoE' => 'user_pppoe',
            'Password PPPoE' => 'password_pppoe',
            'Paket Internet' => 'paket',
            'Jenis Paket' => 'paket',
            'Paket Custom' => 'paket_custom',
            'Harga Paket' => 'harga',
            'Biaya Pemasangan (contoh: 250000)' => 'harga',
            'ODP' => 'odp',
            'Latitude' => 'latitude',
            'Longitude' => 'longitude',
            'Tanggal Aktivasi' => 'tanggal_aktivasi',
            'Foto KTP' => 'foto_ktp',
            'Poto KTP' => 'foto_ktp',
            'Foto Depan Rumah' => 'foto_depan_rumah',
            'Poto Depan Rumah' => 'foto_depan_rumah',
            'Foto OPM' => 'foto_opm',
            'Poto Redaman OPM' => 'foto_opm',
            'Foto Modem' => 'foto_modem',
            'Poto Modem' => 'foto_modem',
            'Jenis Kelamin Pelanggan' => 'jenis_kelamin',
        ];

        return $mapping[$header] ?? strtolower(str_replace(' ', '_', $header));
    }
}
