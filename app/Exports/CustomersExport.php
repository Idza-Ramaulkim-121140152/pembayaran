<?php

namespace App\Exports;

use App\Models\Customer;
use App\Services\MikroTikService;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class CustomersExport
{
    public function export()
    {
        // Get all customers
        $customers = Customer::orderBy('is_active', 'desc')
            ->orderBy('name', 'asc')
            ->get();

        // Get isolated users from MikroTik
        $isolatedUsers = $this->getIsolatedUsers();

        // Create new Spreadsheet
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();

        // Set header
        $headers = [
            'Nomor',
            'Nama Pelanggan',
            'NIK',
            'Alamat',
            'Jenis Kelamin',
            'Tanggal Aktivasi',
            'Aktif Sampai (Jatuh Tempo)',
            'Nomor WA',
            'Paket',
            'Biaya Layanan',
            'Status'
        ];
        
        $sheet->fromArray($headers, null, 'A1');
        
        // Style header
        $headerStyle = [
            'font' => ['bold' => true],
            'fill' => [
                'fillType' => \PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID,
                'startColor' => ['rgb' => 'E2E8F0']
            ]
        ];
        $sheet->getStyle('A1:K1')->applyFromArray($headerStyle);

        // Fill data
        $row = 2;
        $no = 1;
        foreach ($customers as $customer) {
            // Check if customer is isolated
            $isIsolated = in_array($customer->pppoe_username, $isolatedUsers);
            $status = $isIsolated ? 'Nonaktif' : 'Aktif';

            $sheet->setCellValue('A' . $row, $no++);
            $sheet->setCellValue('B' . $row, $customer->name ?? '-');
            $sheet->setCellValue('C' . $row, $customer->nik ?? '-');
            $sheet->setCellValue('D' . $row, $customer->address ?? '-');
            $sheet->setCellValue('E' . $row, $customer->gender ?? '-');
            $sheet->setCellValue('F' . $row, $customer->activation_date ? date('d-m-Y', strtotime($customer->activation_date)) : '-');
            $sheet->setCellValue('G' . $row, $customer->due_date ?? '-');
            $sheet->setCellValue('H' . $row, $customer->phone ?? '-');
            $sheet->setCellValue('I' . $row, $customer->package_type ?? '-');
            $sheet->setCellValue('J' . $row, $customer->service_fee ?? '-');
            $sheet->setCellValue('K' . $row, $status);
            
            $row++;
        }

        // Auto-size columns
        foreach (range('A', 'K') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        return $spreadsheet;
    }

    private function getIsolatedUsers()
    {
        try {
            $mikrotik = new MikroTikService();
            $isolatedSecrets = $mikrotik->getIsolatedSecrets();
            
            return array_map(function($secret) {
                return $secret['name'];
            }, $isolatedSecrets);
        } catch (\Exception $e) {
            \Log::error('Failed to get isolated users', ['error' => $e->getMessage()]);
            return [];
        }
    }

    public function downloadExcel()
    {
        $spreadsheet = $this->export();
        
        // Generate filename
        $filename = 'Data Pelanggan Rumah Kita ' . date('d-m-Y') . '.xlsx';
        
        // Create writer
        $writer = new Xlsx($spreadsheet);
        
        // Save to temporary file
        $tempFile = tempnam(sys_get_temp_dir(), 'excel');
        $writer->save($tempFile);
        
        // Read file content
        $content = file_get_contents($tempFile);
        
        // Delete temporary file
        unlink($tempFile);
        
        return [
            'content' => $content,
            'filename' => $filename,
            'headers' => [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="' . $filename . '"',
                'Cache-Control' => 'max-age=0',
            ]
        ];
    }
}
