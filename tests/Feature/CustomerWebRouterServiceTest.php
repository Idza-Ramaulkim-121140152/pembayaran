<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Services\CustomerHomeRouterService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CustomerWebRouterServiceTest extends TestCase
{
    public function test_customer_home_router_service_supports_vsol_web_profile(): void
    {
        Http::fake([
            'http://192.168.1.1/' => Http::response('<html><title>V2801RGW</title></html>', 200),
            'https://192.168.1.1:80/' => Http::failedConnection(),
        ]);

        $customer = new Customer([
            'home_router_type' => 'vsol_v2801rgw',
            'home_router_host' => '192.168.1.1',
            'home_router_port' => 80,
            'home_router_username' => 'admin',
            'home_router_password' => 'rumahkita69',
            'home_router_monitoring_enabled' => true,
        ]);

        $snapshot = app(CustomerHomeRouterService::class)->getSnapshot($customer);

        $this->assertTrue($snapshot['reachable']);
        $this->assertSame('vsol_v2801rgw', $snapshot['type']);
        $this->assertSame('VSOL V2801RGW', $snapshot['identity']);
        $this->assertSame('web', $snapshot['management_mode']);
        $this->assertFalse($snapshot['traffic']['available']);
        $this->assertFalse($snapshot['devices']['available']);
    }

    public function test_customer_home_router_service_can_derive_host_from_pppoe_ip(): void
    {
        Http::fake([
            'http://10.1.0.30/' => Http::response('<html><title>Router Home</title></html>', 200),
            'https://10.1.0.30:80/' => Http::failedConnection(),
        ]);

        $customer = new Customer([
            'pppoe_username' => 'KBS-gio',
            'home_router_monitoring_enabled' => false,
        ]);

        $snapshot = app(CustomerHomeRouterService::class)->getSnapshot($customer, [
            'session' => [
                'ip_address' => '10.1.0.30',
            ],
            'secret' => [
                'remote_address' => '10.1.0.30',
            ],
        ]);

        $this->assertTrue($snapshot['enabled']);
        $this->assertTrue($snapshot['configured']);
        $this->assertTrue($snapshot['reachable']);
        $this->assertSame('auto_web_router', $snapshot['type']);
        $this->assertSame('10.1.0.30', $snapshot['host']);
        $this->assertSame('pppoe_remote_address', $snapshot['host_source']);
        $this->assertSame('web', $snapshot['management_mode']);
    }
}
