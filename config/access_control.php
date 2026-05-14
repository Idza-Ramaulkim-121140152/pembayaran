<?php

return [
    'shadow_mode' => env('ACCESS_CONTROL_V1_SHADOW', true),
    'enforce_mode' => env('ACCESS_CONTROL_V1_ENFORCE', false),
    'cache_ttl_seconds' => (int) env('ACCESS_CONTROL_CACHE_TTL', 60),
];
