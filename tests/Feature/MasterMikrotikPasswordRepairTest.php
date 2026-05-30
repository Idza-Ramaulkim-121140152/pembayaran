<?php

namespace Tests\Feature;

use App\Http\Controllers\MasterMikrotikController;
use App\Models\MasterMikrotik;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MasterMikrotikPasswordRepairTest extends TestCase
{
    use RefreshDatabase;

    public function test_update_without_password_keeps_valid_encrypted_value(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $router = MasterMikrotik::create([
            'name' => 'Router A',
            'host' => '192.168.88.1',
            'port' => 8728,
            'username' => 'admin',
            'password_encrypted' => 'initial-secret',
            'is_active' => true,
        ]);

        $controller = app(MasterMikrotikController::class);
        $request = Request::create('/api/master-mikrotik/' . $router->id, 'PUT', [
            'name' => 'Router A Updated',
            'host' => '192.168.88.1',
            'port' => 8728,
            'username' => 'admin',
            'is_active' => true,
        ]);

        $response = $controller->update($request, $router);
        $this->assertSame(200, $response->getStatusCode());

        $raw = (string) $router->fresh()->getRawOriginal('password_encrypted');
        $this->assertNotSame('', $raw);
        $this->assertSame('initial-secret', Crypt::decryptString($raw));
    }

    public function test_update_with_password_saves_single_encrypted_value(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        $router = MasterMikrotik::create([
            'name' => 'Router B',
            'host' => '192.168.88.2',
            'port' => 8728,
            'username' => 'admin',
            'password_encrypted' => 'old-secret',
            'is_active' => false,
        ]);

        $controller = app(MasterMikrotikController::class);
        $request = Request::create('/api/master-mikrotik/' . $router->id, 'PUT', [
            'name' => 'Router B',
            'host' => '192.168.88.2',
            'port' => 8728,
            'username' => 'admin',
            'password' => 'new-secret',
            'is_active' => false,
        ]);

        $response = $controller->update($request, $router);
        $this->assertSame(200, $response->getStatusCode());

        $raw = (string) $router->fresh()->getRawOriginal('password_encrypted');
        $firstDecrypt = Crypt::decryptString($raw);

        $this->assertSame('new-secret', $firstDecrypt);
        $this->assertFalse($this->looksLikeEncryptedPayload($firstDecrypt));
    }

    public function test_repair_command_fixes_double_encrypted_passwords_and_keeps_other_records_safe(): void
    {
        $normal = MasterMikrotik::create([
            'name' => 'Normal',
            'host' => '10.0.0.1',
            'port' => 8728,
            'username' => 'admin',
            'password_encrypted' => 'normal-secret',
            'is_active' => true,
        ]);

        $double = MasterMikrotik::create([
            'name' => 'Double',
            'host' => '10.0.0.2',
            'port' => 8728,
            'username' => 'admin',
            'password_encrypted' => 'placeholder',
            'is_active' => false,
        ]);

        DB::table('master_mikrotiks')
            ->where('id', $double->id)
            ->update([
                'password_encrypted' => Crypt::encryptString(Crypt::encryptString('double-secret')),
            ]);

        $broken = MasterMikrotik::create([
            'name' => 'Broken',
            'host' => '10.0.0.3',
            'port' => 8728,
            'username' => 'admin',
            'password_encrypted' => 'placeholder-2',
            'is_active' => false,
        ]);

        DB::table('master_mikrotiks')
            ->where('id', $broken->id)
            ->update(['password_encrypted' => 'not-valid-ciphertext']);

        $this->artisan('mikrotik:repair-passwords')
            ->expectsOutputToContain('[FIXED]')
            ->expectsOutputToContain('[SKIPPED]')
            ->expectsOutputToContain('[FAILED]')
            ->assertExitCode(1);

        $normalRaw = (string) MasterMikrotik::findOrFail($normal->id)->getRawOriginal('password_encrypted');
        $doubleRaw = (string) MasterMikrotik::findOrFail($double->id)->getRawOriginal('password_encrypted');
        $brokenRaw = (string) MasterMikrotik::findOrFail($broken->id)->getRawOriginal('password_encrypted');

        $this->assertSame('normal-secret', Crypt::decryptString($normalRaw));
        $this->assertSame('double-secret', Crypt::decryptString($doubleRaw));
        $this->assertFalse($this->looksLikeEncryptedPayload(Crypt::decryptString($doubleRaw)));
        $this->assertSame('not-valid-ciphertext', $brokenRaw);
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

