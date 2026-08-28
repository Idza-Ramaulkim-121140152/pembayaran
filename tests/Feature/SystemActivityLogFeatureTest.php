<?php

namespace Tests\Feature;

use App\Models\SystemAuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SystemActivityLogFeatureTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_dashboard_visit_is_logged(): void
    {
        $user = User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]);

        $this->actingAs($user)->get('/dashboard')->assertOk();

        $this->assertDatabaseHas('system_audit_logs', [
            'actor_id' => $user->id,
            'event_type' => 'activity.page_view',
        ]);

        $log = SystemAuditLog::query()->where('actor_id', $user->id)->latest('id')->firstOrFail();
        $this->assertSame('/dashboard', $log->payload['path'] ?? null);
        $this->assertSame(200, $log->payload['status_code'] ?? null);
    }

    public function test_superadmin_user_creation_logs_sanitized_request_payload(): void
    {
        $superadmin = User::factory()->create([
            'role' => User::ROLE_SUPERADMIN,
        ]);

        $this->actingAs($superadmin)->postJson('/api/users', [
            'name' => 'Audit User',
            'email' => 'audit-user@example.com',
            'password' => 'secret123',
            'role' => User::ROLE_ADMIN,
        ])->assertCreated();

        $requestLog = SystemAuditLog::query()
            ->where('actor_id', $superadmin->id)
            ->where('event_type', 'activity.account_action')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame('/api/users', $requestLog->payload['path'] ?? null);
        $this->assertSame('[REDACTED]', $requestLog->payload['body']['password'] ?? null);

        $this->assertDatabaseHas('system_audit_logs', [
            'actor_id' => $superadmin->id,
            'event_type' => 'user.created',
        ]);
    }

    public function test_system_activity_logs_endpoint_is_superadmin_only(): void
    {
        $admin = User::factory()->create([
            'role' => User::ROLE_ADMIN,
        ]);
        $superadmin = User::factory()->create([
            'role' => User::ROLE_SUPERADMIN,
        ]);

        $this->actingAs($admin)->getJson('/api/system-activity-logs')->assertForbidden();

        SystemAuditLog::query()->create([
            'event_type' => 'activity.page_view',
            'actor_id' => $superadmin->id,
            'payload' => [
                'path' => '/dashboard',
                'method' => 'GET',
                'status_code' => 200,
            ],
        ]);

        $this->actingAs($superadmin)->getJson('/api/system-activity-logs')
            ->assertOk()
            ->assertJsonFragment([
                'event_type' => 'activity.page_view',
            ]);
    }
}
