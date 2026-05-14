<?php

namespace App\Services;

class FeatureService
{
    public function enabled(string $feature): bool
    {
        return (bool) config('features.' . $feature, false);
    }
}
