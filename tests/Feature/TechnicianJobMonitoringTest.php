<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Odp;
use App\Models\TechnicianJob;
use App\Models\User;
use App\Services\TechnicianJobNotificationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TechnicianJobMonitoringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake([
            '*' => Http::response(['success' => true], 200),
        ]);
        Storage::fake('public');
    }

    public function test_technician_without_phone_is_rejected_with_specific_code(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => null]);
        $customer = Customer::create([
            'name' => 'Budi Santoso',
            'phone' => '081234567890',
            'address' => 'Jl. Mawar No. 1',
            'pppoe_username' => 'budi01',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/technician-jobs', [
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Internet Mati Total',
            'description' => 'Lampu PON berkedip merah',
            'customer_id' => $customer->id,
            'technician_ids' => [$tech->id],
        ]);

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'code' => 'TECHNICIAN_MISSING_PHONE',
            ]);
    }

    public function test_updating_technician_phone_succeeds(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => null]);

        $response = $this->actingAs($admin)->putJson("/api/technician-jobs/technicians/{$tech->id}/phone", [
            'phone' => '081298765432',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'user' => [
                    'id' => $tech->id,
                    'phone' => '6281298765432',
                ],
            ]);

        $this->assertEquals('6281298765432', $tech->fresh()->phone);
    }

    public function test_job_created_after_08_am_notifies_immediately(): void
    {
        // Set time to Monday 09:30 AM WIB (Workday)
        Carbon::setTestNow(Carbon::parse('2026-10-19 09:30:00', 'Asia/Jakarta'));

        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $customer = Customer::create([
            'name' => 'Ahmad Dani',
            'phone' => '081234567891',
            'address' => 'Desa Way Urang',
            'pppoe_username' => 'ahmad01',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/technician-jobs', [
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Kabel Putus',
            'description' => 'Tertabrak truk di tiang depan',
            'customer_id' => $customer->id,
            'technician_ids' => [$tech->id],
            'priority' => 'urgent',
        ]);

        $response->assertStatus(201);
        $jobId = $response->json('data.id');
        $job = TechnicianJob::find($jobId);

        $this->assertNotNull($job);
        $this->assertNotNull($job->notified_at);
        $this->assertEquals(TechnicianJob::STATUS_ACTIVE, $job->status);
        $this->assertStringStartsWith('JOB-GP-', $job->job_number);
    }

    public function test_job_created_before_08_am_schedules_notification_for_08_am(): void
    {
        // Set time to Monday 06:45 AM WIB (Workday before 08:00 AM)
        Carbon::setTestNow(Carbon::parse('2026-10-19 06:45:00', 'Asia/Jakarta'));

        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $customer = Customer::create([
            'name' => 'Siti Aminah',
            'phone' => '081234567892',
            'address' => 'Desa Kedaton',
            'pppoe_username' => 'siti01',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/technician-jobs', [
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Redaman Drop',
            'description' => 'Redaman -31 dBm',
            'customer_id' => $customer->id,
            'technician_ids' => [$tech->id],
        ]);

        $response->assertStatus(201);
        $jobId = $response->json('data.id');
        $job = TechnicianJob::find($jobId);

        $this->assertNotNull($job);
        $this->assertNull($job->notified_at);
        $this->assertNotNull($job->scheduled_notify_at);
        $this->assertEquals('08:00:00', $job->scheduled_notify_at->timezone('Asia/Jakarta')->format('H:i:s'));
    }

    public function test_job_created_on_sunday_schedules_notification_for_monday_08_am(): void
    {
        // Set time to Sunday at 09:04 AM WIB (Holiday / Libur)
        Carbon::setTestNow(Carbon::parse('2026-10-18 09:04:00', 'Asia/Jakarta'));
        $this->assertTrue(Carbon::now('Asia/Jakarta')->isSunday());

        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $customer = Customer::create([
            'name' => 'Aji Pauji',
            'phone' => '089502197464',
            'address' => 'Kebun Pisang',
            'pppoe_username' => 'ajipauji',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/technician-jobs', [
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Gangguan Pelanggan',
            'description' => 'Wifinya ga bisa disambungin',
            'customer_id' => $customer->id,
            'technician_ids' => [$tech->id],
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('notification.immediate', false)
            ->assertJsonPath('notification.scheduled_for', '2026-10-19 08:00:00');

        $jobId = $response->json('data.id');
        $job = TechnicianJob::find($jobId);

        $this->assertNotNull($job);
        $this->assertNull($job->notified_at);
        $this->assertNotNull($job->scheduled_notify_at);
        $this->assertEquals('2026-10-19 08:00:00', $job->scheduled_notify_at->timezone('Asia/Jakarta')->format('Y-m-d H:i:s'));
    }

    public function test_morning_reminder_skips_on_sunday(): void
    {
        // 2026-10-18 is a Sunday
        Carbon::setTestNow(Carbon::parse('2026-10-18 08:00:00', 'Asia/Jakarta'));
        $this->assertTrue(Carbon::now('Asia/Jakarta')->isSunday());

        $service = app(TechnicianJobNotificationService::class);
        $result = $service->sendMorningReminders();

        $this->assertTrue($result['skipped']);
        $this->assertStringContainsString('Minggu libur', $result['reason']);
    }

    public function test_morning_reminder_sends_on_monday_for_unfinished_jobs(): void
    {
        // Monday 2026-10-19 at 08:00 AM WIB
        Carbon::setTestNow(Carbon::parse('2026-10-19 08:00:00', 'Asia/Jakarta'));
        $this->assertTrue(Carbon::now('Asia/Jakarta')->isMonday());

        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);

        $job = TechnicianJob::create([
            'job_number' => 'JOB-GP-20261017-0001',
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Pekerjaan Kemarin',
            'description' => 'Belum selesai kemarin',
            'status' => TechnicianJob::STATUS_ACTIVE,
            'created_by' => $admin->id,
        ]);
        $job->created_at = Carbon::parse('2026-10-17 10:00:00', 'Asia/Jakarta');
        $job->saveQuietly();
        $job->technicians()->sync([$tech->id]);

        $service = app(TechnicianJobNotificationService::class);
        $result = $service->sendMorningReminders();

        $this->assertFalse($result['skipped']);
        $this->assertEquals(1, $result['processed_jobs_count']);
        $this->assertNotNull($job->fresh()->last_reminder_at);
    }

    public function test_admin_can_resolve_job_without_proof_or_notes(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $job = TechnicianJob::create([
            'job_number' => 'JOB-GP-20261018-0002',
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Gangguan Sinyal',
            'status' => TechnicianJob::STATUS_ACTIVE,
            'created_by' => $admin->id,
        ]);
        $job->technicians()->sync([$tech->id]);

        $response = $this->actingAs($admin)->postJson("/api/technician-jobs/{$job->id}/resolve");

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $job->id,
                    'status' => TechnicianJob::STATUS_COMPLETED,
                    'completed_by' => $admin->id,
                ],
            ]);

        $this->assertEquals(TechnicianJob::STATUS_COMPLETED, $job->fresh()->status);
    }

    public function test_technician_cannot_resolve_without_proof_and_notes(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $job = TechnicianJob::create([
            'job_number' => 'JOB-GP-20261018-0003',
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Gangguan Sinyal',
            'status' => TechnicianJob::STATUS_ACTIVE,
            'created_by' => $admin->id,
        ]);
        $job->technicians()->sync([$tech->id]);

        // Attempt without file and notes
        $response = $this->actingAs($tech)->postJson("/api/technician-jobs/{$job->id}/resolve", []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['completion_proof', 'completion_notes']);
    }

    public function test_technician_resolves_with_proof_and_notes(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech1 = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $tech2 = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567891']);

        $job = TechnicianJob::create([
            'job_number' => 'JOB-GP-20261018-0004',
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Gangguan 2 Teknisi',
            'status' => TechnicianJob::STATUS_ACTIVE,
            'created_by' => $admin->id,
        ]);
        // Assigned to 2 technicians
        $job->technicians()->sync([$tech1->id, $tech2->id]);

        $fakePhoto = UploadedFile::fake()->image('bukti_pengerjaan.jpg', 600, 600);

        // Tech 1 resolves it
        $response = $this->actingAs($tech1)->post("/api/technician-jobs/{$job->id}/resolve", [
            'completion_notes' => 'Kabel dropcore sudah disambung ulang dengan splicing. Redaman normal -19 dBm.',
            'completion_proof' => $fakePhoto,
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data' => [
                    'id' => $job->id,
                    'status' => TechnicianJob::STATUS_COMPLETED,
                    'completed_by' => $tech1->id,
                ],
            ]);

        $fresh = $job->fresh();
        $this->assertEquals(TechnicianJob::STATUS_COMPLETED, $fresh->status);
        $this->assertNotNull($fresh->completion_proof_url);
        $this->assertEquals('Kabel dropcore sudah disambung ulang dengan splicing. Redaman normal -19 dBm.', $fresh->completion_notes);
    }

    public function test_unassigned_technician_cannot_resolve_job(): void
    {
        $admin = User::factory()->create(['role' => User::ROLE_ADMIN]);
        $tech1 = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $otherTech = User::factory()->create(['role' => User::ROLE_TEKNISI, 'phone' => '081234567899']);

        $job = TechnicianJob::create([
            'job_number' => 'JOB-GP-20261018-0005',
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Gangguan Pelanggan',
            'status' => TechnicianJob::STATUS_ACTIVE,
            'created_by' => $admin->id,
        ]);
        $job->technicians()->sync([$tech1->id]);

        $fakePhoto = UploadedFile::fake()->image('bukti.jpg');
        $response = $this->actingAs($otherTech)->post("/api/technician-jobs/{$job->id}/resolve", [
            'completion_notes' => 'Catatan penyelesaian',
            'completion_proof' => $fakePhoto,
        ]);

        $response->assertStatus(403);
    }

    public function test_copy_text_endpoint_returns_formatted_text(): void
    {
        $admin = User::factory()->create(['name' => 'Admin Utama', 'role' => User::ROLE_ADMIN]);
        $tech = User::factory()->create(['name' => 'Budi Teknisi', 'role' => User::ROLE_TEKNISI, 'phone' => '081234567890']);
        $customer = Customer::create([
            'name' => 'Joko Widodo',
            'phone' => '081122334455',
            'address' => 'Jl. Kalianda No. 12',
            'pppoe_username' => 'joko_kld',
        ]);

        $job = TechnicianJob::create([
            'job_number' => 'JOB-GP-20261018-0006',
            'type' => TechnicianJob::TYPE_GANGGUAN_PELANGGAN,
            'title' => 'Redaman Drop',
            'description' => 'Dropcore terjepit pintu',
            'customer_id' => $customer->id,
            'status' => TechnicianJob::STATUS_ACTIVE,
            'priority' => 'high',
            'created_by' => $admin->id,
        ]);
        $job->technicians()->sync([$tech->id]);

        $response = $this->actingAs($admin)->getJson("/api/technician-jobs/{$job->id}/copy-text");

        $response->assertOk()
            ->assertJsonStructure(['success', 'text']);

        $text = $response->json('text');
        $this->assertStringContainsString('JOB-GP-20261018-0006', $text);
        $this->assertStringContainsString('Joko Widodo', $text);
        $this->assertStringContainsString('Budi Teknisi', $text);
    }
}
