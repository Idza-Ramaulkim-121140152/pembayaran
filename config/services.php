<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'genieacs' => [
        'url' => env('GENIEACS_URL', env('GENIEACS_API_URL', 'http://10.1.0.5:7557')),
        'api_url' => env('GENIEACS_API_URL', 'http://10.1.0.5:7557'),
        'cwmp_url' => env('GENIEACS_CWMP_URL', 'http://10.1.0.5:7547'),
        'ui_url' => env('GENIEACS_UI_URL', 'http://10.1.0.5:3000'),
        'username' => env('GENIEACS_USERNAME'),
        'password' => env('GENIEACS_PASSWORD'),
        'timeout' => (int) env('GENIEACS_TIMEOUT', 25),
    ],

    'openai' => [
        'api_key' => env('OPENAI_API_KEY'),
        'vision_model' => env('OPENAI_VISION_MODEL', 'gpt-4.1-mini'),
        'payment_vision_model' => env('OPENAI_PAYMENT_VISION_MODEL', 'gpt-4o-mini'),
    ],

    'openrouter' => [
        'api_key' => env('OPENROUTER_API_KEY'),
        'payment_vision_model' => env('OPENROUTER_PAYMENT_VISION_MODEL', 'google/gemini-2.5-flash'),
    ],

    'gemini' => [
        'api_key' => env('GEMINI_API_KEY', env('GOOGLE_API_KEY', env('GOOGLE_GEMINI_API_KEY'))),
        'payment_vision_model' => env('GEMINI_PAYMENT_VISION_MODEL', 'gemini-2.5-flash'),
    ],

    'wa_gateway' => [
        'url' => env('WA_GATEWAY_URL', 'http://localhost:3001'),
        'secret' => env('WA_GATEWAY_SECRET'),
    ],

    'wa_payment_webhook' => [
        'secret' => env('WA_PAYMENT_WEBHOOK_SECRET'),
    ],

    'wa_night_support_webhook' => [
        'secret' => env('WA_NIGHT_SUPPORT_WEBHOOK_SECRET', env('WA_PAYMENT_WEBHOOK_SECRET')),
    ],

    'ipaymu' => [
        'va' => env('IPAYMU_VA'),
        'api_key' => env('IPAYMU_API_KEY'),
        'env' => env('IPAYMU_ENV', 'production'),
    ],

    'prediction' => [
        'python_bin' => env('PREDICTION_PYTHON_BIN', ''),
        'due_health_adjustment_enabled' => filter_var(env('PREDICTION_DUE_HEALTH_ADJUSTMENT_ENABLED', true), FILTER_VALIDATE_BOOL),
        'due_health_force_failure' => filter_var(env('PREDICTION_DUE_HEALTH_FORCE_FAILURE', false), FILTER_VALIDATE_BOOL),
    ],

];
