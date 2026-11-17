<?php

namespace Tests\Feature;

use App\Models\EmployeeAttendance;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceGeofenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_superadmin_can_configure_geofence_and_employee_must_give_reason_when_outside_50m_radius(): void
    {
        $superadmin = User::factory()->create([
            'role' => 'superadmin',
            'is_employee' => false,
        ]);

        $employee = User::factory()->create([
            'role' => 'teknisi',
            'is_employee' => true,
        ]);

        // 1. Superadmin sets allowed office point with 50m radius
        $this->actingAs($superadmin)
            ->postJson('/api/attendance/settings', [
                'work_start_time' => '08:00',
                'work_end_time' => '17:00',
                'monthly_reset_day' => 14,
                'late_tolerance_minutes' => 15,
                'location_name' => 'Kantor Rumah Kita Net',
                'office_latitude' => -5.632728,
                'office_longitude' => 105.548015,
                'location_radius_meters' => 50,
            ])
            ->assertOk()
            ->assertJsonPath('data.settings.location_radius_meters', 50)
            ->assertJsonPath('data.settings.location_geofence_enabled', true);

        // 2. Non-superadmin cannot update attendance settings
        $this->actingAs($employee)
            ->postJson('/api/attendance/settings', [
                'work_start_time' => '08:00',
                'work_end_time' => '17:00',
                'monthly_reset_day' => 14,
                'location_radius_meters' => 500,
            ])
            ->assertStatus(403);

        // 3. Employee outside 50m (~220m away) without outside_location_reason gets 422
        $this->actingAs($employee)
            ->postJson('/api/attendance/clock-in', [
                'latitude' => -5.630728,
                'longitude' => 105.548015,
                'late_reason' => 'Dinas Luar',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['outside_location_reason']);

        // 4. Employee outside 50m WITH outside_location_reason succeeds
        $this->actingAs($employee)
            ->postJson('/api/attendance/clock-in', [
                'latitude' => -5.630728,
                'longitude' => 105.548015,
                'late_reason' => 'Dinas Luar',
                'outside_location_reason' => 'Tugas Lapangan / Pemasangan Pelanggan',
            ])
            ->assertOk()
            ->assertJson([
                'success' => true,
            ]);

        $record = EmployeeAttendance::where('user_id', $employee->id)->firstOrFail();
        $this->assertTrue((bool) $record->clock_in_outside_location);
        $this->assertGreaterThan(50, (float) $record->clock_in_distance_meters);
        $this->assertSame('Tugas Lapangan / Pemasangan Pelanggan', $record->clock_in_outside_reason);

        // 5. Clock out inside 50m radius (~11m away) succeeds without outside_location_reason
        $this->actingAs($employee)
            ->postJson('/api/attendance/clock-out', [
                'latitude' => -5.632828,
                'longitude' => 105.548015,
            ])
            ->assertOk();

        $record->refresh();
        $this->assertFalse((bool) $record->clock_out_outside_location);
        $this->assertLessThanOrEqual(50, (float) $record->clock_out_distance_meters);
        $this->assertNull($record->clock_out_outside_reason);
    }
}
