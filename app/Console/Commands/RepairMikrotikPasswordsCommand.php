<?php

namespace App\Console\Commands;

use App\Models\MasterMikrotik;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

class RepairMikrotikPasswordsCommand extends Command
{
    protected $signature = 'mikrotik:repair-passwords {--dry-run : Simulate repairs without writing changes}';

    protected $description = 'Repair double-encrypted MikroTik master passwords safely and idempotently.';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $routers = MasterMikrotik::query()->get();

        if ($routers->isEmpty()) {
            $this->info('No master MikroTik records found.');
            return self::SUCCESS;
        }

        $summary = [
            'fixed' => 0,
            'skipped' => 0,
            'failed' => 0,
        ];

        foreach ($routers as $router) {
            $result = $this->repairRouter($router, $dryRun);
            $summary[$result['status']]++;

            $line = sprintf(
                '[%s] #%d %s (%s:%d)%s',
                strtoupper($result['status']),
                $router->id,
                $router->name,
                $router->host,
                $router->port,
                $result['message'] ? ' - ' . $result['message'] : ''
            );

            if ($result['status'] === 'failed') {
                $this->error($line);
            } elseif ($result['status'] === 'fixed') {
                $this->info($line);
            } else {
                $this->line($line);
            }

            Log::info('mikrotik password repair result', [
                'router_id' => $router->id,
                'host' => $router->host,
                'port' => $router->port,
                'status' => $result['status'],
                'message' => $result['message'],
                'dry_run' => $dryRun,
            ]);
        }

        $this->newLine();
        $this->info(sprintf(
            'Summary: fixed=%d skipped=%d failed=%d%s',
            $summary['fixed'],
            $summary['skipped'],
            $summary['failed'],
            $dryRun ? ' (dry-run)' : ''
        ));

        return $summary['failed'] > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function repairRouter(MasterMikrotik $router, bool $dryRun): array
    {
        $raw = $router->getRawOriginal('password_encrypted');
        if (!is_string($raw) || trim($raw) === '') {
            return [
                'status' => 'skipped',
                'message' => 'empty_password',
            ];
        }

        try {
            $decrypted = Crypt::decryptString($raw);
        } catch (\Throwable $exception) {
            return [
                'status' => 'failed',
                'message' => 'decrypt_failed:' . $exception->getMessage(),
            ];
        }

        if (!$this->looksLikeEncryptedPayload($decrypted)) {
            return [
                'status' => 'skipped',
                'message' => 'already_single_encrypted',
            ];
        }

        try {
            $plainPassword = Crypt::decryptString($decrypted);
        } catch (\Throwable $exception) {
            return [
                'status' => 'failed',
                'message' => 'second_decrypt_failed:' . $exception->getMessage(),
            ];
        }

        if ($dryRun) {
            return [
                'status' => 'fixed',
                'message' => 'double_encrypted_detected',
            ];
        }

        // Set plaintext so encrypted cast stores proper single-encrypted payload.
        $router->password_encrypted = $plainPassword;
        $router->save();

        return [
            'status' => 'fixed',
            'message' => 'rewritten_single_encrypted',
        ];
    }

    private function looksLikeEncryptedPayload(string $value): bool
    {
        $decoded = base64_decode($value, true);
        if ($decoded === false) {
            return false;
        }

        $payload = json_decode($decoded, true);
        if (!is_array($payload)) {
            return false;
        }

        return isset($payload['iv'], $payload['value'], $payload['mac']);
    }
}

