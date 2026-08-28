<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MasterMikrotik;
use App\Models\Package;
use App\Models\SystemAuditLog;
use App\Models\User;
use App\Services\CustomerPackageMigrationService;
use App\Services\MikroTikService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerPackageMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_reports_empty_data_conflicts_and_create_candidates(): void
    {
        $fake = new FakeMigrationMikroTikService(
            profiles: ['Paket 200k'],
            secrets: [
                'EXIST-001' => ['name' => 'EXIST-001', 'profile' => 'Paket 200k'],
            ]
        );
        $this->app->instance(CustomerPackageMigrationService::class, new TestCustomerPackageMigrationService($fake));

        $router = $this->router();
        $package = $this->package('Gold', 'Paket 200k');
        $newProfilePackage = $this->package('Platinum', 'Paket 250k');

        $this->customer('Valid Customer', 'OK-001', $package);
        $this->customer('Conflict Customer', 'EXIST-001', $package);
        $this->customer('Empty Username', null, $package);
        $this->customer('New Profile', 'NEW-PROFILE-001', $newProfilePackage);
        Customer::create([
            'name' => 'Empty Profile',
            'phone' => '080000000005',
            'pppoe_username' => 'NO-PROFILE-001',
            'is_active' => false,
        ]);

        $response = $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPERADMIN]))
            ->getJson('/api/customer-package-migration/preview?router_id=' . $router->id)
            ->assertOk();

        $response->assertJsonPath('data.summary.total_pelanggan', 5)
            ->assertJsonPath('data.summary.profile_akan_dibuat', 1)
            ->assertJsonPath('data.summary.secret_sudah_ada_konflik', 1)
            ->assertJsonPath('data.summary.data_kosong', 2)
            ->assertJsonPath('data.summary.has_warnings', true);

        $this->assertDatabaseHas('system_audit_logs', [
            'event_type' => 'customer.package_migration.preview',
            'subject_type' => MasterMikrotik::class,
            'subject_id' => $router->id,
        ]);
    }

    public function test_run_creates_profiles_before_secrets_and_skips_existing_secret(): void
    {
        $fake = new FakeMigrationMikroTikService(
            profiles: ['Profile Existing'],
            secrets: [
                'EXIST-001' => ['name' => 'EXIST-001', 'profile' => 'Profile Existing'],
            ]
        );
        $this->app->instance(CustomerPackageMigrationService::class, new TestCustomerPackageMigrationService($fake));

        $router = $this->router();
        $newPackage = $this->package('New Package', 'Profile New');
        $existingPackage = $this->package('Existing Package', 'Profile Existing');

        $this->customer('Create Me', 'NEW-001', $newPackage);
        $this->customer('Already There', 'EXIST-001', $existingPackage);
        Customer::create([
            'name' => 'No Profile',
            'phone' => '080000000103',
            'pppoe_username' => 'NO-PROFILE-001',
            'is_active' => false,
        ]);

        $response = $this->actingAs(User::factory()->create(['role' => User::ROLE_SUPERADMIN]))
            ->postJson('/api/customer-package-migration/run', [
                'router_id' => $router->id,
                'confirm_warnings' => true,
            ])
            ->assertOk();

        $response->assertJsonPath('data.summary.profiles_created', 1)
            ->assertJsonPath('data.summary.secrets_created', 1)
            ->assertJsonPath('data.summary.secret_sudah_ada_konflik', 1)
            ->assertJsonPath('data.summary.data_kosong', 1);

        $profileAddIndex = $fake->operationIndex('profile_add', 'Profile New');
        $secretAddIndex = $fake->operationIndex('secret_add', 'NEW-001');

        $this->assertNotNull($profileAddIndex);
        $this->assertNotNull($secretAddIndex);
        $this->assertLessThan($secretAddIndex, $profileAddIndex);
        $this->assertNull($fake->operationIndex('secret_add', 'EXIST-001'));
        $this->assertSame('admin', $fake->secretPayloads['NEW-001']['password'] ?? null);

        $this->assertDatabaseHas('system_audit_logs', [
            'event_type' => 'customer.package_migration.run',
            'subject_type' => MasterMikrotik::class,
            'subject_id' => $router->id,
        ]);
    }

    public function test_non_superadmin_cannot_access_migration_endpoints(): void
    {
        $router = $this->router();

        $this->actingAs(User::factory()->create(['role' => User::ROLE_ADMIN]))
            ->getJson('/api/customer-package-migration/preview?router_id=' . $router->id)
            ->assertStatus(403);

        $this->actingAs(User::factory()->create(['role' => User::ROLE_TEKNISI]))
            ->postJson('/api/customer-package-migration/run', [
                'router_id' => $router->id,
                'confirm_warnings' => true,
            ])
            ->assertStatus(403);
    }

    private function router(): MasterMikrotik
    {
        return MasterMikrotik::create([
            'name' => 'Router Target',
            'host' => '10.0.0.1',
            'port' => 8728,
            'username' => 'admin',
            'password_encrypted' => 'secret',
            'is_active' => true,
        ]);
    }

    private function package(string $name, string $profile): Package
    {
        return Package::create([
            'name' => $name,
            'speed' => '20Mbps',
            'mikrotik_profile' => $profile,
            'price' => 200000,
            'features' => [],
            'is_active' => true,
        ]);
    }

    private function customer(string $name, ?string $username, Package $package): Customer
    {
        return Customer::create([
            'name' => $name,
            'phone' => '08' . str_pad((string) random_int(1, 99999999), 10, '0', STR_PAD_LEFT),
            'package_id' => $package->id,
            'package_type' => $package->name,
            'pppoe_username' => $username,
            'is_active' => true,
        ]);
    }
}

class TestCustomerPackageMigrationService extends CustomerPackageMigrationService
{
    public function __construct(private FakeMigrationMikroTikService $fake)
    {
    }

    protected function makeMikroTik(MasterMikrotik $router): MikroTikService
    {
        return $this->fake;
    }
}

class FakeMigrationMikroTikService extends MikroTikService
{
    public array $operations = [];
    public array $secretPayloads = [];

    private array $profiles;
    private array $secrets;
    private int $ipCounter = 10;

    public function __construct(array $profiles = [], array $secrets = [])
    {
        $this->profiles = array_values($profiles);
        $this->secrets = $secrets;
    }

    public function connect()
    {
        $this->operations[] = ['type' => 'connect'];

        return true;
    }

    public function disconnect()
    {
        $this->operations[] = ['type' => 'disconnect'];
    }

    public function command($command, $params = [], $forceFresh = false)
    {
        if ($command === '/ppp/profile/print') {
            return array_map(fn (string $name) => ['name' => $name], $this->profiles);
        }

        if ($command === '/ppp/profile/add') {
            $name = (string) ($params['name'] ?? '');
            $this->profiles[] = $name;
            $this->operations[] = ['type' => 'profile_add', 'name' => $name];

            return [['ret' => '*1']];
        }

        return [];
    }

    public function getAllPPPoESecrets()
    {
        return $this->secrets;
    }

    public function getNextIpAddress()
    {
        return '10.1.0.' . $this->ipCounter++;
    }

    public function createPPPoESecret($name, $password, $service, $profile, $remoteAddress)
    {
        if (isset($this->secrets[$name])) {
            throw new \Exception("Username '{$name}' sudah digunakan.");
        }

        $payload = [
            'success' => true,
            'name' => $name,
            'password' => $password,
            'service' => $service,
            'profile' => $profile,
            'remote_address' => $remoteAddress,
        ];

        $this->operations[] = ['type' => 'secret_add', 'name' => $name];
        $this->secretPayloads[$name] = $payload;
        $this->secrets[$name] = $payload;

        return $payload;
    }

    public function operationIndex(string $type, string $name): ?int
    {
        foreach ($this->operations as $index => $operation) {
            if (($operation['type'] ?? null) === $type && ($operation['name'] ?? null) === $name) {
                return $index;
            }
        }

        return null;
    }
}
