<?php

namespace Tests\Feature;

use App\Models\AreaOutageIncident;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\MasterMikrotik;
use App\Models\SiteSetting;
use App\Services\AreaOutageMonitorService;
use App\Services\WhatsAppNightSupportService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WhatsAppNightSupportAndNocAdvisorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::preventStrayRequests();
    }

    public function test_night_support_ignores_messages_during_daytime_hours(): void
    {
        Http::fake();

        $customer = Customer::create([
            'name' => 'Budi Santoso',
            'phone' => '081234567890',
            'area_code' => 'KALTAMCJA',
            'pppoe_username' => 'cja-budi',
            'is_active' => true,
        ]);

        // Simulasikan pesan masuk pukul 14:30 WIB (Jam kerja CS manusia 08:00 - 21:00)
        $daytime = Carbon::create(2026, 10, 29, 14, 30, 0, 'Asia/Jakarta');

        $service = app(WhatsAppNightSupportService::class);
        $result = $service->handleInboundMessage([
            'sender_phone' => '081234567890',
            'message' => 'Halo min, internet rumah saya lambat',
            'message_id' => 'MSG-001',
        ], $daytime);

        $this->assertEquals('ignored_daytime', $result['status']);

        // Pastikan TIDAK membuat tiket otomatis (CS manusia yang bertugas)
        $this->assertDatabaseCount('complaints', 0);

        // Pastikan TIDAK ada balasan bot yang dikirim via gateway
        Http::assertNothingSent();
    }

    public function test_night_support_processes_complaint_and_replies_during_night_hours(): void
    {
        Http::fake([
            '*/send' => Http::response(['success' => true], 200),
        ]);

        $customer = Customer::create([
            'name' => 'Ahmad Fauzi',
            'phone' => '081987654321',
            'area_code' => 'KALTAMCJA',
            'pppoe_username' => 'cja-ahmad',
            'odp' => 'ODP-CJA-01',
            'is_active' => true,
        ]);

        // Simulasikan pesan masuk pukul 23:15 WIB (Mode Jaga Malam aktif)
        $nightTime = Carbon::create(2026, 10, 29, 23, 15, 0, 'Asia/Jakarta');

        $service = app(WhatsAppNightSupportService::class);
        $result = $service->handleInboundMessage([
            'sender_phone' => '081987654321',
            'message' => 'Malam admin, internet mati dan lampu LOS di modem kedip merah tolong',
            'message_id' => 'MSG-NIGHT-01',
        ], $nightTime);

        $this->assertEquals('replied', $result['status']);
        $this->assertEquals($customer->id, $result['customer_id']);
        $this->assertNotNull($result['ticket_id']);

        // Tiket otomatis terbuat di database
        $this->assertDatabaseHas('complaints', [
            'customer_id' => $customer->id,
            'category' => 'gangguan',
            'status' => 'pending',
            'priority' => 'high', // Karena ada kata kunci 'los' & 'merah'
        ]);

        $complaint = Complaint::first();
        $this->assertNotNull($complaint->ticket_number);

        // Gateway WA dipanggil untuk mengirim balasan ramah
        Http::assertSent(function ($request) use ($complaint) {
            $body = $request->data();
            return str_contains($request->url(), '/send') &&
                $body['phone'] === '081987654321' &&
                str_contains($body['message'], 'Rumah Kita Net') &&
                str_contains($body['message'], $complaint->ticket_number) &&
                str_contains($body['message'], 'LOS');
        });
    }

    public function test_night_support_enforces_anti_spam_cooldown(): void
    {
        Http::fake([
            '*/send' => Http::response(['success' => true], 200),
        ]);

        $customer = Customer::create([
            'name' => 'Siti Aminah',
            'phone' => '081345678901',
            'area_code' => 'KALTAMCJA',
            'pppoe_username' => 'cja-siti',
            'is_active' => true,
        ]);

        $nightTime = Carbon::create(2026, 10, 29, 22, 0, 0, 'Asia/Jakarta');
        $service = app(WhatsAppNightSupportService::class);

        // Pesan pertama -> Dibalas
        $first = $service->handleInboundMessage([
            'sender_phone' => '081345678901',
            'message' => 'Min internet mati',
            'message_id' => 'MSG-1',
        ], $nightTime);

        $this->assertEquals('replied', $first['status']);
        $this->assertDatabaseCount('complaints', 1);

        // Pesan kedua 2 menit kemudian -> Terkena Cooldown (tidak spamming balasan)
        $second = $service->handleInboundMessage([
            'sender_phone' => '081345678901',
            'message' => 'Halo kok belum dibalas?',
            'message_id' => 'MSG-2',
        ], $nightTime->copy()->addMinutes(2));

        $this->assertEquals('cooldown_active', $second['status']);
        $this->assertDatabaseCount('complaints', 1); // Tetap 1 tiket, tidak duplikat
    }

    public function test_noc_advisor_diagnoses_kabel_putus_when_offline_is_concentrated_on_single_odp(): void
    {
        $service = app(AreaOutageMonitorService::class);

        $areaData = [
            'area_code' => 'KALTAMCJA',
            'total' => 10,
            'inactive_count' => 6,
            'active_count' => 4,
            'inactive_customers' => [
                ['name' => 'P1', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P2', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P3', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P4', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P5', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P6', 'odp' => 'ODP-CJA-02'],
            ],
            'active_customers' => [
                ['name' => 'P7', 'odp' => 'ODP-CJA-01'],
                ['name' => 'P8', 'odp' => 'ODP-CJA-01'],
                ['name' => 'P9', 'odp' => 'ODP-CJA-01'],
                ['name' => 'P10', 'odp' => 'ODP-CJA-01'],
            ],
        ];

        $diagnostic = $service->analyzeIncidentDiagnostic('KALTAMCJA', $areaData, []);

        $this->assertEquals('kabel_putus', $diagnostic['probable_cause']);
        $this->assertEquals('maintenance', $diagnostic['recommended_template']);
        $this->assertGreaterThanOrEqual(85, $diagnostic['confidence_score']);
        $this->assertStringContainsString('ODP-CJA-02', $diagnostic['summary']);
        $this->assertNotEmpty($diagnostic['reasons']);
        $this->assertNotEmpty($diagnostic['recommended_actions']);
    }

    public function test_noc_advisor_diagnoses_pln_power_outage_when_offline_is_spread_across_multiple_odps(): void
    {
        $service = app(AreaOutageMonitorService::class);

        $areaData = [
            'area_code' => 'KALTAMCJA',
            'total' => 12,
            'inactive_count' => 8,
            'active_count' => 4,
            'inactive_customers' => [
                ['name' => 'P1', 'odp' => 'ODP-CJA-01'],
                ['name' => 'P2', 'odp' => 'ODP-CJA-01'],
                ['name' => 'P3', 'odp' => 'ODP-CJA-01'],
                ['name' => 'P4', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P5', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P6', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P7', 'odp' => 'ODP-CJA-03'],
                ['name' => 'P8', 'odp' => 'ODP-CJA-03'],
            ],
            'active_customers' => [
                ['name' => 'P9', 'odp' => 'ODP-CJA-01'],
                ['name' => 'P10', 'odp' => 'ODP-CJA-02'],
                ['name' => 'P11', 'odp' => 'ODP-CJA-03'],
                ['name' => 'P12', 'odp' => 'ODP-CJA-03'],
            ],
        ];

        $diagnostic = $service->analyzeIncidentDiagnostic('KALTAMCJA', $areaData, []);

        $this->assertEquals('pemadaman_listrik', $diagnostic['probable_cause']);
        $this->assertEquals('listrik', $diagnostic['recommended_template']);
        $this->assertGreaterThanOrEqual(80, $diagnostic['confidence_score']);
        $this->assertStringContainsString('PLN', $diagnostic['cause_title']);
    }

    public function test_noc_advisor_diagnoses_multi_area_outage_as_high_confidence_pln(): void
    {
        $service = app(AreaOutageMonitorService::class);

        $areaData = [
            'area_code' => 'KALTAMCJA',
            'total' => 10,
            'inactive_count' => 8,
            'active_count' => 2,
            'inactive_customers' => [
                ['name' => 'P1', 'odp' => 'ODP-01'],
                ['name' => 'P2', 'odp' => 'ODP-01'],
            ],
            'active_customers' => [],
        ];

        // Area tetangga (KALTAMCNS) juga sedang mengalami outage masal
        $allAreas = [
            'KALTAMCJA' => ['area_code' => 'KALTAMCJA', 'is_outage' => true],
            'KALTAMCNS' => ['area_code' => 'KALTAMCNS', 'is_outage' => true],
        ];

        $diagnostic = $service->analyzeIncidentDiagnostic('KALTAMCJA', $areaData, $allAreas);

        $this->assertEquals('pemadaman_listrik', $diagnostic['probable_cause']);
        $this->assertEquals(95, $diagnostic['confidence_score']);
        $this->assertStringContainsString('KALTAMCNS', $diagnostic['summary']);
    }

    public function test_incident_api_delivers_ai_diagnostic_to_frontend(): void
    {
        $service = app(AreaOutageMonitorService::class);
        $service->ensureTableExists();

        $diagnostic = [
            'probable_cause' => 'kabel_putus',
            'cause_title' => 'Kabel Fiber Putus / ODP Spesifik',
            'confidence_score' => 90,
            'summary' => 'Gangguan terpusat pada ODP-CJA-02.',
            'reasons' => ['100% offline pada 1 ODP'],
            'recommended_actions' => ['Kirim teknisi cek kabel ODP'],
            'recommended_template' => 'maintenance',
        ];

        $incident = AreaOutageIncident::create([
            'token' => 'test-token-noc-12345',
            'area_code' => 'KALTAMCJA',
            'total_customers' => 10,
            'active_customers_count' => 4,
            'inactive_customers_count' => 6,
            'inactive_customers_data' => [
                ['id' => 1, 'name' => 'Pelanggan 1', 'odp' => 'ODP-CJA-02', 'is_online' => false],
            ],
            'ai_diagnostic' => $diagnostic,
            'status' => 'detected',
            'alerted_at' => now(),
        ]);

        $response = $this->getJson('/api/area-incident/test-token-noc-12345');

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('incident.ai_diagnostic.probable_cause', 'kabel_putus');
        $response->assertJsonPath('incident.ai_diagnostic.recommended_template', 'maintenance');
        $response->assertJsonPath('incident.ai_diagnostic.confidence_score', 90);
    }

    public function test_night_support_controller_webhook_and_status_routes(): void
    {
        $statusRes = $this->getJson('/api/whatsapp/night-support/status');
        $statusRes->assertStatus(200);
        $statusRes->assertJsonPath('success', true);
        $statusRes->assertJsonStructure(['is_night_shift_active', 'operating_hours']);

        $postRes = $this->postJson('/api/whatsapp/webhooks/night-support', [
            'sender_phone' => '081234567899',
            'message' => 'Tes pesan webhook',
            'message_id' => 'WEBHOOK-TEST-01',
        ]);
        $postRes->assertStatus(200);
        $postRes->assertJsonPath('success', true);
    }
}
