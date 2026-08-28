<?php

return [
    'odp_mapping_v2' => env('FEATURE_ODP_MAPPING_V2', true),
    'billing_items_v1' => env('FEATURE_BILLING_ITEMS_V1', true),
    'ticketing_v2' => env('FEATURE_TICKETING_V2', true),
    'incident_engine_v1' => env('FEATURE_INCIDENT_ENGINE_V1', true),
    'installation_workflow_v1' => env('FEATURE_INSTALLATION_WORKFLOW_V1', true),
    'customer_self_service_v2' => env('FEATURE_CUSTOMER_SELF_SERVICE_V2', true),
    'sla_board_v1' => env('FEATURE_SLA_BOARD_V1', true),
    'odp_quality_score_v1' => env('FEATURE_ODP_QUALITY_SCORE_V1', true),
    'observability_dashboard_v1' => env('FEATURE_OBSERVABILITY_DASHBOARD_V1', true),
];
