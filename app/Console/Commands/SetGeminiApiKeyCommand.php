<?php

namespace App\Console\Commands;

use App\Models\SiteSetting;
use App\Services\PaymentVerificationConfigService;
use Illuminate\Console\Command;

class SetGeminiApiKeyCommand extends Command
{
    protected $signature = 'billing:set-gemini-key {key : The Gemini API Key}';

    protected $description = 'Set Google Gemini API Key for payment verification in SiteSetting and .env';

    public function handle(PaymentVerificationConfigService $configService): int
    {
        $key = trim((string) $this->argument('key'));
        if ($key === '') {
            $this->error('API Key cannot be empty.');
            return 1;
        }

        // 1. Save in SiteSetting individual key
        SiteSetting::set('gemini_api_key', $key);
        SiteSetting::set('google_api_key', $key);

        // 2. Save in PaymentVerificationConfig JSON
        $stored = SiteSetting::get(PaymentVerificationConfigService::SETTING_KEY);
        $config = is_string($stored) ? (json_decode($stored, true) ?: []) : [];
        $config['gemini_api_key'] = $key;
        $config['gemini_model'] = 'gemini-3.5-flash';
        $config['ai_provider'] = 'auto';

        SiteSetting::set(
            PaymentVerificationConfigService::SETTING_KEY,
            json_encode($config, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );

        // 3. Update .env if accessible
        $envPath = base_path('.env');
        if (file_exists($envPath) && is_writable($envPath)) {
            $envContent = file_get_contents($envPath);
            if (preg_match('/^GEMINI_API_KEY=.*$/m', $envContent)) {
                $envContent = preg_replace('/^GEMINI_API_KEY=.*$/m', "GEMINI_API_KEY={$key}", $envContent);
            } else {
                $envContent .= "\nGEMINI_API_KEY={$key}\n";
            }
            file_put_contents($envPath, $envContent);
            $this->info('Updated GEMINI_API_KEY in .env file.');
        }

        $this->callSilent('config:clear');

        $this->info("✅ Google Gemini API Key berhasil disimpan ke database dan konfigurasi verifikasi pembayaran!");
        return 0;
    }
}
